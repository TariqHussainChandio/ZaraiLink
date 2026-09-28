import io
import logging
from typing import Any

from app.config.settings import settings

logger = logging.getLogger(__name__)


class ModelUnavailableError(RuntimeError):
    """Raised when `model.pth` is still the placeholder, otherwise fails to load, or torch/
    torchvision aren't installed in this deployment — all three degrade the same way."""


class DiseaseClassifier:
    """
    torch/torchvision/PIL are imported lazily inside `_load()`, not at module scope — so this
    module (and everything that imports it, i.e. the whole FastAPI app) can still be imported
    and started even in an environment where those heavy ML dependencies aren't installed;
    only this one classifier degrades to `available=False` / `ModelUnavailableError`, matching
    the same graceful-degradation behavior already used for a missing/corrupt `model.pth` file.
    """

    def __init__(self) -> None:
        self._model: Any | None = None
        self._load_error: Exception | None = None
        self._load()

    def _load(self) -> None:
        try:
            import torch
            from torch import nn
            from torchvision import models
        except ImportError as exc:
            logger.warning("Disease model unavailable — torch/torchvision not installed: %s", exc)
            self._load_error = exc
            return

        model = models.mobilenet_v2(weights=None)
        model.classifier[1] = nn.Linear(model.last_channel, len(settings.model_classes))
        try:
            # weights_only=True restricts unpickling to plain tensors/primitives — appropriate
            # here since model.pth is expected to be exactly a state_dict, never a full pickled
            # model object, and avoids torch's arbitrary-code-execution risk on untrusted files.
            state_dict = torch.load(settings.model_path, map_location="cpu", weights_only=True)
            model.load_state_dict(state_dict)
            model.eval()
            self._model = model
        except Exception as exc:  # placeholder file, corrupt checkpoint, shape mismatch, ...
            logger.warning("Disease model unavailable: %s", exc)
            self._load_error = exc

    @property
    def available(self) -> bool:
        return self._model is not None

    def predict(self, image_bytes: bytes) -> tuple[str, float]:
        if self._model is None:
            raise ModelUnavailableError(str(self._load_error) if self._load_error else "model not loaded")

        import torch
        from PIL import Image
        from torchvision import transforms

        # Security fix H2/C2: reject decompression bombs (a small file that decodes to an
        # enormous pixel grid) before Pillow allocates for it. 40M pixels is generous for a phone
        # photo (a 20MP camera shot is ~20M) but well under what a bomb tries to allocate. Raises
        # `Image.DecompressionBombError`, caught alongside `UnidentifiedImageError` by the one
        # caller of this method (ai/service.py:predict).
        Image.MAX_IMAGE_PIXELS = 40_000_000

        transform = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ]
        )

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = transform(image).unsqueeze(0)

        with torch.no_grad():
            logits = self._model(tensor)
            probabilities = torch.softmax(logits, dim=1)[0]
            confidence, index = torch.max(probabilities, dim=0)

        return settings.model_classes[int(index.item())], float(confidence.item())


# P5 (item 3): loading used to happen at *import time* (a bare `classifier = DiseaseClassifier()`
# here), which meant importing this module — which every disease-related import chain does,
# transitively including plenty of tests that never touch a classifier — paid the full checkpoint
# load cost (and, before the real weights existed, built a MobileNetV2 graph) before the app even
# started serving. Loading now happens on first actual use instead: `get_classifier()` is
# idempotent, so it's safe to call from the FastAPI lifespan (the normal path, paying the cost once
# at startup rather than on the first request) or lazily from anywhere else (a standalone test
# importing this module directly, never having run the lifespan) without loading twice.
_classifier: DiseaseClassifier | None = None


def load_classifier() -> DiseaseClassifier:
    global _classifier
    if _classifier is None:
        # A real fine-tuned MobileNetV2 (PlantVillage, 38 classes, ~99.8% validation accuracy) now
        # lives at model.pth; class_names/model_version are read from model_metadata.json via
        # config/settings.py, not hardcoded here. Retraining only requires dropping in new
        # checkpoint/metadata files and restarting the process — no code change needed.
        _classifier = DiseaseClassifier()
    return _classifier


def get_classifier() -> DiseaseClassifier:
    return load_classifier()
