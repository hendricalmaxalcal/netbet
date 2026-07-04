from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.model import predict_outcome, using_trained_model

app = FastAPI(title="Netbet Prediction Service")

# Allow the deployed frontend + local dev to call this directly from the browser.
# Replace the placeholder with your actual Firebase Hosting URL once deployed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://netbet-794ad.web.app",
        "https://netbet-794ad.firebaseapp.com",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    rating_a: float = Field(..., ge=0, le=100)
    rating_b: float = Field(..., ge=0, le=100)
    has_draws: bool = True
    form_a: list[str] | None = None
    form_b: list[str] | None = None


class PredictResponse(BaseModel):
    pHome: int
    pDraw: int
    pAway: int
    modelType: str


@app.get("/")
def root():
    return {
        "service": "netbet-prediction-service",
        "status": "ok",
        "using_trained_model": using_trained_model(),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    result = predict_outcome(
        rating_a=req.rating_a,
        rating_b=req.rating_b,
        has_draws=req.has_draws,
        form_a=req.form_a,
        form_b=req.form_b,
    )
    result["modelType"] = "trained" if using_trained_model() else "formula"
    return result
