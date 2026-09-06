from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator


class CardData(BaseModel):
    id: str
    title: str
    details: str


class ColumnData(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[ColumnData]
    cards: dict[str, CardData]


class AIConnectivityResponse(BaseModel):
    prompt: str
    response: str


class ConversationMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content must not be blank")
        return value


class CreateCardOperation(BaseModel):
    operation: Literal["create_card"]
    column_id: str = Field(min_length=1)
    position: int = Field(ge=0)
    title: str
    details: str = ""

    @field_validator("column_id")
    @classmethod
    def column_id_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("column_id must not be blank")
        return value

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value

    @field_validator("details")
    @classmethod
    def clean_details(cls, value: str) -> str:
        return value.strip()


class EditCardOperation(BaseModel):
    operation: Literal["edit_card"]
    card_id: str = Field(min_length=1)
    title: str
    details: str = ""

    @field_validator("card_id")
    @classmethod
    def card_id_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("card_id must not be blank")
        return value

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value

    @field_validator("details")
    @classmethod
    def clean_details(cls, value: str) -> str:
        return value.strip()


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


BoardOperation = Annotated[
    Union[CreateCardOperation, EditCardOperation, MoveCardOperation],
    Field(discriminator="operation"),
]


class AIChatRequest(BaseModel):
    question: str
    history: list[ConversationMessage] = Field(default_factory=list)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("question must not be blank")
        return value


class AIModelResponse(BaseModel):
    response: str
    operations: list[BoardOperation] = Field(default_factory=list)

    @field_validator("response")
    @classmethod
    def response_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("response must not be blank")
        return value


class AIChatResponse(BaseModel):
    response: str
    board: BoardData
    updated: bool


class RenameColumnRequest(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value


class CreateCardRequest(BaseModel):
    column_id: str = Field(min_length=1)
    title: str
    details: str = ""

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value

    @field_validator("details")
    @classmethod
    def clean_details(cls, value: str) -> str:
        return value.strip()


class UpdateCardRequest(BaseModel):
    title: str
    details: str = ""

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title must not be blank")
        return value

    @field_validator("details")
    @classmethod
    def clean_details(cls, value: str) -> str:
        return value.strip()


class MoveCardRequest(BaseModel):
    target_column_id: str = Field(min_length=1)
    position: int = Field(default=0, ge=0)
