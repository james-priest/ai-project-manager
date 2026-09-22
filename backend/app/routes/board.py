from fastapi import APIRouter, Depends, HTTPException

from ..database import BoardOperationError, BoardRepository
from ..dependencies import get_board_repository, get_current_user
from ..schemas import (
    BoardData,
    CreateCardRequest,
    MoveCardRequest,
    RenameColumnRequest,
    UpdateCardRequest,
)

router = APIRouter()


@router.get("/api/board", response_model=BoardData)
def read_board(
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> BoardData:
    board = repository.get_board(username)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@router.patch("/api/board/columns/{column_id}")
def rename_column(
    column_id: str,
    request: RenameColumnRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    updated = repository.rename_column(
        username, column_id, request.title
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"updated": True}


@router.post("/api/board/cards", status_code=201)
def create_card(
    request: CreateCardRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, str]:
    card_id = repository.create_card(
        username, request.column_id, request.title, request.details
    )
    if card_id is None:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"id": card_id}


@router.patch("/api/board/cards/{card_id}")
def update_card(
    card_id: str,
    request: UpdateCardRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    updated = repository.update_card(
        username, card_id, request.title, request.details
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"updated": True}


@router.delete("/api/board/cards/{card_id}")
def delete_card(
    card_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    deleted = repository.delete_card(username, card_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"deleted": True}


@router.post("/api/board/cards/{card_id}/move")
def move_card(
    card_id: str,
    request: MoveCardRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    try:
        moved = repository.move_card(
            username, card_id, request.target_column_id, request.position
        )
    except BoardOperationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not moved:
        raise HTTPException(
            status_code=404,
            detail="Card or target column not found",
        )
    return {"moved": True}
