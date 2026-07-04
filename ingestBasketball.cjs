const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Public free key — no signup required. Shared by all free-tier users.
const FREE_KEY = "123";
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${FREE_KEY}`;

// TheSportsDB league IDs — find more by browsing thesportsdb.com/sport/leagues
const LEAGUE_CONFIG = {
  nba: { id: "4387", name: "NBA", country: "USA", label: "NBA" },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (res.status === 429) {
    throw new Error("Rate limited (429) — free tier is 30 requests/minute.");
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}): ${path}`);
  }
  return res.json();
}

function ratingFromStanding(entry, totalTeams) {
  const played = parseInt(entry.intPlayed, 10) || 0;
  const points = parseInt(entry.intPoints, 10) || 0;
  const rank = parseInt(entry.intRank, 10) || totalTeams;
  const pointsPerGame = points / Math.max(played, 1);
  const rankFactor = (totalTeams - rank) / totalTeams;
  const raw = pointsPerGame * 15 + rankFactor * 40;
  return Math.round(Math.min(99, Math.max(40, raw)));
}

// TheSportsDB's form string looks like "wwlwd" — lowercase, no separators.
function parseForm(formString) {
  if (!formString) return [];
  return formString.toUpperCase().split("");
}

async function ingestLeague(leagueKey, config) {
  console.log(`\n=== ${config.label} (${config.country}) ===`);

  await db.collection("leagues").doc(leagueKey).set({
    label: config.label,
    country: config.country,
    sport: "basketball",
  });

  // Standings — free tier caps this at 5 rows, regardless of league size.
  let standingsRows = [];
  try {
    const standingsResp = await apiFetch(`/lookuptable.php?l=${config.id}`);
    standingsRows = standingsResp.table || [];
  } catch (err) {
    console.log(`  Standings unavailable: ${err.message}`);
  }
  await sleep(2200); // ~30 req/min free limit

  const totalTeams = standingsRows.length || 1;
  const seededTeamIds = new Set();

  for (const entry of standingsRows) {
    const teamId = String(entry.idTeam);
    const rating = ratingFromStanding(entry, totalTeams);
    const form = parseForm(entry.strForm);

    await db.collection("teams").doc(teamId).set({
      name: entry.strTeam,
      rating,
      form,
      league: leagueKey,
    });
    seededTeamIds.add(teamId);

    console.log(`  ${entry.strTeam} — rating ${rating}, form ${form.join("") || "n/a"}`);
  }

  // Backfill remaining teams (free tier only gave us up to 5 with real ratings)
  // using the team list endpoint, capped at 10 on the free key.
  const teamsResp = await apiFetch(`/search_all_teams.php?l=${config.name}`);
  const allTeams = teamsResp.teams || [];
  let backfilled = 0;

  for (const team of allTeams) {
    const teamId = String(team.idTeam);
    if (seededTeamIds.has(teamId)) continue;

    await db.collection("teams").doc(teamId).set({
      name: team.strTeam,
      rating: 65,
      form: [],
      league: leagueKey,
    });
    backfilled++;
  }

  if (backfilled > 0) {
    console.log(`  Backfilled ${backfilled} teams without standings data (default rating)`);
  }
  await sleep(2200);

  // Matches — free tier caps next/previous at 1 event each per league.
  let upcomingCount = 0;
  let finishedCount = 0;

  try {
    const nextResp = await apiFetch(`/eventsnextleague.php?id=${config.id}`);
    for (const event of nextResp.events || []) {
      await db.collection("matches").doc(`tsdb_${event.idEvent}`).set(
        {
          date: event.dateEvent,
          time: (event.strTime || "00:00").slice(0, 5),
          sport: "basketball",
          league: leagueKey,
          teamA: String(event.idHomeTeam),
          teamB: String(event.idAwayTeam),
          result: null,
        },
        { merge: true }
      );
      upcomingCount++;
    }
  } catch (err) {
    console.log(`  Upcoming events unavailable: ${err.message}`);
  }
  await sleep(2200);

  try {
    const pastResp = await apiFetch(`/eventspastleague.php?id=${config.id}`);
    for (const event of pastResp.events || []) {
      const hasScore = event.intHomeScore !== null && event.intAwayScore !== null;
      await db.collection("matches").doc(`tsdb_${event.idEvent}`).set(
        {
          date: event.dateEvent,
          time: (event.strTime || "00:00").slice(0, 5),
          sport: "basketball",
          league: leagueKey,
          teamA: String(event.idHomeTeam),
          teamB: String(event.idAwayTeam),
          result: hasScore
            ? { h: parseInt(event.intHomeScore, 10), a: parseInt(event.intAwayScore, 10) }
            : null,
        },
        { merge: true }
      );
      if (hasScore) finishedCount++;
    }
  } catch (err) {
    console.log(`  Past events unavailable: ${err.message}`);
  }

  console.log(`  ${finishedCount} finished, ${upcomingCount} upcoming matches written`);
  await sleep(2200);

  // Bulk historical backfill — up to 15 events per call, but chronological
  // from season start, so these are early-season games, not recent ones.
  // Won't appear in the homepage's current day-window filters, but adds
  // real historical data to Firestore for a future "browse by date" view.
  try {
    const seasonResp = await apiFetch(`/eventsseason.php?id=${config.id}&s=2025-2026`);
    let seasonWritten = 0;

    for (const event of (seasonResp.events || []).slice(0, 15)) {
      const hasScore = event.intHomeScore !== null && event.intAwayScore !== null;
      await db.collection("matches").doc(`tsdb_${event.idEvent}`).set(
        {
          date: event.dateEvent,
          time: (event.strTime || "00:00").slice(0, 5),
          sport: "basketball",
          league: leagueKey,
          teamA: String(event.idHomeTeam),
          teamB: String(event.idAwayTeam),
          result: hasScore
            ? { h: parseInt(event.intHomeScore, 10), a: parseInt(event.intAwayScore, 10) }
            : null,
        },
        { merge: true }
      );
      seasonWritten++;
    }
    console.log(`  ${seasonWritten} additional season-history matches written`);
  } catch (err) {
    console.log(`  Season history unavailable: ${err.message}`);
  }
  await sleep(2200);
}

async function main() {
  await db.collection("sports").doc("basketball").set({ label: "Basketball", hasDraws: false });

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