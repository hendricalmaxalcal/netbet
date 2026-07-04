require("dotenv").config();
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const BASE_URL = "https://api.football-data.org/v4";

// Free tier covers these + a few others. Codes must match football-data.org exactly.
// "season" pins the request to the season that actually has data — without it,
// the API can silently default to the empty upcoming season once the current
// one has ended, returning zero matches even for a correct date range.
const LEAGUE_CONFIG = {
  epl: { code: "PL", country: "England", label: "Premier League", season: 2025 },
  laliga: { code: "PD", country: "Spain", label: "La Liga", season: 2025 },
  seriea: { code: "SA", country: "Italy", label: "Serie A", season: 2025 },
  bundesliga: { code: "BL1", country: "Germany", label: "Bundesliga", season: 2025 },
  ligue1: { code: "FL1", country: "France", label: "Ligue 1", season: 2025 },
  primeira: { code: "PPL", country: "Portugal", label: "Primeira Liga", season: 2025 },
  brasileirao: { code: "BSA", country: "Brazil", label: "Série A", season: 2025 },
  worldcup: { code: "WC", country: "International", label: "FIFA World Cup" }, // no season param needed
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Auth-Token": TOKEN },
  });
  if (res.status === 429) {
    throw new Error("Rate limited (429) — free tier is 10 requests/minute. Slow down or wait.");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed (${res.status}): ${path} — ${body}`);
  }
  return res.json();
}

// Converts points-per-game + league rank into a 0-100 rating for predictOutcome().
function ratingFromStanding(entry, totalTeams) {
  const pointsPerGame = entry.points / Math.max(entry.playedGames, 1);
  const rankFactor = (totalTeams - entry.position) / totalTeams;
  const raw = pointsPerGame * 20 + rankFactor * 40;
  return Math.round(Math.min(99, Math.max(40, raw)));
}

// football-data.org's form field looks like "W,W,D,L,W" — comma separated.
function parseForm(formString) {
  if (!formString) return [];
  return formString.split(",");
}

async function ingestLeague(leagueKey, config) {
  console.log(`\n=== ${config.label} (${config.country}) ===`);

  await db.collection("leagues").doc(leagueKey).set({
    label: config.label,
    country: config.country,
    sport: "football",
  });

  // Standings -> teams, ratings, form
  // Domestic leagues return one table (type: TOTAL).
  // The World Cup returns one table per group (Group A, B, C...).
  // Flattening across all of them handles both shapes with the same code.
  const standingsResp = await apiFetch(`/competitions/${config.code}/standings`);
  const allEntries = standingsResp.standings.flatMap((s) => s.table);
  const totalTeams = allEntries.length;

  for (const entry of allEntries) {
    const teamId = String(entry.team.id);
    const rating = ratingFromStanding(entry, totalTeams);
    const form = parseForm(entry.form);

    await db.collection("teams").doc(teamId).set({
      name: entry.team.name,
      rating,
      form,
      league: leagueKey,
    });

    console.log(`  ${entry.team.name} — rating ${rating}, form ${form.join("") || "n/a"}`);
  }
  await sleep(6500); // stay under 10 req/min

  // Track which teams we already got real ratings for from standings.
  const seededTeamIds = new Set(allEntries.map((e) => String(e.team.id)));

  // For competitions where standings don't cover every team (e.g. World Cup
  // knockout rounds collapsing group tables), backfill missing teams with a
  // neutral default so matches referencing them don't get silently dropped.
  const teamsResp = await apiFetch(`/competitions/${config.code}/teams`);
  let backfilled = 0;

  for (const team of teamsResp.teams) {
    const teamId = String(team.id);
    if (seededTeamIds.has(teamId)) continue;

    await db.collection("teams").doc(teamId).set({
      name: team.name,
      rating: 65, // neutral placeholder until real standings/rating data exists
      form: [],
      league: leagueKey,
    });
    backfilled++;
  }

  if (backfilled > 0) {
    console.log(`  Backfilled ${backfilled} teams missing from standings (default rating)`);
  }
  await sleep(6500);

  // Matches: pull the full season so far (not just a few days) so there's
  // enough real finished-match history for train.py to work with.
  const dateFrom = "2025-08-01";
  const dateTo = new Date().toISOString().split("T")[0];
  const seasonParam = config.season ? `&season=${config.season}` : "";

  const matchesResp = await apiFetch(
    `/competitions/${config.code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}${seasonParam}`
  );

  let finishedCount = 0;
  let upcomingCount = 0;

  for (const match of matchesResp.matches) {
    const isFinished = match.status === "FINISHED";
    const [datePart, timePartFull] = match.utcDate.split("T");
    const timePart = timePartFull.slice(0, 5);

    await db.collection("matches").doc(`fd_${match.id}`).set(
      {
        date: datePart,
        time: timePart,
        sport: "football",
        league: leagueKey,
        teamA: String(match.homeTeam.id),
        teamB: String(match.awayTeam.id),
        result: isFinished
          ? { h: match.score.fullTime.home, a: match.score.fullTime.away }
          : null,
      },
      { merge: true }
    );

    if (isFinished) finishedCount++;
    else upcomingCount++;
  }

  console.log(`  ${finishedCount} finished, ${upcomingCount} upcoming matches written`);
  await sleep(6500);
}

async function main() {
  await db.collection("sports").doc("football").set({ label: "Football", hasDraws: true });

  for (const [leagueKey, config] of Object.entries(LEAGUE_CONFIG)) {
    try {
      await ingestLeague(leagueKey, config);
    } catch (err) {
      console.error(`Failed to ingest ${leagueKey}:`, err.message);
    }
  }

  console.log("\nIngestion complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});