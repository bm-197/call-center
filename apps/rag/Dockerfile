# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the RAG service (Python 3.12 + uv).
#
# Bakes intfloat/multilingual-e5-large into the image at build time so cold
# starts are fast and the VPS doesn't need outbound HuggingFace access on
# every container restart. The bake adds ~2 GB to the image but eliminates
# the 20–30s SentenceTransformer download on first request.
#
# Build context = monorepo root. Compose:
#   build: { context: ., dockerfile: apps/rag/Dockerfile }

ARG PYTHON_VERSION=3.12

# ─── 1. base ───────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1
# uv needs curl for installation; libpq-dev is needed by psycopg2-binary at
# runtime (sidesteps an apt update pulling postgresql-client).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates libpq5 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.5.4 /uv /uvx /usr/local/bin/
WORKDIR /app

# ─── 2. deps ───────────────────────────────────────────────────────────────
FROM base AS deps
COPY apps/rag/pyproject.toml apps/rag/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# ─── 3. model bake (downloads e5-large into /models so the runtime stage
#       can copy it). Cached separately from app code so source edits don't
#       trigger a re-download.
FROM deps AS model
ENV SENTENCE_TRANSFORMERS_HOME=/models
RUN --mount=type=cache,target=/root/.cache/uv \
    uv run --no-dev python -c "from sentence_transformers import SentenceTransformer; \
SentenceTransformer('intfloat/multilingual-e5-large', cache_folder='/models')"

# ─── 4. runtime ────────────────────────────────────────────────────────────
FROM base AS runtime
ENV SENTENCE_TRANSFORMERS_HOME=/models \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    PATH="/app/.venv/bin:$PATH"

# Copy resolved virtualenv from deps stage and the baked model from model stage.
COPY --from=deps /app/.venv /app/.venv
COPY --from=model /models /models

# App code (small — just api.py + pyproject)
COPY apps/rag/pyproject.toml apps/rag/uv.lock ./
COPY apps/rag/api.py ./

EXPOSE 4003
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "4003"]
