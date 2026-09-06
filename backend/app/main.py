import os
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .ai import AIResponseError, run_ai_chat
from .database import BoardRepository, get_database_path, initialize_database
from .openrouter import (
    AIProvider,
    OpenRouterClient,
    OpenRouterConfigurationError,
    OpenRouterError,
    OpenRouterProviderError,
    OpenRouterTimeoutError,
)
from .schemas import (
    AIChatRequest,
    AIChatResponse,
    AIConnectivityResponse,
    BoardData,
    CreateCardRequest,
    MoveCardRequest,
    RenameColumnRequest,
    UpdateCardRequest,
)

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


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialize_database(get_database_path())
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)


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


CONNECTIVITY_PROMPT = "2+2"


def get_ai_provider() -> AIProvider:
    return OpenRouterClient()


@app.post("/api/ai/connectivity", response_model=AIConnectivityResponse)
def ai_connectivity(
    _: str = Depends(get_current_user),
    provider: AIProvider = Depends(get_ai_provider),
) -> AIConnectivityResponse:
    try:
        response = provider.complete(CONNECTIVITY_PROMPT)
    except OpenRouterConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except OpenRouterTimeoutError as error:
        raise HTTPException(status_code=504, detail=str(error)) from error
    except OpenRouterProviderError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except OpenRouterError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return AIConnectivityResponse(prompt=CONNECTIVITY_PROMPT, response=response)


@app.post("/api/ai/chat", response_model=AIChatResponse)
def ai_chat(
    request: AIChatRequest,
    username: str = Depends(get_current_user),
    provider: AIProvider = Depends(get_ai_provider),
) -> AIChatResponse:
    try:
        return run_ai_chat(
            provider,
            get_board_repository(),
            username,
            request,
        )
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Board not found") from error
    except OpenRouterConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except OpenRouterTimeoutError as error:
        raise HTTPException(status_code=504, detail=str(error)) from error
    except OpenRouterProviderError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except OpenRouterError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except AIResponseError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


def get_board_repository() -> BoardRepository:
    return BoardRepository(get_database_path())


@app.get("/api/board", response_model=BoardData)
def read_board(
    username: str = Depends(get_current_user),
) -> BoardData:
    board = get_board_repository().get_board(username)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@app.patch("/api/board/columns/{column_id}")
def rename_column(
    column_id: str,
    request: RenameColumnRequest,
    username: str = Depends(get_current_user),
) -> dict[str, bool]:
    updated = get_board_repository().rename_column(
        username, column_id, request.title
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"updated": True}


@app.post("/api/board/cards", status_code=201)
def create_card(
    request: CreateCardRequest,
    username: str = Depends(get_current_user),
) -> dict[str, str]:
    card_id = get_board_repository().create_card(
        username, request.column_id, request.title, request.details
    )
    if card_id is None:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"id": card_id}


@app.patch("/api/board/cards/{card_id}")
def update_card(
    card_id: str,
    request: UpdateCardRequest,
    username: str = Depends(get_current_user),
) -> dict[str, bool]:
    updated = get_board_repository().update_card(
        username, card_id, request.title, request.details
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"updated": True}


@app.delete("/api/board/cards/{card_id}")
def delete_card(
    card_id: str,
    username: str = Depends(get_current_user),
) -> dict[str, bool]:
    deleted = get_board_repository().delete_card(username, card_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"deleted": True}


@app.post("/api/board/cards/{card_id}/move")
def move_card(
    card_id: str,
    request: MoveCardRequest,
    username: str = Depends(get_current_user),
) -> dict[str, bool]:
    moved = get_board_repository().move_card(
        username, card_id, request.target_column_id, request.position
    )
    if not moved:
        raise HTTPException(
            status_code=404,
            detail="Card or target column not found",
        )
    return {"moved": True}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
