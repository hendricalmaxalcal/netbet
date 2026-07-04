require("dotenv").config();
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const API_KEY = process.env.BALLDONTLIE_API_KEY;
const BASE_URL = "https://api.balldontlie.io/nba/v1";
const LEAGUE_KEY = "nba";
const SEASON = 2025;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: API_KEY },
  });
  if (res.status === 429) {
    throw new Error("RATE_LIMITED");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed (${res.status}): ${path} — ${body}`);
  }
  return res.json();
}

// Retries once with a long cooldown if rate limited, instead of dying immediately.
async function apiFetchWithRetry(path) {
  try {
    return await apiFetch(path);
  } catch (err) {
    if (err.message === "RATE_LIMITED") {
      console.log("  Rate limited — cooling down for 60s before retrying...");
      await sleep(60000);
      return await apiFetch(path);
    }
    throw err;
  }
}

function ratingFromWinPct(winPct) {
  const raw = 40 + winPct * 59;
  return Math.round(Math.min(99, Math.max(40, raw)));
}

async function main() {
  console.log("Fetching NBA teams...");
  const teamsResp = await apiFetchWithRetry("/teams");
  const teamsById = {};
  for (const t of teamsResp.data) {
    teamsById[t.id] = { name: t.full_name, wins: 0, losses: 0, recentGames: [] };
  }
  await sleep(2000);

  console.log(`Fetching ${SEASON} season games (paginated)...`);
  let allGames = [];
  let cursor = null;
  let page = 0;
  const MAX_PAGES = 6;

  do {
    const params = new URLSearchParams({
      "seasons[]": SEASON,
      per_page: "100",
    });
    if (cursor) params.set("cursor", cursor);

    const resp = await apiFetchWithRetry(`/games?${params.toString()}`);
    allGames = allGames.concat(resp.data);
    cursor = resp.meta?.next_cursor || null;
    page++;
    console.log(`  Page ${page}: ${resp.data.length} games (${allGames.length} total so far)`);
    await sleep(2000); // slower pace — free tier is stricter than expected
  } while (cursor && page < MAX_PAGES);

  const finishedGames = allGames.filter((g) => g.status === "Final");
  console.log(`\n${finishedGames.length} finished games out of ${allGames.length} fetched.`);

  finishedGames.sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const game of finishedGames) {
    const homeWon = game.home_team_score > game.visitor_team_score;
    const homeId = game.home_team.id;
    const awayId = game.visitor_team.id;

    if (teamsById[homeId]) {
      teamsById[homeId][homeWon ? "wins" : "losses"]++;
      teamsById[homeId].recentGames.push(homeWon ? "W" : "L");
    }
    if (teamsById[awayId]) {
      teamsById[awayId][!homeWon ? "wins" : "losses"]++;
      teamsById[awayId].recentGames.push(!homeWon ? "W" : "L");
    }
  }

  await db.collection("leagues").doc(LEAGUE_KEY).set({
    label: "NBA",
    country: "USA",
    sport: "basketball",
  });

  console.log("\nWriting teams with computed ratings...");
  for (const [teamId, info] of Object.entries(teamsById)) {
    const totalGames = info.wins + info.losses;

    if (totalGames === 0) {
      // Defunct/historical franchise that didn't play this season —
      // remove it if an earlier run already wrote it, and skip otherwise.
      await db.collection("teams").doc(String(teamId)).delete().catch(() => {});
      continue;
    }

    const winPct = info.wins / totalGames;
    const rating = ratingFromWinPct(winPct);
    const form = info.recentGames.slice(-5);

    await db.collection("teams").doc(String(teamId)).set({
      name: info.name,
      rating,
      form,
      league: LEAGUE_KEY,
    });
    console.log(`  ${info.name} — ${info.wins}-${info.losses}, rating ${rating}, form ${form.join("")}`);
  }

  console.log("\nWriting matches...");
  let written = 0;
  for (const game of finishedGames) {
    await db.collection("matches").doc(`bdl_${game.id}`).set(
      {
        date: game.date,
        time: "00:00",
        sport: "basketball",
        league: LEAGUE_KEY,
        teamA: String(game.home_team.id),
        teamB: String(game.visitor_team.id),
        result: { h: game.home_team_score, a: game.visitor_team_score },
      },
      { merge: true }
    );
    written++;
  }
  console.log(`${written} finished matches written.`);

  console.log("\nIngestion complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});