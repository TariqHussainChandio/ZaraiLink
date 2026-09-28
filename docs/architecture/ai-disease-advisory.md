# AI Disease Advisory (Module 15)

## Model

- **Architecture**: MobileNetV2 (`torchvision.models.mobilenet_v2`), chosen for its small size
  and low inference cost — this needs to run affordably on a small hosted FastAPI instance, and
  stay cheap to retrain/iterate on.
- **Training**: fine-tuned externally on the PlantVillage dataset (two-stage: a frozen-backbone
  warmup, then a full unfreeze — see `training_history_stage1_best_val_acc`/`stage2_best_val_acc`
  in the metadata below), not in this repo. The trained weights (a `state_dict`, not a full model
  pickle) live at `backend/app/ai/checkpoints/model.pth`, loaded with `weights_only=True` (safe
  against arbitrary pickle code execution, since a plain state_dict never needs anything else).
- **Current status**: real, live, and loading successfully — `classifier.available` is `True`.
  `POST /api/v1/disease/predict` returns real 38-class predictions, not the earlier placeholder's
  designed-to-fail `503`.
- **Classes**: 38 real PlantVillage classes (14 crops × disease/healthy variants), loaded at
  startup from `backend/app/ai/checkpoints/model_metadata.json`'s `class_names` list — not
  hardcoded in `config/settings.py` anymore. This makes the checkpoint's own metadata file the single
  source of truth for the class list (and, see below, the version string): a future retrain only
  needs new `model.pth`/`class_names.json`/`model_metadata.json` files dropped in at the same
  path, no code change. If `model_metadata.json` is missing/corrupt, `config/settings.py` falls back
  to the original 5-class placeholder list, which degrades the same way a missing/corrupt
  `model.pth` already does (`classifier.available` → `False`), not a crash.
- **Model version**: `settings.model_version` is likewise derived from `model_metadata.json`
  (`model_name` + `last_trained_on` + `final_test_accuracy`), e.g.
  `"MobileNetV2_PlantDisease_Classifier (trained 2026-09-19 18:07:03, val_acc=99.81%)"` — recorded
  on every `disease_predictions` row, so a prediction is traceable to exactly the weights that
  produced it without a manual version bump per retrain.
- **Display labels**: the model's raw output classes are taxonomy strings like
  `"Tomato___Late_blight"` — not shown to users as-is. `disease_service._humanize_class_name()`
  converts these to farmer-facing labels (e.g. `"Tomato — Late blight"`) at the point the API
  response/DB row is composed, so both frontend consumers (the result screen and the
  expert-consultation handoff subject line) get a clean label with no frontend changes needed.
  The `DESCRIPTIONS` lookup happens against the **raw** label first, before humanizing — the two
  must not be reordered, or every lookup would miss.
- **Per-class copy**: `backend/app/ai/service.py`'s `DESCRIPTIONS` dict has a real, non-empty
  description/recommended-actions entry for all 38 raw classes (a
  `test_descriptions_covers_every_configured_model_class` regression test enforces this stays
  true as `model_classes` changes). Any class not yet in `DESCRIPTIONS` — e.g. after a future
  retrain adds a new class before this dict is updated — falls back to a real, non-empty
  `DEFAULT_DESCRIPTION` ("consult an expert"), never the old silent `(None, [])`.
- **Accuracy**: 99.81% final test accuracy per `model_metadata.json` on the PlantVillage
  validation split — not independently re-verified against real farmer-submitted photos in this
  repo, which typically differ from PlantVillage's clean, single-leaf lab photos (lighting,
  background clutter, multiple leaves, disease co-occurrence). No accuracy claim is surfaced in
  the app's own UI copy.

## Advisory-only framing (§17.2, BR-13)

Every result screen shows a persistent disclaimer: this is an AI advisory, not a replacement
for professional consultation. The "Consult an Expert" action is always available (not gated
behind a low-confidence result), though it's visually emphasized when confidence falls below
`LOW_CONFIDENCE_THRESHOLD` (`frontend/ai/types/disease.ts`, currently `0.6`).

## Marketplace mapping (§17.4)

The Result screen surfaces up to 5 listings matching the selected crop
(`fetchListings({ cropName })`, reusing the existing `crop_compatibility` filter) under a
"Related Products" heading captioned "these may help — not a guarantee." No product is ever
presented as a specific cure for the predicted disease.

## Data flow

1. Mobile uploads the photo to the **private** `disease-images` Storage bucket
   (`supabase/migrations/20260901080000_disease_images_bucket.sql`, made private by
   `20260922080100_disease_images_private.sql` — security fix C2), then calls
   `POST /api/v1/disease/cases` (`diseaseService.createDiseaseCase`) with the object's storage
   **path**, never a URL. `CreateCaseRequest.storage_path` (`backend/app/ai/schemas.py`) is
   regex-validated to a single `<folder>/<filename>` shape, and `disease_service.create_case`
   additionally checks the folder segment equals the caller's own id — a client can never point a
   case at another user's uploaded object. Previously the client sent the bucket's *public* URL
   directly and predict() fetched it server-side; P0 proved that was a blind SSRF (the server
   could be made to fetch its own gateway/itself). The row itself is written backend-side via
   `disease_repository.create_case`, which uses the service-role client — the original Module 4
   migration's `disease_cases_insert_owner` RLS policy still exists and would allow a direct
   client insert, but the app doesn't take that path; the backend is the sole writer today (see
   the "Model integration" section of [backend-architecture.md](backend-architecture.md) for why
   this domain is the one place service-role is used). Every response (`DiseaseCaseResponse`)
   carries `image_signed_url` — a short-lived signed URL minted fresh by
   `disease_repository.create_signed_url`, never the stored path — matching the pattern already
   used for `expert-documents` (`expert_repository.create_document_signed_url`).
2. Mobile calls `POST /api/v1/disease/predict` with `{ disease_case_id }` (rate-limited to
   10/minute per IP — tighter than every other endpoint's 200/minute default, since this is the
   one call that actually runs model inference; see backend-architecture.md's
   "Request-level middleware" section).
3. The backend (service-role) fetches the case, downloads the image through the Storage API by
   its `storage_path` (`disease_repository.download_case_image` — never an outbound HTTP fetch of
   a client-supplied value), rejects it before decoding if it's over 8 MB or exceeds Pillow's
   decompression-bomb pixel limit, runs inference, and inserts the `disease_predictions` row — the
   mobile client never inserts predictions directly (`disease_predictions` only grants `select` to
   `authenticated`, per the
   original Module 4 migration's own comment).
4. Mobile reads the joined case+prediction back via `GET /api/v1/disease/cases/{id}`
   (`diseaseService.fetchDiseaseCaseWithPrediction`) — backend-mediated like the other two calls,
   not a direct Supabase read.

## Testing

`backend/tests/ai/test_disease_service.py` mocks the classifier (`app.ai.service.get_classifier`) entirely — it verifies
ownership/authorization/error-handling logic and is intentionally insensitive to whether a real
model is loaded, plus table-driven coverage of `_humanize_class_name` and the `DESCRIPTIONS`
fallback behavior. The one suite that exercises the **real** checkpoint through **real**
torch/torchvision is `backend/tests/integration/test_ai_engine_real_checkpoint.py` — it confirms
`classifier.available is True` and that `model_classes` was actually loaded from
`model_metadata.json` (not the old placeholder), which the mocked unit tests can't prove. A third
test in that file — running an actual leaf photo through the model — is skipped until a real,
license-clean sample image is added at `backend/tests/fixtures/sample_leaf.jpg`.
