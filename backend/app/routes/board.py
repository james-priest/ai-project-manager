from fastapi import APIRouter, Depends, HTTPException

from ..database import BoardOperationError, BoardRepository
from ..dependencies import get_board_repository, get_current_user
from ..schemas import (
    BoardData,
    ChecklistItem,
    CreateChecklistItemRequest,
    UpdateChecklistItemRequest,
    MoveColumnRequest,
    CommentData,
    CreateCommentRequest,
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
    try:
        card_id = repository.create_card(
            username,
            request.column_id,
            request.title,
            request.details,
            request.due_date,
            request.assignee,
            request.label_ids,
        )
    except BoardOperationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
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
    try:
        updated = repository.update_card(
            username,
            card_id,
            request.title,
            request.details,
            request.due_date,
            request.assignee,
            request.label_ids,
        )
    except BoardOperationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
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


@router.get(
    "/api/board/cards/{card_id}/comments", response_model=list[CommentData]
)
def list_comments(
    card_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> list[CommentData]:
    comments = repository.list_comments(username, card_id)
    if comments is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return comments


@router.post(
    "/api/board/cards/{card_id}/comments",
    status_code=201,
    response_model=CommentData,
)
def add_comment(
    card_id: str,
    request: CreateCommentRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> CommentData:
    comment = repository.add_comment(username, card_id, request.body)
    if comment is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return comment


@router.delete("/api/board/comments/{comment_id}")
def delete_comment(
    comment_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    if not repository.delete_comment(username, comment_id):
        raise HTTPException(status_code=404, detail="Comment not found")
    return {"deleted": True}


@router.delete("/api/board/columns/{column_id}")
def delete_column(
    column_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    try:
        deleted = repository.delete_column(username, column_id)
    except BoardOperationError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not deleted:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"deleted": True}


@router.post("/api/board/columns/{column_id}/move")
def move_column(
    column_id: str,
    request: MoveColumnRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    try:
        moved = repository.move_column(username, column_id, request.position)
    except BoardOperationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not moved:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"moved": True}


@router.get(
    "/api/board/cards/{card_id}/checklist", response_model=list[ChecklistItem]
)
def list_checklist(
    card_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> list[ChecklistItem]:
    items = repository.list_checklist(username, card_id)
    if items is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return items


@router.post(
    "/api/board/cards/{card_id}/checklist",
    status_code=201,
    response_model=ChecklistItem,
)
def add_checklist_item(
    card_id: str,
    request: CreateChecklistItemRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> ChecklistItem:
    item = repository.add_checklist_item(username, card_id, request.text)
    if item is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return item


@router.patch("/api/board/checklist/{item_id}")
def set_checklist_item(
    item_id: str,
    request: UpdateChecklistItemRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    if not repository.set_checklist_item_done(username, item_id, request.done):
        raise HTTPException(status_code=404, detail="Checklist item not found")
    return {"updated": True}


@router.delete("/api/board/checklist/{item_id}")
def delete_checklist_item(
    item_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    if not repository.delete_checklist_item(username, item_id):
        raise HTTPException(status_code=404, detail="Checklist item not found")
    return {"deleted": True}
