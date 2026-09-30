from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, ValidationInfo, field_validator

MAX_TEXT_LENGTH = 2_000
MAX_HISTORY_MESSAGES = 50


# Shared field validators, attached with `field_validator(...)(function)`.
def required_text(value: str, info: ValidationInfo) -> str:
    value = value.strip()
    if not value:
        raise ValueError(f"{info.field_name} must not be blank")
    return value


def stripped_text(value: str) -> str:
    return value.strip()


class LabelData(BaseModel):
    id: str
    name: str
    color: str


class ChecklistItem(BaseModel):
    id: str
    text: str
    done: bool


class CreateChecklistItemRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)

    _clean_text = field_validator("text")(required_text)


class UpdateChecklistItemRequest(BaseModel):
    done: bool


class CardData(BaseModel):
    id: str
    title: str
    details: str
    dueDate: str | None = None
    assignee: str = ""
    labelIds: list[str] = Field(default_factory=list)
    commentCount: int = 0
    checklistDone: int = 0
    checklistTotal: int = 0


class ColumnData(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[ColumnData]
    cards: dict[str, CardData]
    labels: dict[str, LabelData] = Field(default_factory=dict)



ISO_DATE = r"^\d{4}-\d{2}-\d{2}$"
LABEL_COLORS = {"yellow", "blue", "purple", "navy", "gray"}


class CardFields(BaseModel):
    due_date: str | None = Field(default=None, pattern=ISO_DATE)
    assignee: str = Field(default="", max_length=100)
    label_ids: list[str] = Field(default_factory=list, max_length=20)

    _clean_assignee = field_validator("assignee")(stripped_text)


class CreateLabelRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = "blue"

    _clean_name = field_validator("name")(required_text)

    @field_validator("color")
    @classmethod
    def known_color(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in LABEL_COLORS:
            raise ValueError(f"color must be one of {sorted(LABEL_COLORS)}")
        return value


class BoardSummary(BaseModel):
    id: str
    title: str
    cardCount: int
    updatedAt: str
    role: str = "owner"
    memberCount: int = 1
    archived: bool = False


class CreateColumnRequest(BaseModel):
    title: str = Field(max_length=MAX_TEXT_LENGTH)

    _clean_title = field_validator("title")(required_text)


class MoveColumnRequest(BaseModel):
    position: int = Field(ge=0)


class BoardMember(BaseModel):
    username: str
    role: str


class AddMemberRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)

    @field_validator("username")
    @classmethod
    def normalize(cls, value: str) -> str:
        return value.strip().lower()


class CommentData(BaseModel):
    id: str
    author: str
    body: str
    createdAt: str


class CreateCommentRequest(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)

    _clean_body = field_validator("body")(required_text)


class AssignedCard(BaseModel):
    """A card assigned to the signed-in user, from any board they can see."""

    cardId: str
    title: str
    boardId: str
    boardTitle: str
    columnTitle: str
    dueDate: str | None
    labels: list[LabelData] = Field(default_factory=list)


class ActivityEntry(BaseModel):
    id: str
    actor: str
    summary: str
    createdAt: str


BOARD_TEMPLATES: dict[str, list[str]] = {
    "kanban": ["Backlog", "Discovery", "In Progress", "Review", "Done"],
    "sprint": ["Sprint backlog", "In progress", "In review", "Done"],
    "blank": [],
}


class CreateBoardRequest(BaseModel):
    title: str = Field(max_length=MAX_TEXT_LENGTH)
    template: str = "kanban"

    @field_validator("template")
    @classmethod
    def known_template(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in BOARD_TEMPLATES:
            raise ValueError(f"template must be one of {sorted(BOARD_TEMPLATES)}")
        return value

    _clean_title = field_validator("title")(required_text)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=200)

    @field_validator("username")
    @classmethod
    def username_must_be_simple(cls, value: str) -> str:
        value = value.strip()
        if not value.replace("-", "").replace("_", "").isalnum():
            raise ValueError("username may only contain letters, numbers, - and _")
        return value.lower()


class AIConnectivityResponse(BaseModel):
    prompt: str
    response: str


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_TEXT_LENGTH)

    _clean_content = field_validator("content")(required_text)


