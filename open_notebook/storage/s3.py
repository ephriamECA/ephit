from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Optional, Tuple

try:
    import boto3
    from botocore.client import BaseClient
    from botocore.exceptions import BotoCoreError, ClientError
except ModuleNotFoundError as exc:  # pragma: no cover
    raise ModuleNotFoundError(
        "boto3 is required for S3 storage support. "
        "Install it with `uv pip install boto3` or `pip install boto3`."
    ) from exc
from loguru import logger


class S3StorageError(RuntimeError):
    """Raised when an S3 operation fails."""


def _get_bucket_name() -> Optional[str]:
    """Get bucket name, handling both regular bucket names and access point aliases."""
    bucket_name = os.getenv("S3_BUCKET_NAME")
    endpoint_url = os.getenv("S3_ENDPOINT_URL")
    
    if not bucket_name:
        return None
    
    # If we have an access point endpoint URL, extract the access point alias
    # From: https://accesspoint-XYZ-s3alias.s3-accesspoint.region.amazonaws.com
    # Extract: accesspoint-XYZ
    if endpoint_url and "accesspoint" in endpoint_url and "-s3alias" in endpoint_url:
        try:
            # Extract the access point alias from the endpoint URL
            # Format: https://accesspoint-ALIAS-s3alias...
            import re
            match = re.search(r'//([^/-]+)-s3alias', endpoint_url)
            if match:
                ap_alias = match.group(1)
                logger.info(f"Extracted access point alias from endpoint: {ap_alias}")
                return ap_alias
        except Exception as e:
            logger.warning(f"Failed to extract access point alias: {e}")
    
    # If it's an ARN (starts with "arn:aws:s3:"), extract the access point name
    if bucket_name.startswith("arn:aws:s3:"):
        # Extract access point name from ARN
        # Format: arn:aws:s3:region:account:accesspoint/name
        parts = bucket_name.split(":")
        if len(parts) >= 6:
            accesspoint_and_name = parts[5]  # Gets "accesspoint/name"
            ap_name = accesspoint_and_name.split("/")[-1]  # Get just "name"
            return ap_name
    
    return bucket_name


def _create_s3_client() -> BaseClient:
    """Create S3 client, handling both regular buckets and access points."""
    session = boto3.session.Session(
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        aws_session_token=os.getenv("AWS_SESSION_TOKEN"),
        region_name=os.getenv("S3_REGION") or None,
    )
    
    # If using an access point endpoint URL, configure for access point usage
    endpoint_url = os.getenv("S3_ENDPOINT_URL")
    
    return session.client("s3", endpoint_url=endpoint_url or None)


_S3_CLIENT: Optional[BaseClient] = None


def _client() -> BaseClient:
    global _S3_CLIENT
    if _S3_CLIENT is None:
        _S3_CLIENT = _create_s3_client()
    return _S3_CLIENT


def is_s3_configured() -> bool:
    """Return True when the required S3 environment variables are present."""
    return bool(
        _get_bucket_name()
        and os.getenv("AWS_ACCESS_KEY_ID")
        and os.getenv("AWS_SECRET_ACCESS_KEY")
    )


def build_episode_asset_key(user_id: Optional[str], episode_id: str, filename: str) -> str:
    """
    Build S3 key for podcast episodes.
    Removes colons and other invalid characters from IDs.
    """
    safe_user = user_id or "anonymous"
    
    # Extract clean IDs by removing the colon and table prefix
    # episode:cjdixrtq7y0lgevch43o -> cjdixrtq7y0lgevch43o
    clean_episode_id = episode_id.split(":")[-1] if ":" in episode_id else episode_id
    clean_user_id = safe_user.split(":")[-1] if ":" in str(safe_user) else str(safe_user)
    
    # Sanitize filename to remove or replace unsafe characters
    safe_filename = filename.replace(":", "_").replace(" ", "_")
    
    return f"episodes/{clean_user_id}/{clean_episode_id}/{safe_filename}"


def parse_s3_url(url: str) -> Tuple[Optional[str], Optional[str]]:
    """Split an s3://bucket/key style url into components."""
    if not url.startswith("s3://"):
        return None, None

    _, remainder = url.split("s3://", 1)
    parts = remainder.split("/", 1)
    if len(parts) != 2:
        return None, None
    return parts[0], parts[1]


async def upload_file(
    local_path: Path,
    key: str,
    content_type: Optional[str] = None,
) -> str:
    """
    Upload a local file to the configured S3 bucket or access point.

    Returns the canonical s3://bucket/key identifier.
    """
    if not is_s3_configured():
        raise S3StorageError("S3 storage is not configured")

    bucket_name = os.getenv("S3_BUCKET_NAME")
    endpoint_url = os.getenv("S3_ENDPOINT_URL")
    using_access_point = endpoint_url and "accesspoint" in endpoint_url
    
    client = _client()
    
    # For S3 Access Points with custom endpoint URLs:
    # - The endpoint URL points to the access point
    # - Use the access point alias as the bucket parameter
    # - Extract the alias from either the endpoint URL or use what's in S3_BUCKET_NAME
    
    # If we have an access point endpoint, extract the alias from the URL
    upload_bucket = bucket_name
    
    if using_access_point:
        # Try to extract access point alias from endpoint URL
        # Format: https://accesspoint-ALIAS-s3alias...
        if "-s3alias" in endpoint_url:
            import re
            match = re.search(r'//([^/-]+)-s3alias', endpoint_url)
            if match:
                upload_bucket = match.group(1)
                logger.info(f"Using access point alias: {upload_bucket} (from endpoint URL)")
            else:
                logger.info(f"Using bucket_name as-is: {upload_bucket}")
        else:
            logger.info(f"Using bucket_name: {upload_bucket}")
    
    extra_args = {}
    if content_type:
        extra_args["ContentType"] = content_type

    try:
        logger.info(f"Uploading {local_path} to S3 bucket: {upload_bucket}, key: {key}")
        await asyncio.to_thread(
            client.upload_file,
            str(local_path),
            upload_bucket,
            key,
            ExtraArgs=extra_args or None,
        )
        logger.info(f"Successfully uploaded to S3")
    except (BotoCoreError, ClientError) as exc:
        logger.error(f"Failed to upload {local_path} to S3: {exc}")
        raise S3StorageError(str(exc)) from exc

    # Return canonical identifier
    return f"s3://{bucket_name}/{key}"


def generate_presigned_url(key: str, expires_in: int = 3600) -> Optional[str]:
    if not is_s3_configured():
        return None

    bucket = _get_bucket_name()
    client = _client()

    try:
        return client.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_in,
        )
    except (BotoCoreError, ClientError) as exc:
        logger.error(f"Failed to generate presigned url for {key}: {exc}")
        return None


def delete_object(key: str) -> None:
    if not is_s3_configured():
        return

    bucket = _get_bucket_name()
    client = _client()
    try:
        client.delete_object(Bucket=bucket, Key=key)
    except (BotoCoreError, ClientError) as exc:
        logger.warning(f"Failed to delete S3 object {key}: {exc}")
