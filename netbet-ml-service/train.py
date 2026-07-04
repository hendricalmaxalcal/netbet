"""
Trains a real prediction model from finished matches in Firestore.

Run this whenever you want to (re)train — e.g. after a batch of ingestion
runs has added more finished matches with results. It's safe to run
repeatedly; it always retrains from scratch on all available data.

Usage:
    python train.py

Requires serviceAccountKey.json in this directory (same one used by the
Node ingestion scripts — copy it over, or point GOOGLE_APPLICATION_CREDENTIALS
at it).

If there isn't enough labeled data yet, this exits without writing a model,
and the API keeps using the statistical fallback formula — nothing breaks.
"""

import sys
from collections import defaultdict

import firebase_admin
import joblib
import numpy as np
from firebase_admin import credentials, firestore
from sklearn.linear_model import LogisticRegression

MIN_MATCHES_TO_TRAIN = 30  # below this, a model would just be overfitting noise


def form_score(form):
    if not form:
        return 0.5
    points = {"W": 1.0, "D": 0.5, "L": 0.0}
    values = [points.get(r, 0.5) for r in form]
    return sum(values) / len(values)


def outcome_label(result, has_draws):
    if has_draws and result["h"] == result["a"]:
        return "draw"
    return "home" if result["h"] > result["a"] else "away"


def main():
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("Loading sports, teams, and finished matches from Firestore...")

    sports = {doc.id: doc.to_dict() for doc in db.collection("sports").stream()}
    teams = {doc.id: doc.to_dict() for doc in db.collection("teams").stream()}
    matches = [doc.to_dict() for doc in db.collection("matches").stream()]

    finished = [m for m in matches if m.get("result") is not None]
    print(f"Found {len(finished)} finished matches out of {len(matches)} total.")

    # Split by whether the sport allows draws — these need separate models
    # since a 3-class (home/draw/away) and 2-class (home/away) problem
    # aren't the same shape.
    buckets = defaultdict(list)
    for m in finished:
        sport = sports.get(m["sport"], {})
        has_draws = sport.get("hasDraws", False)
        team_a = teams.get(m["teamA"])
        team_b = teams.get(m["teamB"])
        if not team_a or not team_b:
            continue
        buckets["draws" if has_draws else "no_draws"].append((m, team_a, team_b, has_draws))

    model_bundle = {"draws": None, "no_draws": None}
    trained_any = False

    for bucket_name, rows in buckets.items():
        if len(rows) < MIN_MATCHES_TO_TRAIN:
            print(f"  '{bucket_name}' bucket has {len(rows)} matches — "
                  f"need {MIN_MATCHES_TO_TRAIN}+ to train. Skipping.")
            continue

        X, y = [], []
        for m, team_a, team_b, has_draws in rows:
            X.append([
                team_a["rating"] - team_b["rating"],
                form_score(team_a.get("form")),
                form_score(team_b.get("form")),
            ])
            y.append(outcome_label(m["result"], has_draws))

        X = np.array(X)
        clf = LogisticRegression(max_iter=1000,)
        clf.fit(X, y)

        model_bundle[bucket_name] = clf
        trained_any = True
        print(f"  Trained '{bucket_name}' model on {len(rows)} matches. "
              f"Classes: {list(clf.classes_)}")

    if not trained_any:
        print("\nNot enough data anywhere yet — no model written. "
              "The API will keep using the statistical fallback formula.")
        sys.exit(0)

    joblib.dump(model_bundle, "app/model.pkl")
    print("\nSaved trained model to app/model.pkl")


if __name__ == "__main__":
    main()
