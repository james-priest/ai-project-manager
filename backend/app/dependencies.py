import secrets
import time

from fastapi import HTTPException, Request

from .config import MVP_USERNAME, SESSION_COOKIE, SESSION_MAX_AGE, get_database_path
from .database import BoardRepository
from .openrouter import AIProvider, OpenRouterClient

SESSION_STORE: dict[str, float] = {}


def create_session() -> str:
    now = time.time()
    for expired_id in [
        session_id
        for session_id, expires_at in SESSION_STORE.items()
        if expires_at <= now
    ]:
        SESSION_STORE.pop(expired_id, None)

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


def get_board_repository() -> BoardRepository:
    return BoardRepository(get_database_path())


def get_ai_provider() -> AIProvider:
    return OpenRouterClient()
