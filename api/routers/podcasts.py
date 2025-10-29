from pathlib import Path
from typing import List, Optional
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from loguru import logger
from pydantic import BaseModel

from api.podcast_service import (
    PodcastGenerationRequest,
    PodcastGenerationResponse,
    PodcastService,
)
from api.security import get_current_active_user
from open_notebook.domain.user import User
from open_notebook.storage import (
    delete_object,
    generate_presigned_url,
    parse_s3_url,
)

router = APIRouter()


class PodcastEpisodeResponse(BaseModel):
    id: str
    name: str
    episode_profile: dict
    speaker_profile: dict
    briefing: str
    audio_file: Optional[str] = None
    audio_url: Optional[str] = None
    transcript: Optional[dict] = None
    outline: Optional[dict] = None
    created: Optional[str] = None
    job_status: Optional[str] = None


def _resolve_audio_path(audio_file: str) -> Path:
    """Resolve audio file path - handles both absolute and relative paths."""
    if audio_file.startswith("file://"):
        parsed = urlparse(audio_file)
        return Path(unquote(parsed.path))
    # Resolve the path to absolute
    audio_path = Path(audio_file)
    # If it's already absolute, return it as-is
    if audio_path.is_absolute():
        return audio_path
    # Otherwise, resolve relative to project root
    return audio_path.resolve()


@router.post("/podcasts/generate", response_model=PodcastGenerationResponse)
async def generate_podcast(
    request: PodcastGenerationRequest,
    current_user: User = Depends(get_current_active_user),
):
    """
    Generate a podcast episode using Episode Profiles.
    Returns immediately with job ID for status tracking.
    """
    try:
        job_id = await PodcastService.submit_generation_job(
            episode_profile_name=request.episode_profile,
            speaker_profile_name=request.speaker_profile,
            episode_name=request.episode_name,
            notebook_id=request.notebook_id,
            content=request.content,
            briefing_suffix=request.briefing_suffix,
            user_id=str(current_user.id),
        )

        return PodcastGenerationResponse(
            job_id=job_id,
            status="submitted",
            message=f"Podcast generation started for episode '{request.episode_name}'",
            episode_profile=request.episode_profile,
            episode_name=request.episode_name,
        )

    except Exception as e:
        logger.error(f"Error generating podcast: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate podcast: {str(e)}"
        )


@router.get("/podcasts/jobs/{job_id}")
async def get_podcast_job_status(job_id: str):
    """Get the status of a podcast generation job"""
    try:
        status_data = await PodcastService.get_job_status(job_id)
        return status_data

    except Exception as e:
        logger.error(f"Error fetching podcast job status: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch job status: {str(e)}"
        )


@router.get("/podcasts/episodes", response_model=List[PodcastEpisodeResponse])
async def list_podcast_episodes(
    current_user: User = Depends(get_current_active_user),
):
    """List all podcast episodes for the current user"""
    try:
        episodes = await PodcastService.list_episodes_for_user(current_user.id)

        response_episodes = []
        for episode in episodes:
            # Skip incomplete episodes without command or audio
            if not episode.command and not episode.audio_file:
                continue
            
            # Get job status if available
            job_status = None
            if episode.command:
                try:
                    job_status = await episode.get_job_status()
                except Exception:
                    job_status = "unknown"
            else:
                # No command but has audio file = completed import
                job_status = "completed"

            audio_url = None
            if episode.audio_file:
                # Always use the backend API endpoint for audio (works for both S3 and local)
                audio_url = f"/api/podcasts/episodes/{episode.id}/audio"
                logger.info(f"Setting audio_url for episode '{episode.name}': {audio_url}")

            response_episodes.append(
                PodcastEpisodeResponse(
                    id=str(episode.id),
                    name=episode.name,
                    episode_profile=episode.episode_profile,
                    speaker_profile=episode.speaker_profile,
                    briefing=episode.briefing,
                    audio_file=episode.audio_file,
                    audio_url=audio_url,
                    transcript=episode.transcript,
                    outline=episode.outline,
                    created=str(episode.created) if episode.created else None,
                    job_status=job_status,
                )
            )

        return response_episodes

    except Exception as e:
        logger.error(f"Error listing podcast episodes: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to list podcast episodes: {str(e)}"
        )


