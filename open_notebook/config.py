import os
from pathlib import Path


def get_data_folder() -> str:
    """
    Get data folder based on environment.
    
    Priority:
    1. DATA_PATH env var (explicit override for Render/Docker)
    2. /mydata if it exists (Render persistent storage auto-detect)
    3. ./data (local development fallback)
    
    This ensures uploaded files, podcasts, and checkpoints persist across
    container restarts on Render while maintaining local dev compatibility.
    """
    # Explicit override (set in render.yaml or docker-compose)
    if env_path := os.getenv("DATA_PATH"):
        return env_path
    
    # Auto-detect Render persistent storage
    render_path = Path("/mydata")
    if render_path.exists() and render_path.is_dir():
        return str(render_path)
    
    # Local development fallback
    return "./data"


# ROOT DATA FOLDER - Automatically uses /mydata on Render, ./data locally
DATA_FOLDER = get_data_folder()

# LANGGRAPH CHECKPOINT FILE
sqlite_folder = f"{DATA_FOLDER}/sqlite-db"
os.makedirs(sqlite_folder, exist_ok=True)
LANGGRAPH_CHECKPOINT_FILE = f"{sqlite_folder}/checkpoints.sqlite"

# UPLOADS FOLDER - Now persists across deployments!
UPLOADS_FOLDER = f"{DATA_FOLDER}/uploads"
os.makedirs(UPLOADS_FOLDER, exist_ok=True)

# TIKTOKEN CACHE FOLDER
TIKTOKEN_CACHE_DIR = f"{DATA_FOLDER}/tiktoken-cache"
os.makedirs(TIKTOKEN_CACHE_DIR, exist_ok=True)
