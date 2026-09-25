# syntax=docker/dockerfile:1
# P5 (item 9). Build context is the REPOSITORY ROOT, not backend/, because the model-weight fetch
# script lives in scripts/:
#   docker build -f backend/Dockerfile -t zarailink-api .
# The 9 MB checkpoint is not in git (finding C5). If backend/app/ml/checkpoints/model.pth is already on
# disk (a local build) the fetch below sees a matching checksum and downloads nothing. Otherwise it needs a
# token while the repo is private, passed as a build SECRET so it never lands in an image layer:
#   docker build --secret id=gh_token,env=GH_TOKEN -f backend/Dockerfile -t zarailink-api .

FROM python:3.12-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.12.18 /uv /usr/local/bin/uv
WORKDIR /app/backend
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY backend/pyproject.toml backend/uv.lock ./
# Production dependencies only (no pytest/ruff/mypy); the lock is honoured exactly.
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim
RUN useradd --create-home --shell /usr/sbin/nologin appuser
WORKDIR /app/backend
COPY --from=builder --chown=appuser:appuser /app/backend/.venv /app/backend/.venv
COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser scripts/fetch_model_weights.py /app/scripts/fetch_model_weights.py
ENV PATH="/app/backend/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER appuser
RUN --mount=type=secret,id=gh_token,required=false,uid=1000     GH_TOKEN="$(cat /run/secrets/gh_token 2>/dev/null || true)" python /app/scripts/fetch_model_weights.py
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=4)"
# uvicorn honours X-Forwarded-For only from these addresses. Set it to the platform proxy at deploy time;
# leaving the default trusts only a proxy on the same host. See core/rate_limit.py for why it matters.
ENV FORWARDED_ALLOW_IPS=127.0.0.1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
