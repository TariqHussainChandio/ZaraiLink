import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent.parent

logger = logging.getLogger(__name__)

_METADATA_PATH = APP_DIR / "ai" / "checkpoints" / "model_metadata.json"

# Used only if model_metadata.json is missing/corrupt — matches the original placeholder-era
# 5-class list so the app still boots. A real checkpoint's classifier head won't match this
# length anyway, so this degrades the same way a missing/corrupt model.pth already does
# (classifier.available -> False via ai/engine.py's own broad except), not a crash.
_FALLBACK_CLASSES = ["healthy", "bacterial_blight", "leaf_rust", "powdery_mildew", "early_blight"]


def _load_model_metadata() -> dict:
    """Reads the trained model's own metadata file, dropped in alongside model.pth by the
    training pipeline. This makes the checkpoint's own record of itself the single source of
    truth for the class list and version string, instead of hand-transcribing ~38 long,
    punctuation-heavy taxonomy strings into this file — a single typo there would silently
    break the positional class mapping in ai/engine.py with no error, just a wrong label."""
    try:
        with open(_METADATA_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not load model_metadata.json (%s) — using placeholder class list.", exc)
        return {}


_metadata = _load_model_metadata()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Defaults to "" (not omitted) so pydantic-settings' generated `__init__` stays a plain
    # zero-arg call for mypy — the actual fail-fast behavior comes from `_not_empty` below, which
    # runs regardless of whether a value reached this field via .env, a real env var, or the
    # default: an empty string is rejected either way. A missing/incomplete .env must fail at
    # Settings() construction, not boot successfully and fail confusingly on the first request
    # that needs a real client (P5, item 3 — "fail-fast config").
    supabase_url: str = ""
    # Builds a request-scoped, RLS-respecting client authenticated as the caller
    # (database/supabase_client.py:get_user_scoped_client) and the anon-role public client — never
    # used to bypass RLS. (JWT verification itself is local, against Supabase's JWKS —
    # auth/jwt_verifier.py — not this key.)
    supabase_anon_key: str = ""
    # Bypasses RLS entirely — reserved for the narrow, explicitly documented cases in
    # database/supabase_client.py:get_service_role_client. Never the default DB-access path.
    supabase_service_role_key: str = ""

    # Gates docs exposure (main.py) and response verbosity (e.g. /health/ready's error detail) —
    # never used to gate a security control itself (RLS/auth apply identically in both).
    environment: Literal["development", "production"] = "development"

    # Ceiling applied to every route that has no tighter `@limiter.limit` (middleware/rate_limit.py). Settable so
    # the proxy-header test can use a small number instead of firing 200 requests.
    rate_limit_default: str = "200/minute"

    # Empty means error tracking is off (common/observability.py). Public identifier, not a secret, but it
    # still comes from the environment so each deployment reports to its own Sentry project.
    sentry_dsn: str = ""

    # Outgoing email (common/email.py): the approval and rejection emails of SRDS §8, §9 and §11. Off unless a
    # deployment turns it on, so nothing is sent from an environment nobody configured. Locally it points at the mail
    # catcher of the Supabase stack (Mailpit, SMTP on 54325); the hosted API gets its own provider's values, from the
    # host's secrets, after gate G1 (docs/process/briefs/g1-smtp.md). The password never has a default.
    email_enabled: bool = False
    smtp_host: str = "127.0.0.1"
    smtp_port: int = 54325
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_from: str = "ZaraiLink <no-reply@zarailink.local>"
    # STARTTLS before signing in; on for a real provider (Gmail 587), off for the local mail catcher.
    smtp_starttls: bool = False

    @field_validator("supabase_url", "supabase_anon_key", "supabase_service_role_key")
    @classmethod
    def _not_empty(cls, value: str, info) -> str:
        # A field merely being *present* in .env doesn't mean it's usable — an env file can (and,
        # on this repo, once did) define a key with no value at all, which pydantic accepts as a
        # valid empty string rather than "missing." That silently produces a Supabase client with
        # a blank key instead of failing where the mistake actually is: here, at boot.
        if not value.strip():
            raise ValueError(f"{info.field_name} must not be empty — check your .env file")
        return value

    @field_validator("supabase_url")
    @classmethod
    def _url_has_scheme(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("supabase_url must start with http:// or https://")
        return value

    # Comma-separated (not JSON — this is a plain .env file) list of origins allowed to make
    # cross-origin browser requests, e.g. the Swagger UI or a future admin web surface. React
    # Native's fetch doesn't send an Origin header the way a browser does, so this has no effect
    # on the mobile app itself; it only matters for browser-based consumers. Defaults cover local
    # dev (Metro, a local web preview) — production deployments must override this explicitly.
    allowed_origins: str = "http://localhost:3000,http://localhost:8081,http://127.0.0.1:3000,http://127.0.0.1:8081"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    model_path: Path = APP_DIR / "ai" / "checkpoints" / "model.pth"

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
    # output layer, which ai/engine.py maps positionally) — see _load_model_metadata() above.
    model_classes: list[str] = Field(default_factory=lambda: _metadata.get("class_names") or _FALLBACK_CLASSES)


@lru_cache
def get_settings() -> Settings:
    """Preferred entry point for new code (`Depends(get_settings)` — testable via
    `dependency_overrides`, and its cache means `Settings()` — including the fail-fast .env
    validation above — only ever runs once per process). The bare `settings` instance below is
    kept for the ~30 existing `from .config import settings` call sites; both resolve to the same
    object."""
    return Settings()


settings = get_settings()
