# AI Disease Advisory (Module 15)

## Model

- **Architecture**: MobileNetV2 (`torchvision.models.mobilenet_v2`), chosen for its small size
  and low inference cost — this needs to run affordably on a small hosted FastAPI instance, and
  stay cheap to retrain/iterate on.
- **Training**: done externally in Google Colab, not in this repo. The trained weights (a
  `state_dict`, not a full model pickle) are dropped in at `backend/app/ml/checkpoints/model.pth`.
- **Current status**: `model.pth` in this repo is a **placeholder**, not a real checkpoint —
  `backend/app/services/ai_engine.py` fails to load it on purpose and the `/api/v1/
  disease/predict` endpoint responds with `503` ("AI model not trained yet") until the real
  file replaces it at the same path. No code changes are needed when that happens.
- **Classes**: `backend/app/core/config.py`'s `model_classes` list is a provisional placeholder
  (a handful of representative crop diseases). Replace it with the real label list — in the
  same order as the trained classifier's output layer — once training data is finalized.
- **Accuracy**: unknown/pending — no claims are made anywhere in the UI copy about expected
  accuracy until real evaluation numbers exist.

## Advisory-only framing (§17.2, BR-13)

Every result screen shows a persistent disclaimer: this is an AI advisory, not a replacement
for professional consultation. The "Consult an Expert" action is always available (not gated
behind a low-confidence result), though it's visually emphasized when confidence falls below
`LOW_CONFIDENCE_THRESHOLD` (`src/types/disease.ts`, currently `0.6`).

## Marketplace mapping (§17.4)

The Result screen surfaces up to 5 listings matching the selected crop
(`fetchListings({ cropName })`, reusing the existing `crop_compatibility` filter) under a
"Related Products" heading captioned "these may help — not a guarantee." No product is ever
presented as a specific cure for the predicted disease.

## Data flow

1. Mobile uploads the photo to the public `disease-images` Storage bucket
   (`supabase/migrations/20260901080000_disease_images_bucket.sql`) and inserts a `disease_cases`
   row directly (RLS: `disease_cases_insert_owner`).
2. Mobile calls `POST /api/v1/disease/predict` with `{ disease_case_id }`.
3. The backend (service-role, bypasses RLS) fetches the case, downloads the image by its public
   URL, runs inference, and inserts the `disease_predictions` row — the mobile client never
   inserts predictions directly (`disease_predictions` only grants `select` to `authenticated`,
   per the original Module 4 migration's own comment).
4. Mobile reads the joined case+prediction back via `fetchDiseaseCaseWithPrediction`.
