"""
Health check endpoint for monitoring service status.

Checks:
- Database connectivity
- Migration status
- Service uptime
"""
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from loguru import logger

from open_notebook.database.async_migrate import AsyncMigrationManager
from open_notebook.database.repository import db_connection

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Comprehensive health check endpoint.
    
    Returns 200 if all systems are healthy, 503 if any check fails.
    Useful for:
    - Render health checks
    - Load balancer health checks  
    - Monitoring/alerting systems
    """
    health = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {}
    }
    
    # Check 1: Database connectivity
    try:
        async with db_connection() as db:
            # Simple query to verify connection
            result = await db.query("SELECT 1 AS test")
            if result and len(result) > 0:
                health["checks"]["database"] = {"status": "ok", "connected": True}
            else:
                raise Exception("Query returned no results")
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["database"] = {
            "status": "failed",
            "error": str(e),
            "connected": False
        }
        logger.error(f"Health check database failure: {e}")
    
    # Check 2: Migration status
    try:
        manager = AsyncMigrationManager()
        version = await manager.get_current_version()
        needs_migration = await manager.needs_migration()
        
        if needs_migration:
            health["status"] = "degraded"
            health["checks"]["migrations"] = {
                "status": "warning",
                "message": "Migrations pending",
                "current_version": version
            }
        else:
            health["checks"]["migrations"] = {
                "status": "ok",
                "current_version": version,
                "up_to_date": True
            }
    except Exception as e:
        health["status"] = "unhealthy"
        health["checks"]["migrations"] = {
            "status": "failed",
            "error": str(e)
        }
        logger.error(f"Health check migration failure: {e}")
    
    # Determine HTTP status code
    if health["status"] == "healthy":
        status_code = 200
    elif health["status"] == "degraded":
        status_code = 200  # Still return 200 for degraded (service usable)
    else:
        status_code = 503  # Service unavailable
    
    return JSONResponse(content=health, status_code=status_code)


@router.get("/")
async def root_health():
    """
    Simple health check for basic availability.
    Returns 200 if service is running.
    """
    return {"status": "ok", "service": "open-notebook-api"}

