from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from api.security import get_current_active_user
from open_notebook.domain.user import User
from open_notebook.domain.user_secret import UserProviderSecret
from open_notebook.utils.crypto import MissingEncryptionKeyError, ensure_secret_key_configured

router = APIRouter(prefix="/provider-secrets", tags=["provider-secrets"])


class ProviderSecretSummary(BaseModel):
    provider: str
    display_name: Optional[str] = None
    created: Optional[str] = None
    updated: Optional[str] = None


class ProviderSecretDetail(BaseModel):
    provider: str
    display_name: Optional[str] = None
    value: str = Field(..., description="Decrypted provider credential.")


class ProviderSecretCreate(BaseModel):
    provider: str = Field(..., description="Provider id, e.g. openai, anthropic, gemini")
    value: str = Field(..., description="API key or credential value")
    display_name: Optional[str] = Field(None, description="Optional label shown in UI")


@router.on_event("startup")
def ensure_crypto_ready():
    try:
        ensure_secret_key_configured()
    except MissingEncryptionKeyError as exc:
        raise RuntimeError("FERNET_SECRET_KEY must be configured before using provider secrets") from exc


@router.get("", response_model=List[ProviderSecretSummary])
async def list_provider_secrets(current_user: User = Depends(get_current_active_user)):
    secrets = await UserProviderSecret.list_for_user(current_user.id)
    summaries: List[ProviderSecretSummary] = []
    for secret in secrets:
        summaries.append(
            ProviderSecretSummary(
                provider=secret.provider,
                display_name=secret.display_name,
                created=secret.created.isoformat() if secret.created else None,
                updated=secret.updated.isoformat() if secret.updated else None,
            )
        )
    return summaries


@router.get("/{provider}", response_model=ProviderSecretDetail)
async def get_provider_secret(provider: str, current_user: User = Depends(get_current_active_user)):
    secret = await UserProviderSecret.get_for_user(current_user.id, provider)
    if not secret:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider credential not found")
    return ProviderSecretDetail(
        provider=provider,
        display_name=secret.display_name,
        value=secret.get_plain_value(),
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ProviderSecretSummary)
async def create_or_update_provider_secret(
    payload: ProviderSecretCreate,
    current_user: User = Depends(get_current_active_user),
):
    try:
        secret = await UserProviderSecret.upsert_secret(
            user=current_user.id,
            provider=payload.provider,
            value=payload.value,
            display_name=payload.display_name,
        )
    except MissingEncryptionKeyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return ProviderSecretSummary(
        provider=secret.provider,
        display_name=secret.display_name,
        created=secret.created.isoformat() if secret.created else None,
        updated=secret.updated.isoformat() if secret.updated else None,
    )


@router.delete("/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider_secret(provider: str, current_user: User = Depends(get_current_active_user)):
    deleted = await UserProviderSecret.delete_for_user(current_user.id, provider)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider credential not found")
    return None
