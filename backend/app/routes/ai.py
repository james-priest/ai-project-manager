from fastapi import APIRouter, Depends

from ..ai import run_ai_chat
from ..database import BoardRepository
from ..dependencies import get_ai_provider, get_board_repository, get_current_user
from ..openrouter import AIProvider
from ..schemas import AIChatRequest, AIChatResponse, AIConnectivityResponse

router = APIRouter()

CONNECTIVITY_PROMPT = "2+2"


@router.post("/api/ai/connectivity", response_model=AIConnectivityResponse)
def ai_connectivity(
    _: str = Depends(get_current_user),
    provider: AIProvider = Depends(get_ai_provider),
) -> AIConnectivityResponse:
    return AIConnectivityResponse(
        prompt=CONNECTIVITY_PROMPT,
        response=provider.complete(CONNECTIVITY_PROMPT),
    )


@router.post("/api/ai/chat", response_model=AIChatResponse)
def ai_chat(
    request: AIChatRequest,
    username: str = Depends(get_current_user),
    provider: AIProvider = Depends(get_ai_provider),
    repository: BoardRepository = Depends(get_board_repository),
) -> AIChatResponse:
    return run_ai_chat(provider, repository, username, request)
