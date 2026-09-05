import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

PLACEHOLDER_STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
EXPORTED_STATIC_DIR = Path(os.getenv("FRONTEND_STATIC_DIR", "/app/frontend-out"))
STATIC_DIR = (
    EXPORTED_STATIC_DIR
    if (EXPORTED_STATIC_DIR / "index.html").is_file()
    else PLACEHOLDER_STATIC_DIR
)

app = FastAPI(title="Project Management MVP")


@app.get("/", include_in_schema=False)
def read_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/example")
def example() -> dict[str, str]:
    return {"message": "hello world"}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
