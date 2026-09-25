from fastapi import APIRouter, Depends, HTTPException

from ..database import BoardOperationError, BoardRepository
from ..dependencies import get_board_repository, get_current_user
from ..schemas import (
    ActivityEntry,
    AddMemberRequest,
    BoardData,
    BoardMember,
    BoardSummary,
    CreateBoardRequest,
    CreateLabelRequest,
    LabelData,
    RenameColumnRequest,
)

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


@router.post(
    "/api/boards/{board_id}/labels", status_code=201, response_model=LabelData
)
def create_label(
    board_id: str,
    request: CreateLabelRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> LabelData:
    try:
        label = repository.create_label(
            username, board_id, request.name, request.color
        )
    except BoardOperationError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if label is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return label


@router.delete("/api/boards/{board_id}/labels/{label_id}")
def delete_label(
    board_id: str,
    label_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    if not repository.delete_label(username, board_id, label_id):
        raise HTTPException(status_code=404, detail="Label not found")
    return {"deleted": True}


@router.get("/api/boards/{board_id}/members", response_model=list[BoardMember])
def list_members(
    board_id: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> list[BoardMember]:
    members = repository.list_members(username, board_id)
    if members is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return members


@router.post(
    "/api/boards/{board_id}/members", status_code=201, response_model=BoardMember
)
def add_member(
    board_id: str,
    request: AddMemberRequest,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> BoardMember:
    try:
        member = repository.add_member(username, board_id, request.username)
    except BoardOperationError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if member is None:
        raise HTTPException(
            status_code=404, detail="Board not found, or you do not own it"
        )
    return member


@router.delete("/api/boards/{board_id}/members/{member}")
def remove_member(
    board_id: str,
    member: str,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> dict[str, bool]:
    if not repository.remove_member(username, board_id, member):
        raise HTTPException(status_code=404, detail="Member not found")
    return {"removed": True}


@router.get("/api/boards/{board_id}/activity", response_model=list[ActivityEntry])
def list_activity(
    board_id: str,
    limit: int = 50,
    username: str = Depends(get_current_user),
    repository: BoardRepository = Depends(get_board_repository),
) -> list[ActivityEntry]:
    entries = repository.list_activity(username, board_id, min(max(limit, 1), 200))
    if entries is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return entries