@router.get("/podcasts/episodes/{episode_id}", response_model=PodcastEpisodeResponse)
async def get_podcast_episode(
    episode_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Get a specific podcast episode (owned by current user)"""
    try:
        episode = await PodcastService.get_episode(episode_id)
        
        # Check that the episode belongs to the current user
        if episode.owner and str(episode.owner) != str(current_user.id):
            raise HTTPException(status_code=403, detail="Episode not found")

        # Get job status if available
        job_status = None
        if episode.command:
            try:
                job_status = await episode.get_job_status()
            except Exception:
                job_status = "unknown"
        else:
            # No command but has audio file = completed import
            job_status = "completed" if episode.audio_file else "unknown"

        audio_url = None
        if episode.audio_file:
            # Always use the backend API endpoint for audio
            audio_url = f"/api/podcasts/episodes/{episode.id}/audio"

        return PodcastEpisodeResponse(
            id=str(episode.id),
            name=episode.name,
            episode_profile=episode.episode_profile,
            speaker_profile=episode.speaker_profile,
            briefing=episode.briefing,
            audio_file=episode.audio_file,
            audio_url=audio_url,
            transcript=episode.transcript,
            outline=episode.outline,
            created=str(episode.created) if episode.created else None,
            job_status=job_status,
        )

    except Exception as e:
        logger.error(f"Error fetching podcast episode: {str(e)}")
        raise HTTPException(status_code=404, detail=f"Episode not found: {str(e)}")


@router.get("/podcasts/episodes/{episode_id}/audio")
async def stream_podcast_episode_audio(episode_id: str):
    """Stream the audio file associated with a podcast episode"""
    try:
        episode = await PodcastService.get_episode(episode_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching podcast episode for audio: {str(e)}")
        raise HTTPException(status_code=404, detail=f"Episode not found: {str(e)}")

    if not episode.audio_file:
        raise HTTPException(status_code=404, detail="Episode has no audio file")

    if episode.audio_file.startswith("s3://"):
        _, key = parse_s3_url(episode.audio_file)
        if not key:
            raise HTTPException(status_code=404, detail="Invalid audio file reference")
        
        # Download from S3 and serve
        try:
            from open_notebook.storage.s3 import is_s3_configured
            import boto3
            import tempfile
            import os
            
            if not is_s3_configured():
                raise HTTPException(status_code=500, detail="S3 not configured")
            
            # Get S3 client directly
            bucket = os.getenv("S3_BUCKET_NAME")
            aws_access_key = os.getenv("AWS_ACCESS_KEY_ID")
            aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
            
            client = boto3.client(
                's3',
                aws_access_key_id=aws_access_key,
                aws_secret_access_key=aws_secret_key,
                region_name=os.getenv('S3_REGION', 'us-east-2')
            )
            
            # Create a temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_file:
                temp_path = tmp_file.name
            
            try:
                # Download file from S3
                logger.info(f"Downloading from S3: bucket={bucket}, key={key}")
                client.download_file(bucket, key, temp_path)
                
                logger.info(f"Downloaded S3 audio to {temp_path}, returning to client")
                
                # Return as FileResponse
                return FileResponse(
                    temp_path,
                    media_type="audio/mpeg",
                    filename=episode.name + ".mp3",
                    background=None  # Don't delete immediately
                )
            except Exception as e:
                # Clean up on error
                logger.error(f"Failed to download from S3: {e}")
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                raise e
                
        except Exception as e:
            logger.error(f"Failed to stream S3 audio: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to retrieve audio from S3: {str(e)}")

    audio_path = _resolve_audio_path(episode.audio_file)
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    return FileResponse(
        audio_path,
        media_type="audio/mpeg",
        filename=audio_path.name,
    )


@router.delete("/podcasts/episodes/{episode_id}")
async def delete_podcast_episode(episode_id: str):
    """Delete a podcast episode and its associated audio file"""
    try:
        # Get the episode first to check if it exists and get the audio file path
        episode = await PodcastService.get_episode(episode_id)
        
        # Delete the stored audio asset if it exists
        if episode.audio_file:
            if episode.audio_file.startswith("s3://"):
                _, key = parse_s3_url(episode.audio_file)
                if key:
                    delete_object(key)
                    logger.info(f"Deleted S3 audio object: {key}")
            else:
                audio_path = _resolve_audio_path(episode.audio_file)
                if audio_path.exists():
                    try:
                        audio_path.unlink()
                        logger.info(f"Deleted audio file: {audio_path}")
                    except Exception as e:
                        logger.warning(f"Failed to delete audio file {audio_path}: {e}")
        
        # Delete the episode from the database
        await episode.delete()
        
        logger.info(f"Deleted podcast episode: {episode_id}")
        return {"message": "Episode deleted successfully", "episode_id": episode_id}
        
    except Exception as e:
        logger.error(f"Error deleting podcast episode: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete episode: {str(e)}")
