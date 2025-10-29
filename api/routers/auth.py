import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from loguru import logger

from api.models import AuthResponse, TokenResponse, UserCreate, UserLogin, UserResponse
from api.security import (
    create_access_token,
    get_current_active_user,
    get_password_hash,
    verify_password,
)
from open_notebook.domain.user import User
from open_notebook.exceptions import InvalidInputError

router = APIRouter(prefix="/auth", tags=["auth"])


def registrations_allowed() -> bool:
    """
    Toggle user self-registration.
    Set ALLOW_REGISTRATION=false to disable.
    """
    return os.environ.get("ALLOW_REGISTRATION", "true").lower() == "true"


def build_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id or "",
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        is_admin=user.is_admin,
        has_completed_onboarding=user.has_completed_onboarding,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserCreate):
    if not registrations_allowed():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User registration is disabled")

    existing_user = await User.get_by_email(payload.email)
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    display_name = payload.display_name or payload.email.split("@")[0]
    new_user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        display_name=display_name,
        is_active=True,
    )

    try:
        await new_user.save()
    except InvalidInputError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))
    except Exception as error:
        logger.error(f"Failed to create user: {error}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create user")

    access_token = create_access_token({"sub": new_user.id})
    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=build_user_response(new_user),
    )


async def _authenticate(email: str, password: str) -> Optional[User]:
    user = await User.get_by_email(email)
    if not user:
        return None
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    if not verify_password(password, user.hashed_password):
        return None
    return user


@router.post("/login", response_model=AuthResponse)
async def login_user(payload: UserLogin):
    user = await _authenticate(payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    token = create_access_token({"sub": user.id})
    return AuthResponse(
        access_token=token,
        token_type="bearer",
        user=build_user_response(user),
    )


@router.post("/token", response_model=TokenResponse, include_in_schema=False)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await _authenticate(form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def read_current_user(current_user: User = Depends(get_current_active_user)):
    return build_user_response(current_user)


@router.put("/onboarding/complete", response_model=UserResponse)
async def complete_onboarding(current_user: User = Depends(get_current_active_user)):
    """Mark onboarding as complete for the current user."""
    current_user.has_completed_onboarding = True
    await current_user.update()
    return build_user_response(current_user)
