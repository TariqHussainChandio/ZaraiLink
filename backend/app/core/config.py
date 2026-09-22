import json
import logging
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent.parent

logger = logging.getLogger(__name__)

_METADATA_PATH = APP_DIR / "ml" / "checkpoints" / "model_metadata.json"

# Used only if model_metadata.json is missing/corrupt — matches the original placeholder-era
# 5-class list so the app still boots. A real checkpoint's classifier head won't match this
# length anyway, so this degrades the same way a missing/corrupt model.pth already does
# (classifier.available -> False via ai_engine.py's own broad except), not a crash.
_FALLBACK_CLASSES = ["healthy", "bacterial_blight", "leaf_rust", "powdery_mildew", "early_blight"]


def _load_model_metadata() -> dict:
    """Reads the trained model's own metadata file, dropped in alongside model.pth by the
    training pipeline. This makes the checkpoint's own record of itself the single source of
    truth for the class list and version string, instead of hand-transcribing ~38 long,
    punctuation-heavy taxonomy strings into this file — a single typo there would silently
    break the positional class mapping in ai_engine.py with no error, just a wrong label."""
    try:
        with open(_METADATA_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not load model_metadata.json (%s) — using placeholder class list.", exc)
        return {}


_metadata = _load_model_metadata()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    # Used to verify incoming user JWTs via GET {supabase_url}/auth/v1/user (core/auth.py) and
    # to build a request-scoped, RLS-respecting client authenticated as the caller
    # (core/supabase_client.py:get_user_scoped_client) — never used to bypass RLS.
    supabase_anon_key: str = ""
    # Bypasses RLS entirely — reserved for the narrow, explicitly documented cases in
    # core/supabase_client.py:get_service_role_client. Never the default DB-access path.
    supabase_service_role_key: str = ""

    # Comma-separated (not JSON — this is a plain .env file) list of origins allowed to make
    # cross-origin browser requests, e.g. the Swagger UI or a future admin web surface. React
    # Native's fetch doesn't send an Origin header the way a browser does, so this has no effect
    # on the mobile app itself; it only matters for browser-based consumers. Defaults cover local
    # dev (Metro, a local web preview) — production deployments must override this explicitly.
    allowed_origins: str = "http://localhost:3000,http://localhost:8081,http://127.0.0.1:3000,http://127.0.0.1:8081"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    model_path: Path = APP_DIR / "ml" / "checkpoints" / "model.pth"

    # Recorded on every disease_predictions row so a prediction is traceable to the weights that
    # produced it. Derived from model_metadata.json (model name + training timestamp + validation
    # accuracy) rather than hardcoded, so it self-updates on every retrain without a code change.
    model_version: str = Field(
        default_factory=lambda: (
            f"{_metadata['model_name']} (trained {_metadata['last_trained_on']}, "
            f"val_acc={_metadata['final_test_accuracy']:.2%})"
            if _metadata
            else "placeholder"
        )
    )

    # Loaded from model_metadata.json's class_names list (same order as the trained classifier's
    # output layer, which ai_engine.py maps positionally) — see _load_model_metadata() above.
    model_classes: list[str] = Field(
        default_factory=lambda: _metadata.get("class_names") or _FALLBACK_CLASSES
    )


settings = Settings()
