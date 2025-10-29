import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from loguru import logger


FERNET_SECRET_ENV = "FERNET_SECRET_KEY"
FERNET_SECRET_FILE_ENV = "FERNET_SECRET_FILE"
DEFAULT_SECRET_FILE = Path(__file__).resolve().parents[2] / ".secrets" / "fernet.key"


class MissingEncryptionKeyError(RuntimeError):
    """Raised when FERNET_SECRET_KEY is not configured."""


def _load_env_secret() -> Optional[str]:
    key = os.getenv(FERNET_SECRET_ENV)
    if key:
        return key.strip()
    return None


def _resolve_secret_file() -> Path:
    file_override = os.getenv(FERNET_SECRET_FILE_ENV)
    if file_override:
        return Path(file_override).expanduser().resolve()
    return DEFAULT_SECRET_FILE


def _read_secret_from_file(path: Path) -> Optional[str]:
    try:
        contents = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None
    except OSError as exc:
        logger.warning("Unable to read Fernet key at {}: {}", path, exc)
        return None
    if not contents:
        return None
    return contents


def _write_secret_to_file(path: Path, key: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(key, encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except PermissionError:
        # Permissions may not be adjustable on some platforms; ignore quietly.
        pass
    logger.info("Auto-generated Fernet secret at {}", path)


def _get_or_create_secret_key() -> str:
    key = _load_env_secret()
    if key:
        return key

    secret_file = _resolve_secret_file()
    key = _read_secret_from_file(secret_file)
    if key:
        os.environ[FERNET_SECRET_ENV] = key
        return key

    generated_key = Fernet.generate_key().decode("utf-8")
    try:
        _write_secret_to_file(secret_file, generated_key)
    except OSError as exc:
        logger.warning(
            "Unable to persist auto-generated Fernet key to {}: {}", secret_file, exc
        )
    os.environ[FERNET_SECRET_ENV] = generated_key
    return generated_key


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    key = _get_or_create_secret_key()
    if not key:
        raise MissingEncryptionKeyError(
            "FERNET_SECRET_KEY environment variable is required for secret storage."
        )
    try:
        return Fernet(key)
    except (ValueError, TypeError) as exc:
        raise MissingEncryptionKeyError(
            "FERNET_SECRET_KEY must be a valid 32-byte url-safe base64 value."
        ) from exc


def encrypt_value(value: str) -> str:
    """Encrypt plain text using Fernet."""
    fernet = _get_fernet()
    token = fernet.encrypt(value.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_value(token: str) -> str:
    """Decrypt previously encrypted value."""
    fernet = _get_fernet()
    try:
        value = fernet.decrypt(token.encode("utf-8"))
        return value.decode("utf-8")
    except InvalidToken as exc:
        logger.error("Failed to decrypt value with configured FERNET_SECRET_KEY.")
        raise


def ensure_secret_key_configured() -> None:
    """Eagerly validate that encryption key is available."""
    _get_fernet()
