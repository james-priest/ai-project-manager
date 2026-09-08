import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]

DEFAULT_DATABASE_PATH = BACKEND_DIR / "data" / "kanban.db"
PLACEHOLDER_STATIC_DIR = BACKEND_DIR / "static"
EXPORTED_STATIC_DIR = Path(os.getenv("FRONTEND_STATIC_DIR", "/app/frontend-out"))

MVP_USERNAME = "user"
SESSION_COOKIE = "session_id"
SESSION_MAX_AGE = 60 * 60 * 8


def get_database_path() -> Path:
    return Path(os.getenv("DATABASE_PATH", str(DEFAULT_DATABASE_PATH)))


def get_static_dir() -> Path:
    return (
        EXPORTED_STATIC_DIR
        if (EXPORTED_STATIC_DIR / "index.html").is_file()
        else PLACEHOLDER_STATIC_DIR
    )
