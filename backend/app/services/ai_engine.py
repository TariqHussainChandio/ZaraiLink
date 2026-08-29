import io
import logging
from typing import Any

from ..core.config import settings

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
            state_dict = torch.load(settings.model_path, map_location="cpu")
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


# Lazy singleton, loaded once per process. The placeholder `model.pth` fails to load by design,
# so `classifier.available` is False until real Colab-trained weights replace it at the same path
# — no code changes needed then, just a process restart.
classifier = DiseaseClassifier()
