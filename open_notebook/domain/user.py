from typing import ClassVar, Optional

from loguru import logger
from pydantic import EmailStr, field_validator

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.base import ObjectModel
from open_notebook.exceptions import InvalidInputError


class User(ObjectModel):
    table_name: ClassVar[str] = "user"

    email: EmailStr
    hashed_password: str
    display_name: Optional[str] = None
    is_active: bool = True
    is_admin: bool = False
    has_completed_onboarding: bool = False

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("id", mode="before")
    @classmethod
    def normalize_id(cls, value):
        if value is None:
            return None
        if hasattr(value, "to_string"):
            return value.to_string()
        return str(value)

    @classmethod
    async def get_by_email(cls, email: str) -> Optional["User"]:
        normalized_email = email.strip().lower()
        try:
            result = await repo_query(
                "SELECT * FROM user WHERE email = $email LIMIT 1",
                {"email": normalized_email},
            )
            if result:
                return cls(**result[0])
            return None
        except Exception as error:
            logger.error(f"Failed to fetch user by email {email}: {error}")
            raise

    async def ensure_active(self):
        if not self.is_active:
            raise InvalidInputError("Account is inactive")

    def get_record_id(self) -> Optional[str]:
        if not self.id:
            return None
        return str(ensure_record_id(self.id))
