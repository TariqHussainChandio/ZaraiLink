from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_DIR = Path(__file__).resolve().parent.parent


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

    model_path: Path = APP_DIR / "ml" / "checkpoints" / "model.pth"
    # Recorded on every disease_predictions row so a prediction is traceable to the weights that
    # produced it. Update this alongside dropping in a real model.pth — "placeholder" is accurate
    # only for today's non-checkpoint file.
    model_version: str = "placeholder"

    # Provisional — replace with the real label list (same order as the trained classifier's
    # output layer) once training data is finalized. See docs/architecture/ai-disease-advisory.md.
    model_classes: list[str] = [
        "healthy",
        "bacterial_blight",
        "leaf_rust",
        "powdery_mildew",
        "early_blight",
    ]


settings = Settings()
