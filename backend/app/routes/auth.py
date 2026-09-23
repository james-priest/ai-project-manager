from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from ..config import (
    MVP_USERNAME,
    SESSION_COOKIE,
    SESSION_MAX_AGE,
    session_cookie_is_secure,
)
from ..database import get_user_password_hash, verify_password
from ..dependencies import SESSION_STORE, create_session, get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/api/auth/login")
def login(credentials: LoginRequest, response: Response) -> dict[str, str | bool]:
    stored_hash = get_user_password_hash(credentials.username)
    if stored_hash is None or not verify_password(
        credentials.password, stored_hash
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    session_id = create_session()
    response.set_cookie(
        key=SESSION_COOKIE,
        value=session_id,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=session_cookie_is_secure(),
        path="/",
    )
    return {"authenticated": True, "username": MVP_USERNAME}


@router.get("/api/auth/me")
def current_user(username: str = Depends(get_current_user)) -> dict[str, str | bool]:
    return {"authenticated": True, "username": username}


@router.post("/api/auth/logout")
def logout(request: Request, response: Response) -> dict[str, bool]:
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        SESSION_STORE.pop(session_id, None)
    response.delete_cookie(key=SESSION_COOKIE, path="/")
    return {"authenticated": False}


@router.get("/api/example")
def example(_: str = Depends(get_current_user)) -> dict[str, str]:
    return {"message": "hello world"}
