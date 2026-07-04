"""
Prediction logic for match outcomes.

Two modes, chosen automatically:
  1. Trained model (model.pkl) — used once train.py has produced one from
     real historical results in Firestore.
  2. Statistical fallback — a rating-difference formula (same shape as the
     original JS version in the frontend), used when no trained model
     exists yet, or for any sport/league that doesn't have enough labeled
     history to train on.

This means the API never breaks or returns nonsense just because training
data is thin — it degrades gracefully to the same formula the frontend
used to compute client-side.
"""

import math
import os
from pathlib import Path

import joblib
import numpy as np

MODEL_PATH = Path(__file__).parent / "model.pkl"

_model = None
_model_loaded = False


def _load_model():
    global _model, _model_loaded
    if _model_loaded:
        return _model
    _model_loaded = True
    if MODEL_PATH.exists():
        try:
            _model = joblib.load(MODEL_PATH)
            print(f"Loaded trained model from {MODEL_PATH}")
        except Exception as e:
            print(f"Failed to load model.pkl, falling back to formula: {e}")
            _model = None
    else:
        print("No trained model found — using statistical fallback formula")
    return _model


def _normal_cdf(z: float) -> float:
    """Standard normal CDF via the error function (exact, not an approximation)."""
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def _form_score(form: list[str]) -> float:
    """Converts a form list like ['W','L','D'] into a 0-1 win-rate style score."""
    if not form:
        return 0.5
    points = {"W": 1.0, "D": 0.5, "L": 0.0}
    values = [points.get(r, 0.5) for r in form]
    return sum(values) / len(values)


def _formula_predict(rating_a: float, rating_b: float, has_draws: bool,
                      form_a: list[str] | None = None, form_b: list[str] | None = None):
    """The statistical fallback — same shape as the original frontend formula,
    lightly enhanced to also weigh in recent form, not just static rating."""
    form_a_score = _form_score(form_a or [])
    form_b_score = _form_score(form_b or [])

    # Blend rating (main signal) with recent form (secondary signal).
    adjusted_diff = (rating_a - rating_b) + (form_a_score - form_b_score) * 10

    if not has_draws:
        p = 1 / (1 + math.pow(10, -adjusted_diff / 12))
        p_home = round(p * 100)
        return {"pHome": p_home, "pDraw": 0, "pAway": 100 - p_home}

    sigma = 8
    draw_margin = 2.5
    margin = adjusted_diff / 2

    upper = _normal_cdf((draw_margin - margin) / sigma)
    lower = _normal_cdf((-draw_margin - margin) / sigma)

    p_home = round((1 - upper) * 100)
    p_draw = round((upper - lower) * 100)
    p_away = 100 - p_home - p_draw

    return {"pHome": p_home, "pDraw": p_draw, "pAway": p_away}


def _model_predict(model_bundle, rating_a: float, rating_b: float, has_draws: bool,
                    form_a: list[str] | None, form_b: list[str] | None):
    """Uses the trained scikit-learn model if the sport/has_draws combination
    matches what it was trained on, otherwise falls back to the formula."""
    classifier = model_bundle.get("draws" if has_draws else "no_draws")
    if classifier is None:
        return _formula_predict(rating_a, rating_b, has_draws, form_a, form_b)

    features = np.array([[
        rating_a - rating_b,
        _form_score(form_a or []),
        _form_score(form_b or []),
    ]])

    probs = classifier.predict_proba(features)[0]
    classes = list(classifier.classes_)

    def pct(label):
        return round(probs[classes.index(label)] * 100) if label in classes else 0

    p_home = pct("home")
    p_draw = pct("draw") if has_draws else 0
    p_away = 100 - p_home - p_draw

    return {"pHome": p_home, "pDraw": p_draw, "pAway": p_away}


def predict_outcome(rating_a: float, rating_b: float, has_draws: bool,
                     form_a: list[str] | None = None, form_b: list[str] | None = None):
    model_bundle = _load_model()
    if model_bundle is not None:
        return _model_predict(model_bundle, rating_a, rating_b, has_draws, form_a, form_b)
    return _formula_predict(rating_a, rating_b, has_draws, form_a, form_b)


def using_trained_model() -> bool:
    return _load_model() is not None
