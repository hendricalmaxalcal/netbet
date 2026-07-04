const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const sports = {
  football: { label: "Football", hasDraws: true },
  basketball: { label: "Basketball", hasDraws: false },
};

const leagues = {
  epl: { label: "Premier League", country: "England", sport: "football" },
  laliga: { label: "La Liga", country: "Spain", sport: "football" },
  seriea: { label: "Serie A", country: "Italy", sport: "football" },
  nba: { label: "NBA", country: "USA", sport: "basketball" },
  euroleague: { label: "EuroLeague", country: "Europe", sport: "basketball" },
};

const teams = {
  mci: { name: "Manchester City", rating: 91, form: ["W", "W", "D", "W", "W"], league: "epl" },
  liv: { name: "Liverpool", rating: 89, form: ["W", "L", "W", "W", "D"], league: "epl" },
  ars: { name: "Arsenal", rating: 87, form: ["W", "W", "W", "D", "L"], league: "epl" },
  che: { name: "Chelsea", rating: 82, form: ["D", "L", "W", "W", "D"], league: "epl" },
  rma: { name: "Real Madrid", rating: 92, form: ["W", "W", "W", "D", "W"], league: "laliga" },
  fcb: { name: "Barcelona", rating: 90, form: ["W", "D", "W", "W", "L"], league: "laliga" },
  atm: { name: "Atletico Madrid", rating: 85, form: ["D", "W", "L", "W", "W"], league: "laliga" },
  sev: { name: "Sevilla", rating: 78, form: ["L", "D", "W", "L", "D"], league: "laliga" },
  int: { name: "Inter Milan", rating: 88, form: ["W", "W", "D", "W", "W"], league: "seriea" },
  acm: { name: "AC Milan", rating: 84, form: ["D", "W", "L", "W", "D"], league: "seriea" },
  juv: { name: "Juventus", rating: 83, form: ["W", "D", "D", "L", "W"], league: "seriea" },
  nap: { name: "Napoli", rating: 86, form: ["W", "W", "L", "W", "D"], league: "seriea" },
  bos: { name: "Boston Celtics", rating: 93, form: ["W", "W", "W", "L", "W"], league: "nba" },
  den: { name: "Denver Nuggets", rating: 90, form: ["W", "L", "W", "W", "W"], league: "nba" },
  mil: { name: "Milwaukee Bucks", rating: 86, form: ["L", "W", "W", "L", "W"], league: "nba" },
  gsw: { name: "Golden State Warriors", rating: 83, form: ["W", "W", "L", "W", "L"], league: "nba" },
  rmb: { name: "Real Madrid Baloncesto", rating: 87, form: ["W", "W", "L", "W", "W"], league: "euroleague" },
  fen: { name: "Fenerbahce", rating: 85, form: ["W", "L", "W", "W", "D"], league: "euroleague" },
  oly: { name: "Olympiacos", rating: 82, form: ["L", "W", "W", "L", "W"], league: "euroleague" },
  pan: { name: "Panathinaikos", rating: 84, form: ["W", "W", "D", "W", "L"], league: "euroleague" },
};

const h2hRecords = [
  { league: "epl", a: "mci", b: "liv", aWins: 3, bWins: 2, results: ["W", "L", "W", "D", "W"] },
  { league: "laliga", a: "rma", b: "fcb", aWins: 4, bWins: 1, results: ["W", "W", "D", "W", "L"] },
  { league: "nba", a: "bos", b: "den", aWins: 2, bWins: 3, results: ["L", "W", "L", "L", "W"] },
];

const matches = [
  { date: dateOffset(-3), time: "16:00", sport: "football", league: "epl", teamA: "mci", teamB: "ars", result: { h: 2, a: 1 } },
  { date: dateOffset(-3), time: "18:30", sport: "football", league: "laliga", teamA: "rma", teamB: "sev", result: { h: 1, a: 1 } },
  { date: dateOffset(-2), time: "19:45", sport: "football", league: "seriea", teamA: "int", teamB: "juv", result: { h: 3, a: 0 } },
  { date: dateOffset(-2), time: "20:00", sport: "basketball", league: "nba", teamA: "bos", teamB: "mil", result: { h: 108, a: 101 } },
  { date: dateOffset(-1), time: "17:30", sport: "football", league: "epl", teamA: "liv", teamB: "che", result: { h: 2, a: 2 } },
  { date: dateOffset(-1), time: "20:30", sport: "basketball", league: "euroleague", teamA: "fen", teamB: "oly", result: { h: 85, a: 80 } },
  { date: dateOffset(0), time: "15:00", sport: "football", league: "epl", teamA: "mci", teamB: "che", result: null },
  { date: dateOffset(0), time: "17:30", sport: "football", league: "epl", teamA: "liv", teamB: "ars", result: null },
  { date: dateOffset(0), time: "18:00", sport: "football", league: "laliga", teamA: "rma", teamB: "sev", result: null },
  { date: dateOffset(0), time: "20:00", sport: "football", league: "laliga", teamA: "fcb", teamB: "atm", result: null },
  { date: dateOffset(0), time: "19:00", sport: "basketball", league: "nba", teamA: "bos", teamB: "gsw", result: null },
  { date: dateOffset(1), time: "16:00", sport: "football", league: "seriea", teamA: "int", teamB: "nap", result: null },
  { date: dateOffset(1), time: "19:45", sport: "football", league: "seriea", teamA: "acm", teamB: "juv", result: null },
  { date: dateOffset(1), time: "20:30", sport: "basketball", league: "euroleague", teamA: "rmb", teamB: "fen", result: null },
  { date: dateOffset(2), time: "18:00", sport: "football", league: "laliga", teamA: "fcb", teamB: "sev", result: null },
  { date: dateOffset(2), time: "17:30", sport: "football", league: "epl", teamA: "ars", teamB: "che", result: null },
  { date: dateOffset(2), time: "19:00", sport: "basketball", league: "nba", teamA: "den", teamB: "mil", result: null },
];

async function seed() {
  console.log("Seeding sports...");
  for (const [id, data] of Object.entries(sports)) await db.collection("sports").doc(id).set(data);

  console.log("Seeding leagues...");
  for (const [id, data] of Object.entries(leagues)) await db.collection("leagues").doc(id).set(data);

  console.log("Seeding teams...");
  for (const [id, data] of Object.entries(teams)) await db.collection("teams").doc(id).set(data);

  console.log("Seeding head-to-head records...");
  for (const h of h2hRecords) {
    await db.collection("h2h").doc(`${h.league}_${h.a}_${h.b}`).set(h);
  }

  console.log("Seeding matches...");
  for (const m of matches) await db.collection("matches").add(m);

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});