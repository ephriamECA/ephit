import os
from contextlib import asynccontextmanager
from typing import Dict, Optional

from loguru import logger

from open_notebook.domain.user_secret import UserProviderSecret

PROVIDER_ENV_MAPPING: Dict[str, str] = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GOOGLE_API_KEY",
    "google": "GOOGLE_API_KEY",
    "google-vertex": "GOOGLE_API_KEY",
    "vertexai": "GOOGLE_API_KEY",
    "mistral": "MISTRAL_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "xai": "XAI_API_KEY",
    "groq": "GROQ_API_KEY",
    "voyage": "VOYAGE_API_KEY",
    "elevenlabs": "ELEVENLABS_API_KEY",
    "cohere": "COHERE_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}


@asynccontextmanager
async def user_provider_context(user_id: Optional[str]):
    """
    Temporarily apply provider API keys for the given user to os.environ.
    Restores previous values when finished.
    """
    if not user_id:
        yield
        return

    secrets = await UserProviderSecret.list_for_user(user_id)
    if not secrets:
        yield
        return

    previous_values: Dict[str, Optional[str]] = {}
    try:
        for secret in secrets:
            env_var = PROVIDER_ENV_MAPPING.get(secret.provider)
            if not env_var:
                continue
            previous_values.setdefault(env_var, os.environ.get(env_var))
            os.environ[env_var] = secret.get_plain_value()
        yield
    finally:
        for env_var, previous in previous_values.items():
            if previous is None:
                os.environ.pop(env_var, None)
            else:
                os.environ[env_var] = previous
