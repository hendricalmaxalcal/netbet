export const COLORS = {
  bg: "#12151C",
  panel: "#1A1F29",
  panelAlt: "#20252F",
  border: "#2A303C",
  textPrimary: "#F2F1EC",
  textMuted: "#8B92A3",
  amber: "#F2A93B",
  amberDim: "#3A2F1C",
  cyan: "#35C9C1",
  cyanDim: "#1B3230",
  red: "#E2574C",
};

export const SPORTS = {
  football: {
    label: "Football",
    hasDraws: true,
    leagues: {
      epl: {
        label: "Premier League",
        country: "England",
        teams: [
          { id: "mci", name: "Manchester City", rating: 91, form: ["W", "W", "D", "W", "W"] },
          { id: "liv", name: "Liverpool", rating: 89, form: ["W", "L", "W", "W", "D"] },
          { id: "ars", name: "Arsenal", rating: 87, form: ["W", "W", "W", "D", "L"] },
          { id: "che", name: "Chelsea", rating: 82, form: ["D", "L", "W", "W", "D"] },
        ],
        h2h: { "mci-liv": { a: 3, b: 2, results: ["W", "L", "W", "D", "W"] } },
      },
      laliga: {
        label: "La Liga",
        country: "Spain",
        teams: [
          { id: "rma", name: "Real Madrid", rating: 92, form: ["W", "W", "W", "D", "W"] },
          { id: "fcb", name: "Barcelona", rating: 90, form: ["W", "D", "W", "W", "L"] },
          { id: "atm", name: "Atletico Madrid", rating: 85, form: ["D", "W", "L", "W", "W"] },
          { id: "sev", name: "Sevilla", rating: 78, form: ["L", "D", "W", "L", "D"] },
        ],
        h2h: { "rma-fcb": { a: 4, b: 1, results: ["W", "W", "D", "W", "L"] } },
      },
      seriea: {
        label: "Serie A",
        country: "Italy",
        teams: [
          { id: "int", name: "Inter Milan", rating: 88, form: ["W", "W", "D", "W", "W"] },
          { id: "acm", name: "AC Milan", rating: 84, form: ["D", "W", "L", "W", "D"] },
          { id: "juv", name: "Juventus", rating: 83, form: ["W", "D", "D", "L", "W"] },
          { id: "nap", name: "Napoli", rating: 86, form: ["W", "W", "L", "W", "D"] },
        ],
        h2h: {},
      },
    },
  },
  basketball: {
    label: "Basketball",
    hasDraws: false,
    leagues: {
      nba: {
        label: "NBA",
        country: "USA",
        teams: [
          { id: "bos", name: "Boston Celtics", rating: 93, form: ["W", "W", "W", "L", "W"] },
          { id: "den", name: "Denver Nuggets", rating: 90, form: ["W", "L", "W", "W", "W"] },
          { id: "mil", name: "Milwaukee Bucks", rating: 86, form: ["L", "W", "W", "L", "W"] },
          { id: "gsw", name: "Golden State Warriors", rating: 83, form: ["W", "W", "L", "W", "L"] },
        ],
        h2h: { "bos-den": { a: 2, b: 3, results: ["L", "W", "L", "L", "W"] } },
      },
      euroleague: {
        label: "EuroLeague",
        country: "Europe",
        teams: [
          { id: "rmb", name: "Real Madrid Baloncesto", rating: 87, form: ["W", "W", "L", "W", "W"] },
          { id: "fen", name: "Fenerbahce", rating: 85, form: ["W", "L", "W", "W", "D"] },
          { id: "oly", name: "Olympiacos", rating: 82, form: ["L", "W", "W", "L", "W"] },
          { id: "pan", name: "Panathinaikos", rating: 84, form: ["W", "W", "D", "W", "L"] },
        ],
        h2h: {},
      },
    },
  },
};

// Standard normal CDF approximation (Abramowitz & Stegun)
function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return prob;
}

export function predictOutcome(ratingA, ratingB, hasDraws) {
  const diff = ratingA - ratingB;

  if (!hasDraws) {
    const p = 1 / (1 + Math.pow(10, -diff / 12));
    const pHome = Math.round(p * 100);
    return { pHome, pDraw: 0, pAway: 100 - pHome };
  }

  const sigma = 8;
  const drawMargin = 2.5;
  const margin = diff / 2;

  const upper = normalCDF((drawMargin - margin) / sigma);
  const lower = normalCDF((-drawMargin - margin) / sigma);

  const pHome = Math.round((1 - upper) * 100);
  const pDraw = Math.round((upper - lower) * 100);
  const pAway = 100 - pHome - pDraw;

  return { pHome, pDraw, pAway };
}

// Rough placeholder scoreline guess from win probabilities — purely cosmetic
// until the real ML service returns an actual predicted score.
export function predictScoreline(pHome, pDraw, pAway) {
  if (pDraw >= pHome && pDraw >= pAway) return "1 - 1";
  if (pHome > pAway) {
    const gap = pHome - pAway;
    return gap > 40 ? "3 - 0" : gap > 20 ? "2 - 0" : "2 - 1";
  }
  const gap = pAway - pHome;
  return gap > 40 ? "0 - 3" : gap > 20 ? "0 - 2" : "1 - 2";
}