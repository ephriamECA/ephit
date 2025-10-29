from fastapi import APIRouter, Depends, HTTPException, status

from api.admin_service import admin_service
from api.models import AdminUserDetail, AdminUserSummary, MessageResponse
from api.security import require_admin
from open_notebook.domain.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserSummary])
async def list_users(current_user: User = Depends(require_admin)):
    return await admin_service.list_users()


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(user_id: str, current_user: User = Depends(require_admin)):
    try:
        return await admin_service.get_user_detail(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/users/{user_id}/clear", response_model=MessageResponse)
async def clear_user_data(user_id: str, current_user: User = Depends(require_admin)):
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot clear their own data.",
        )

    try:
        await admin_service.clear_user_data(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return MessageResponse(message="User data cleared successfully.")
