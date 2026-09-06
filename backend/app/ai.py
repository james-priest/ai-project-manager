import json

from pydantic import ValidationError

from .database import BoardOperationError, BoardRepository
from .openrouter import AIProvider
from .schemas import AIChatRequest, AIChatResponse, AIModelResponse, BoardData


class AIResponseError(RuntimeError):
    """Raised when the provider response cannot be safely applied."""


def build_chat_prompt(board: BoardData, request: AIChatRequest) -> str:
    history = [message.model_dump(mode="json") for message in request.history]
    board_json = json.dumps(board.model_dump(mode="json"), indent=2)
    history_json = json.dumps(history, indent=2)

    return f"""You are a project management assistant.
Use the current board and conversation context to answer the user's question.
Return ONLY one valid JSON object. Do not use Markdown fences or extra text.
The JSON object must match this shape:
{{
  "response": "user-facing answer",
  "operations": [
    {{
      "operation": "create_card",
      "column_id": "existing column id",
      "position": 0,
      "title": "card title",
      "details": "card details"
    }},
    {{
      "operation": "edit_card",
      "card_id": "existing card id",
      "title": "new card title",
      "details": "new card details"
    }},
    {{
      "operation": "move_card",
      "card_id": "existing card id",
      "target_column_id": "existing column id",
      "position": 0
    }}
  ]
}}
Use an empty operations array when no board change is needed.
Operations are applied in the listed order. Positions are zero-based and may
be from 0 through the target column's current card count. Do not rename
columns, use IDs outside the current board, or include unsupported operations.

Current board JSON:
{board_json}

Conversation history JSON:
{history_json}

User question:
{request.question}
"""


def parse_model_response(raw_response: str) -> AIModelResponse:
    try:
        return AIModelResponse.model_validate_json(raw_response)
    except (ValidationError, ValueError) as error:
        raise AIResponseError(
            "OpenRouter returned invalid structured output."
        ) from error


def validate_operations_are_unique(response: AIModelResponse) -> None:
    serialized_operations = [
        operation.model_dump_json() for operation in response.operations
    ]
    if len(serialized_operations) != len(set(serialized_operations)):
        raise AIResponseError("OpenRouter returned duplicate board operations.")


def run_ai_chat(
    provider: AIProvider,
    repository: BoardRepository,
    username: str,
    request: AIChatRequest,
) -> AIChatResponse:
    board = repository.get_board(username)
    if board is None:
        raise LookupError("Board not found")

    prompt = build_chat_prompt(board, request)
    model_response = parse_model_response(provider.complete(prompt))
    validate_operations_are_unique(model_response)

    try:
        resulting_board = repository.apply_operations(
            username, model_response.operations
        )
    except BoardOperationError as error:
        raise AIResponseError("OpenRouter returned invalid board operations.") from error

    if resulting_board is None:
        raise LookupError("Board not found")

    return AIChatResponse(
        response=model_response.response,
        board=resulting_board,
        updated=bool(model_response.operations),
    )
