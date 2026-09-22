from fastapi import APIRouter, Depends, HTTPException

from ..ai import AIResponseError, run_ai_chat
from ..database import BoardRepository
from ..dependencies import get_ai_provider, get_board_repository, get_current_user
from ..openrouter import (
    AIProvider,
    OpenRouterConfigurationError,
    OpenRouterError,
    OpenRouterProviderError,
    OpenRouterTimeoutError,
)
from ..schemas import AIChatRequest, AIChatResponse, AIConnectivityResponse

router = APIRouter()

CONNECTIVITY_PROMPT = "2+2"


@router.post("/api/ai/connectivity", response_model=AIConnectivityResponse)
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


@router.post("/api/ai/chat", response_model=AIChatResponse)
def ai_chat(
    request: AIChatRequest,
    username: str = Depends(get_current_user),
    provider: AIProvider = Depends(get_ai_provider),
    repository: BoardRepository = Depends(get_board_repository),
) -> AIChatResponse:
    try:
        return run_ai_chat(provider, repository, username, request)
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
