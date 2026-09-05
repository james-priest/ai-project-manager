import os
import secrets
import time
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

PLACEHOLDER_STATIC_DIR = Path(__file__).resolve().parents[1] / "static"
EXPORTED_STATIC_DIR = Path(os.getenv("FRONTEND_STATIC_DIR", "/app/frontend-out"))
STATIC_DIR = (
    EXPORTED_STATIC_DIR
    if (EXPORTED_STATIC_DIR / "index.html").is_file()
    else PLACEHOLDER_STATIC_DIR
)
MVP_USERNAME = "user"
MVP_PASSWORD = "password"
SESSION_COOKIE = "session_id"
SESSION_MAX_AGE = 60 * 60 * 8
SESSION_STORE: dict[str, float] = {}


class LoginRequest(BaseModel):
    username: str
    password: str

app = FastAPI(title="Project Management MVP")


def create_session() -> str:
    session_id = secrets.token_urlsafe(32)
    SESSION_STORE[session_id] = time.time() + SESSION_MAX_AGE
    return session_id


def get_current_user(request: Request) -> str:
    session_id = request.cookies.get(SESSION_COOKIE)
    expires_at = SESSION_STORE.get(session_id or "")

    if expires_at is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    if expires_at <= time.time():
        SESSION_STORE.pop(session_id or "", None)
        raise HTTPException(status_code=401, detail="Authentication required")

    return MVP_USERNAME


@app.get("/", include_in_schema=False)
def read_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(credentials: LoginRequest, response: Response) -> dict[str, str | bool]:
    if (
        credentials.username != MVP_USERNAME
        or credentials.password != MVP_PASSWORD
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    session_id = create_session()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_id,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return {"authenticated": True, "username": MVP_USERNAME}


@app.get("/api/auth/me")
def current_user(username: str = Depends(get_current_user)) -> dict[str, str | bool]:
    return {"authenticated": True, "username": username}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        SESSION_STORE.pop(session_id, None)
    response.delete_cookie(key=SESSION_COOKIE, path="/")
    return {"authenticated": False}


@app.get("/api/example")
def example(_: str = Depends(get_current_user)) -> dict[str, str]:
    return {"message": "hello world"}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
