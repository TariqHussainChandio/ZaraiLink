"""
The one test suite that loads the REAL model.pth checkpoint through REAL torch/torchvision —
deliberately kept out of the unit tests (tests/ai/), which mock the classifier entirely at the disease_service
boundary and would keep passing even if model.pth were still the original 540-byte placeholder.
This is what actually proves the real model swap works end to end.

Requires torch/torchvision, which are pinned in backend/pyproject.toml and installed by `uv sync`, so
this runs in CI automatically (the `backend` and `database` jobs in .github/workflows/ci.yml).
"""

from pathlib import Path

import pytest

from app.ai.engine import get_classifier
from app.config.settings import settings

FIXTURE_PATH = Path(__file__).parent.parent / "fixtures" / "sample_leaf.jpg"


def test_classifier_loads_the_real_checkpoint():
    # If this is False, either model.pth is missing/corrupt/placeholder again, or its shape no
    # longer matches settings.model_classes (config/settings.py) — see the warning ai/engine.py logs.
    # get_classifier() loads on first call (P5, item 3 — no more import-time loading), so this is
    # also the test that actually exercises the real checkpoint load, not just a cached singleton.
    assert get_classifier().available is True


def test_model_classes_loaded_from_real_metadata_not_the_old_placeholder():
    # Regression guard: confirms config/settings.py is actually reading model_metadata.json and not
    # silently falling back to the old 5-item placeholder list.
    assert len(settings.model_classes) == 38
    assert "Tomato___Late_blight" in settings.model_classes
    assert "healthy" not in settings.model_classes  # the old placeholder's exact class string


@pytest.mark.skipif(
    not FIXTURE_PATH.exists(),
    reason=(
        f"No real sample leaf photo at {FIXTURE_PATH} yet — add one (any real, license-clean "
        "leaf photo) to exercise the model against an actual image. Structural correctness "
        "(checkpoint loads, correct shape) is already covered by the tests above without one."
    ),
)
def test_classifier_predicts_a_known_class_for_a_real_leaf_photo():
    image_bytes = FIXTURE_PATH.read_bytes()
    predicted_disease, confidence = get_classifier().predict(image_bytes)
    # Structural assertions only (valid class, valid confidence range) rather than one exact
    # predicted label, so this doesn't flake in CI on an arbitrary photo's real model uncertainty.
    assert predicted_disease in settings.model_classes
    assert 0.0 <= confidence <= 1.0
