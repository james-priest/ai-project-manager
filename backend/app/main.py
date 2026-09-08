from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_database_path, get_static_dir
from .database import initialize_database
from .routes import ai, auth, board, health

STATIC_DIR = get_static_dir()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialize_database(get_database_path())
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)


@app.get("/", include_in_schema=False)
def read_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(board.router)
app.include_router(ai.router)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
