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
