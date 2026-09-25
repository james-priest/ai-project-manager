from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .ai import AIResponseError
from .config import get_database_path, get_static_dir
from .database import initialize_database
from .openrouter import (
    OpenRouterConfigurationError,
    OpenRouterError,
    OpenRouterTimeoutError,
)
from .routes import ai, auth, board, boards, health

STATIC_DIR = get_static_dir()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialize_database(get_database_path())
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)


# Provider and model failures map to one status code each, wherever they occur.
AI_ERROR_STATUS_CODES: list[tuple[type[Exception], int]] = [
    (OpenRouterConfigurationError, 503),
    (OpenRouterTimeoutError, 504),
    (OpenRouterError, 502),
    (AIResponseError, 502),
]


@app.exception_handler(OpenRouterError)
@app.exception_handler(AIResponseError)
def handle_ai_error(_: Request, error: Exception) -> JSONResponse:
    status_code = next(
        code
        for error_type, code in AI_ERROR_STATUS_CODES
        if isinstance(error, error_type)
    )
    return JSONResponse(status_code=status_code, content={"detail": str(error)})


@app.exception_handler(LookupError)
def handle_missing_board(_: Request, error: LookupError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Board not found"})


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(board.router)
app.include_router(boards.router)
app.include_router(ai.router)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
