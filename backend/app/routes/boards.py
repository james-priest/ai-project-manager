from fastapi import APIRouter, Depends, HTTPException

from ..database import BoardRepository
from ..dependencies import get_board_repository, get_current_user
from ..schemas import BoardData, BoardSummary, CreateBoardRequest, RenameColumnRequest

router = APIRouter()


@router.get("/api/boards", response_model=list[BoardSummary])
def list_boards(
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> list[BoardSummary]:
    return repository.list_boards(username)


@router.post("/api/boards", status_code=201, response_model=BoardSummary)
def create_board(
    request: CreateBoardRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> BoardSummary:
    board = repository.create_board(username, request.title)
    if board is None:
        raise HTTPException(status_code=404, detail="User not found")
    return board


@router.get("/api/boards/{board_id}", response_model=BoardData)
def read_board(
    board_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> BoardData:
    board = repository.get_board_by_id(username, board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@router.patch("/api/boards/{board_id}")
def rename_board(
    board_id: str,
    request: RenameColumnRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    if not repository.rename_board(username, board_id, request.title):
        raise HTTPException(status_code=404, detail="Board not found")
    return {"updated": True}


@router.delete("/api/boards/{board_id}")
def delete_board(
    board_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    if not repository.delete_board(username, board_id):
        raise HTTPException(
            status_code=409,
            detail="Board not found, or it is the last board for this account",
        )
    return {"deleted": True}
