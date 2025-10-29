#!/usr/bin/env python3
"""
Upload existing local podcasts to S3.
This script finds all podcast episodes with local audio files and uploads them to S3.
"""

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger

# Load environment variables
load_dotenv()

# Set up environment variables for S3
os.environ['S3_BUCKET_NAME'] = os.getenv('S3_BUCKET_NAME', 'accesspoint')
os.environ['S3_ENDPOINT_URL'] = os.getenv('S3_ENDPOINT_URL', '')
os.environ['AWS_ACCESS_KEY_ID'] = os.getenv('AWS_ACCESS_KEY_ID', '')
os.environ['AWS_SECRET_ACCESS_KEY'] = os.getenv('AWS_SECRET_ACCESS_KEY', '')
os.environ['S3_REGION'] = os.getenv('S3_REGION', 'us-east-2')

from open_notebook.config import DATA_FOLDER
from open_notebook.database.repository import repo_query
from open_notebook.domain.podcast import PodcastEpisode
from open_notebook.storage import build_episode_asset_key, is_s3_configured, upload_file, S3StorageError


async def upload_existing_podcasts():
    """Upload all existing local podcast episodes to S3."""
    
    if not is_s3_configured():
        logger.error("❌ S3 is not configured. Please set S3 environment variables in .env")
        return
    
    logger.info("✅ S3 is configured")
    
    # Get all podcast episodes
    episodes = await PodcastEpisode.get_all()
    
    logger.info(f"\nFound {len(episodes)} total episodes")
    
    uploaded_count = 0
    skipped_count = 0
    failed_count = 0
    
    for episode in episodes:
        if not episode.audio_file:
            logger.warning(f"\n⚠️  '{episode.name}' has no audio_file - skipping")
            skipped_count += 1
            continue
        
        # Check if already in S3
        if episode.audio_file.startswith("s3://"):
            logger.info(f"✅ '{episode.name}' already in S3: {episode.audio_file}")
            skipped_count += 1
            continue
        
        # Check if local file exists
        audio_path = Path(episode.audio_file)
        
        if not audio_path.exists():
            logger.warning(f"⚠️  '{episode.name}' local file not found: {episode.audio_file}")
            skipped_count += 1
            continue
        
        logger.info(f"\n📤 Uploading '{episode.name}'...")
        logger.info(f"   Local: {audio_path}")
        logger.info(f"   Size: {audio_path.stat().st_size / 1024 / 1024:.2f} MB")
        
        try:
            # Build S3 key for this episode
            key = build_episode_asset_key(
                str(episode.id).split(":")[-1],  # Extract episode ID
                str(episode.id),  # Use episode ID as the key component
                audio_path.name,  # Filename
            )
            
            logger.info(f"   S3 Key: {key}")
            
            # Upload to S3
            storage_url = await upload_file(
                audio_path,
                key,
                content_type="audio/mpeg",
            )
            
            logger.info(f"   ✅ Uploaded to: {storage_url}")
            
            # Update episode in database with S3 URL
            episode.audio_file = storage_url
            await episode.save()
            
            logger.info(f"   ✅ Updated database with S3 URL")
            
            # Delete local file
            try:
                audio_path.unlink()
                logger.info(f"   ✅ Deleted local file to save space")
            except OSError as e:
                logger.warning(f"   ⚠️  Failed to delete local file: {e}")
            
            uploaded_count += 1
            
        except S3StorageError as e:
            logger.error(f"   ❌ Failed to upload '{episode.name}': {e}")
            failed_count += 1
        except Exception as e:
            logger.error(f"   ❌ Unexpected error uploading '{episode.name}': {e}")
            failed_count += 1
    
    # Summary
    logger.info("\n" + "="*60)
    logger.info("📊 UPLOAD SUMMARY")
    logger.info("="*60)
    logger.info(f"✅ Uploaded: {uploaded_count}")
    logger.info(f"⏭️  Skipped: {skipped_count}")
    logger.info(f"❌ Failed: {failed_count}")
    logger.info(f"📁 Total: {len(episodes)}")
    logger.info("="*60)


if __name__ == "__main__":
    asyncio.run(upload_existing_podcasts())