class CreateCardOperation(BaseModel):
    operation: Literal["create_card"]
    column_id: str = Field(min_length=1)
    position: int = Field(ge=0)
    title: str = Field(max_length=MAX_TEXT_LENGTH)
    details: str = Field(default="", max_length=MAX_TEXT_LENGTH)
    due_date: str | None = Field(default=None, pattern=ISO_DATE)
    assignee: str = Field(default="", max_length=100)
    label_ids: list[str] = Field(default_factory=list, max_length=20)

    _clean_required = field_validator("column_id", "title")(required_text)
    _clean_details = field_validator("details")(stripped_text)


class EditCardOperation(BaseModel):
    """Fields left out of an edit keep their current value.

    `model_fields_set` is what tells an omitted field from an explicit null,
    so the model can clear a due date by sending `"due_date": null`.
    """

    operation: Literal["edit_card"]
    card_id: str = Field(min_length=1)
    title: str = Field(max_length=MAX_TEXT_LENGTH)
    details: str = Field(default="", max_length=MAX_TEXT_LENGTH)
    due_date: str | None = Field(default=None, pattern=ISO_DATE)
    assignee: str | None = Field(default=None, max_length=100)
    label_ids: list[str] | None = Field(default=None, max_length=20)

    _clean_required = field_validator("card_id", "title")(required_text)
    _clean_details = field_validator("details")(stripped_text)


class MoveCardOperation(BaseModel):
    operation: Literal["move_card"]
    card_id: str = Field(min_length=1)
    target_column_id: str = Field(min_length=1)
    position: int = Field(ge=0)

    @field_validator("card_id", "target_column_id")
    @classmethod
    def ids_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("IDs must not be blank")
        return value


class AddChecklistOperation(BaseModel):
    """Adds steps to a card's checklist; existing steps are kept."""

    operation: Literal["add_checklist"]
    card_id: str = Field(min_length=1)
    steps: list[str] = Field(min_length=1, max_length=20)

    @field_validator("steps")
    @classmethod
    def clean_steps(cls, value: list[str]) -> list[str]:
        steps = [step.strip() for step in value if step.strip()]
        if not steps:
            raise ValueError("steps must not be blank")
        if any(len(step) > MAX_TEXT_LENGTH for step in steps):
            raise ValueError("a step is too long")
        return steps


class DeleteCardOperation(BaseModel):
    operation: Literal["delete_card"]
    card_id: str = Field(min_length=1)

    _clean_card_id = field_validator("card_id")(required_text)


BoardOperation = Annotated[
    Union[
        CreateCardOperation,
        EditCardOperation,
        MoveCardOperation,
        DeleteCardOperation,
        AddChecklistOperation,
    ],
    Field(discriminator="operation"),
]


class AIChatRequest(BaseModel):
    question: str = Field(max_length=MAX_TEXT_LENGTH)
    board_id: str | None = Field(default=None, max_length=MAX_TEXT_LENGTH)
    history: list[ConversationMessage] = Field(
        default_factory=list, max_length=MAX_HISTORY_MESSAGES
    )

    _clean_question = field_validator("question")(required_text)


class AIModelResponse(BaseModel):
    response: str
    operations: list[BoardOperation] = Field(default_factory=list)

    _clean_response = field_validator("response")(required_text)


class AIChatResponse(BaseModel):
    response: str
    board: BoardData
    updated: bool


class RenameColumnRequest(BaseModel):
    title: str = Field(max_length=MAX_TEXT_LENGTH)

    _clean_title = field_validator("title")(required_text)


class UpdateCardRequest(CardFields):
    title: str = Field(max_length=MAX_TEXT_LENGTH)
    details: str = Field(default="", max_length=MAX_TEXT_LENGTH)

    _clean_title = field_validator("title")(required_text)
    _clean_details = field_validator("details")(stripped_text)


class CreateCardRequest(UpdateCardRequest):
    column_id: str = Field(min_length=1)


class MoveCardRequest(BaseModel):
    target_column_id: str = Field(min_length=1)
    position: int = Field(default=0, ge=0)
