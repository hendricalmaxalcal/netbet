# Netbet Prediction Service

FastAPI service that predicts match outcomes (home/draw/away probabilities).

Starts out using a statistical formula (rating difference + recent form).
Once `train.py` finds enough finished matches in Firestore, it produces a
real trained model that the API automatically switches to using — no code
change needed, it just checks for `app/model.pkl` on startup.

## Run locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

Test it:
```bash
curl -X POST http://localhost:8080/predict \
  -H "Content-Type: application/json" \
  -d '{"rating_a": 91, "rating_b": 82, "has_draws": true, "form_a": ["W","W","D","W","W"], "form_b": ["D","L","W","W","D"]}'
```

## Train a real model

Copy your `serviceAccountKey.json` (same one from the Node ingestion scripts)
into this directory, then:

```bash
pip install firebase-admin scikit-learn joblib
python train.py
```

If you don't have 30+ finished matches yet for a given draws/no-draws bucket,
it'll tell you and skip — the API keeps using the formula until you do.
Re-run this periodically (e.g. after each ingestion batch) to keep the model
current — there's no automatic retraining trigger yet.

## Deploy to Cloud Run

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud run deploy netbet-prediction-service \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --max-instances 3 \
  --memory 512Mi
```

`--max-instances 3` caps how far this can scale — a safety net so a traffic
spike or bot can't run up a bill, per the free-tier budget discussed earlier.

After deploying, note the service URL Cloud Run gives you (something like
`https://netbet-prediction-service-xxxxx-uc.a.run.app`), and:

1. Add it to `app/main.py`'s CORS `allow_origins` list if it isn't your
   Firebase Hosting domain already, then redeploy.
2. Update the frontend's `src/data/predictions.js` to call this endpoint
   instead of computing the formula client-side (see below).

## Redeploying after training a new model

`model.pkl` needs to ship inside the container, so after running `train.py`
locally, redeploy with the same `gcloud run deploy` command — it'll pick up
the new `app/model.pkl` automatically since it's copied in during the
Docker build.
