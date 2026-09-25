import json
from datetime import datetime, timezone

from pydantic import ValidationError

from .database import BoardOperationError, BoardRepository
from .openrouter import AIProvider
from .schemas import AIChatRequest, AIChatResponse, AIModelResponse, BoardData


class AIResponseError(RuntimeError):
    """Raised when the provider response cannot be safely applied."""


def build_chat_prompt(board: BoardData, request: AIChatRequest) -> str:
    history = [message.model_dump(mode="json") for message in request.history]
    today = datetime.now(timezone.utc).date().isoformat()
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
      "details": "card details",
      "due_date": "2026-03-01",
      "assignee": "name",
      "label_ids": ["existing label id"]
    }},
    {{
      "operation": "edit_card",
      "card_id": "existing card id",
      "title": "new card title",
      "details": "new card details",
      "due_date": "2026-03-01",
      "assignee": "name",
      "label_ids": ["existing label id"]
    }},
    {{
      "operation": "move_card",
      "card_id": "existing card id",
      "target_column_id": "existing column id",
      "position": 0
    }},
    {{
      "operation": "delete_card",
      "card_id": "existing card id"
    }},
    {{
      "operation": "add_checklist",
      "card_id": "existing card id",
      "steps": ["first step", "second step"]
    }}
  ]
}}
Use an empty operations array when no board change is needed.
Operations are applied in the listed order. Positions are zero-based and may
be from 0 through the target column's current card count.

On create_card, due_date, assignee, and label_ids are optional; leave them out
when the user did not ask for them. On edit_card, title and details are
required and replace the current values, while due_date, assignee, and
label_ids change only when you include them: send "due_date": null to clear a
due date, and a full list of label_ids to replace a card's labels.
Dates are YYYY-MM-DD. Today is {today}.
add_checklist appends steps to a card's checklist and keeps the steps already
there; each card's JSON shows how many steps it has and how many are done.
Use label ids from the board's labels map; never invent one, and never create
labels or columns. Only delete a card when the user clearly asks for it.
Do not rename columns or use IDs outside the current board.

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


def run_ai_chat(
    provider: AIProvider,
    repository: BoardRepository,
    username: str,
    request: AIChatRequest,
) -> AIChatResponse:
    board = (
        repository.get_board_by_id(username, request.board_id)
        if request.board_id
        else repository.get_board(username)
    )
    if board is None:
        raise LookupError("Board not found")

    prompt = build_chat_prompt(board, request)
    model_response = parse_model_response(
        provider.complete(prompt, json_output=True)
    )

    try:
        resulting_board = repository.apply_operations(
            username, model_response.operations, request.board_id
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
