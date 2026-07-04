// Replace src/data/predictions.js with this version.

const PREDICTION_SERVICE_URL = "https://YOUR-CLOUD-RUN-URL.a.run.app";

// Kept as a local fallback in case the service is unreachable (e.g. offline,
// cold start timeout, or before you've deployed it yet) — same formula as
// before, so the app never breaks even if the network call fails.
function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return prob;
}

function localFallbackPredict(ratingA, ratingB, hasDraws) {
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

// Now async — calls the real prediction service, falls back locally on any error.
export async function predictOutcome(ratingA, ratingB, hasDraws, formA = [], formB = []) {
  try {
    const res = await fetch(`${PREDICTION_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating_a: ratingA,
        rating_b: ratingB,
        has_draws: hasDraws,
        form_a: formA,
        form_b: formB,
      }),
    });
    if (!res.ok) throw new Error(`Prediction service returned ${res.status}`);
    const data = await res.json();
    return { pHome: data.pHome, pDraw: data.pDraw, pAway: data.pAway };
  } catch (err) {
    console.warn("Prediction service unreachable, using local fallback:", err.message);
    return localFallbackPredict(ratingA, ratingB, hasDraws);
  }
}

export function predictScoreline(pHome, pDraw, pAway) {
  if (pDraw >= pHome && pDraw >= pAway) return "1 - 1";
  if (pHome > pAway) {
    const gap = pHome - pAway;
    return gap > 40 ? "3 - 0" : gap > 20 ? "2 - 0" : "2 - 1";
  }
  const gap = pAway - pHome;
  return gap > 40 ? "0 - 3" : gap > 20 ? "0 - 2" : "1 - 2";
}