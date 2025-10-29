from datetime import datetime
from typing import ClassVar, Optional, Dict, Any

from loguru import logger

from pydantic import field_validator

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.base import ObjectModel
from open_notebook.utils.crypto import decrypt_value, encrypt_value


class UserProviderSecret(ObjectModel):
    table_name: ClassVar[str] = "user_provider_secret"

    user: str
    provider: str
    encrypted_value: str
    display_name: Optional[str] = None

    @field_validator("user", mode="before")
    @classmethod
    def normalize_user(cls, value):
        if isinstance(value, str):
            return str(ensure_record_id(value))
        return str(value)
    
    def _prepare_save_data(self) -> Dict[str, Any]:
        """Override to ensure user field is always RecordID format for database"""
        data = super()._prepare_save_data()
        
        # Ensure user field is RecordID format
        if data.get("user") is not None:
            data["user"] = ensure_record_id(data["user"])
            
        return data

    def get_plain_value(self) -> str:
        return decrypt_value(self.encrypted_value)

    @classmethod
    async def upsert_secret(
        cls, user: str, provider: str, value: str, display_name: Optional[str] = None
    ) -> "UserProviderSecret":
        encrypted = encrypt_value(value)
        existing = await cls.get_for_user(user, provider)
        if existing:
            existing.encrypted_value = encrypted
            existing.display_name = display_name
            existing.updated = datetime.now()
            await existing.save()
            return existing
        
        # Try to create new record
        try:
            secret = cls(user=user, provider=provider, encrypted_value=encrypted, display_name=display_name)
            await secret.save()
            return secret
        except Exception as e:
            # If creation fails due to duplicate, fetch and update
            logger.warning(f"Failed to create secret, trying to fetch and update: {e}")
            existing = await cls.get_for_user(user, provider)
            if existing:
                existing.encrypted_value = encrypted
                existing.display_name = display_name
                existing.updated = datetime.now()
                await existing.save()
                return existing
            raise

    @classmethod
    async def get_for_user(cls, user: str, provider: str) -> Optional["UserProviderSecret"]:
        try:
            # Get all records for this provider
            results = await repo_query(
                "SELECT * FROM user_provider_secret WHERE provider = $provider",
                {"provider": provider},
            )
            
            # Filter in Python to match the user field in any format
            user_str = str(user).lower()
            for record in results:
                record_user = str(record.get("user", "")).lower()
                # Check if it matches in various formats
                if user_str in record_user or record_user in user_str:
                    return cls(**record)
        except Exception as exc:
            logger.error(f"Failed to load provider secret for user {user}: {exc}")
        return None

    @classmethod
    async def list_for_user(cls, user: str) -> list["UserProviderSecret"]:
        try:
            # Get all secrets and filter by user in Python
            # This handles any format stored in the database
            results = await repo_query(
                "SELECT * FROM user_provider_secret",
                {},
            )
            
            # Filter by user in Python
            user_str = str(user).lower()
            filtered = []
            for record in results:
                record_user = str(record.get("user", "")).lower()
                # Check if user matches in various formats
                if user_str in record_user or record_user in user_str:
                    filtered.append(cls(**record))
            
            return filtered
        except Exception as exc:
            logger.error(f"Failed to list provider secrets for user {user}: {exc}")
            return []

    @classmethod
    async def delete_for_user(cls, user: str, provider: str) -> bool:
        secret = await cls.get_for_user(user, provider)
        if not secret:
            return False
        await secret.delete()
        return True
