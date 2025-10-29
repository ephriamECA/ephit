#!/usr/bin/env python3
"""
Fix existing episode S3 paths by re-uploading with corrected keys.
"""

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger

# Load environment variables
load_dotenv()

os.environ['S3_BUCKET_NAME'] = os.getenv('S3_BUCKET_NAME', 'practiceeph')
os.environ['AWS_ACCESS_KEY_ID'] = os.getenv('AWS_ACCESS_KEY_ID', '')
os.environ['AWS_SECRET_ACCESS_KEY'] = os.getenv('AWS_SECRET_ACCESS_KEY', '')
os.environ['S3_REGION'] = os.getenv('S3_REGION', 'us-east-2')

from open_notebook.domain.podcast import PodcastEpisode
from open_notebook.storage import build_episode_asset_key, upload_file, S3StorageError
from open_notebook.config import DATA_FOLDER


async def fix_s3_keys():
    """Re-upload episodes with corrected keys"""
    
    episodes = await PodcastEpisode.get_all()
    
    print(f"\n🔧 Found {len(episodes)} episodes\n")
    
    for ep in episodes:
        if not ep.audio_file or not ep.audio_file.startswith("s3://"):
            continue
        
        old_key = ep.audio_file.split("s3://practiceeph/")[-1] if "s3://practiceeph/" in ep.audio_file else ""
        
        # Build correct key (without colon)
        user_id = str(ep.owner) if ep.owner else None
        clean_user = user_id.split(":")[-1] if user_id and ":" in user_id else user_id
        clean_episode_id = str(ep.id).split(":")[-1]
        
        # Get filename from old path
        filename = old_key.split("/")[-1] if "/" in old_key else ep.name + ".mp3"
        safe_filename = filename.replace(":", "_").replace(" ", "_")
        
        new_key = f"episodes/{clean_user}/{clean_episode_id}/{safe_filename}"
        
        print(f"Episode: {ep.name}")
        print(f"  Old: {old_key}")
        print(f"  New: {new_key}")
        
        if old_key == new_key:
            print("  ✅ Key is correct\n")
        else:
            print(f"  ⚠️  Keys don't match - need to re-upload\n")


if __name__ == "__main__":
    asyncio.run(fix_s3_keys())

