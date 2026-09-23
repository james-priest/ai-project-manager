FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:0.12.11 /uv /uvx /bin/

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock backend/
RUN uv sync --project /app/backend --locked --no-dev

COPY backend/ backend/

COPY --from=frontend-builder /app/frontend/out /app/frontend-out

ENV PATH="/app/backend/.venv/bin:$PATH"
ENV PYTHONPATH="/app/backend"
ENV PYTHONUNBUFFERED=1
ENV FRONTEND_STATIC_DIR="/app/frontend-out"

# Run as a non-root user; /app/data is the mount point for the SQLite volume.
RUN useradd --uid 10001 --create-home app \
    && mkdir -p /app/data \
    && chown -R app:app /app
USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
