from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from ..config import SESSION_COOKIE, SESSION_MAX_AGE, session_cookie_is_secure
from ..database import SessionRepository, UserExistsError, UserRepository
from ..dependencies import (
    get_current_user,
    get_session_repository,
    get_user_repository,
)
from ..schemas import RegisterRequest

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


def _start_session(
    response: Response, sessions: SessionRepository, username: str
) -> None:
    session_id = sessions.create(username, SESSION_MAX_AGE)
    if session_id is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_id,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=session_cookie_is_secure(),
        path="/",
    )


@router.post("/api/auth/register", status_code=201)
def register(
    credentials: RegisterRequest,
    response: Response,
    users: UserRepository = Depends(get_user_repository),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict[str, str | bool]:
    try:
        users.create_user(credentials.username, credentials.password)
    except UserExistsError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    _start_session(response, sessions, credentials.username)
    return {"authenticated": True, "username": credentials.username}


@router.post("/api/auth/login")
def login(
    credentials: LoginRequest,
    response: Response,
    users: UserRepository = Depends(get_user_repository),
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict[str, str | bool]:
    username = credentials.username.strip().lower()
    if not users.authenticate(username, credentials.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    _start_session(response, sessions, username)
    return {"authenticated": True, "username": username}


@router.get("/api/auth/me")
def current_user(username: str = Depends(get_current_user)) -> dict[str, str | bool]:
    return {"authenticated": True, "username": username}


@router.post("/api/auth/logout")
def logout(
    request: Request,
    response: Response,
    sessions: SessionRepository = Depends(get_session_repository),
) -> dict[str, bool]:
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        sessions.delete(session_id)
    response.delete_cookie(key=SESSION_COOKIE, path="/")
    return {"authenticated": False}


@router.get("/api/example")
def example(_: str = Depends(get_current_user)) -> dict[str, str]:
    return {"message": "hello world"}
