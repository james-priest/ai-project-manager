from fastapi import Depends, HTTPException, Request

from .config import SESSION_COOKIE, get_database_path
from .database import BoardRepository, SessionRepository, UserRepository
from .openrouter import AIProvider, OpenRouterClient


def get_board_repository() -> BoardRepository:
    return BoardRepository(get_database_path())


def get_user_repository() -> UserRepository:
    return UserRepository(get_database_path())


def get_session_repository() -> SessionRepository:
    return SessionRepository(get_database_path())


def get_current_user(
    request: Request,
    sessions: SessionRepository = Depends(get_session_repository),
) -> str:
    session_id = request.cookies.get(SESSION_COOKIE)
    username = sessions.get_username(session_id) if session_id else None
    if username is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return username


def get_ai_provider() -> AIProvider:
    return OpenRouterClient()
