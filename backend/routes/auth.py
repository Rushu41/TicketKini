from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import timedelta, datetime

from backend.database.database import get_db
from backend.database.models.user import User, GenderEnum, IDTypeEnum
from backend.models.user import UserCreate, UserLogin, UserOut, Token, AdminLogin, UserUpdate
from backend.middleware.jwt_auth import (
    create_access_token, 
    get_password_hash, 
    verify_password,
    get_current_user
)
from backend.config import settings
from backend.middleware.logger import log_user_action

router = APIRouter()

@router.post("/signup", response_model=dict, status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user"""
    
    existing_user_query = select(User).where(User.email == user_data.email)
    existing_user_result = await db.execute(existing_user_query)
    existing_user = existing_user_result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    existing_phone_query = select(User).where(User.phone == user_data.phone)
    existing_phone_result = await db.execute(existing_phone_query)
    existing_phone = existing_phone_result.scalar_one_or_none()
    
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number already registered"
        )
    
    hashed_password = get_password_hash(user_data.password)
    
    db_user = User(
        name=user_data.name,
        email=user_data.email,
        phone=user_data.phone,
        hashed_password=hashed_password,
    gender=GenderEnum(user_data.gender) if user_data.gender else None,
        date_of_birth=datetime.strptime(user_data.date_of_birth, '%Y-%m-%d') if user_data.date_of_birth else None,
    id_type=IDTypeEnum(user_data.id_type) if user_data.id_type else None,
        id_number=user_data.id_number
    )
    
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    log_user_action(
        user_id=db_user.id,
        action="USER_REGISTERED",
        details={"email": user_data.email, "phone": user_data.phone}
    )
    
    return {
        "message": "User registered successfully",
        "user_id": db_user.id,
        "email": db_user.email
    }

@router.post("/login", response_model=Token)
async def login(user_credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT token"""
    
    user_query = select(User).where(User.email == user_credentials.email)
    user_result = await db.execute(user_query)
    user = user_result.scalar_one_or_none()
    
    if not user or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "is_admin": user.is_admin},
        expires_delta=access_token_expires
    )
    
    user.last_login = datetime.now()
    await db.commit()
    
    log_user_action(
        user_id=user.id,
        action="USER_LOGIN",
        details={"email": user.email}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }

@router.post("/admin-login", response_model=Token)
async def admin_login(admin_credentials: AdminLogin, db: AsyncSession = Depends(get_db)):
    """Authenticate admin and return JWT token. Also ensure a corresponding DB admin user exists for /auth/me checks."""
    admin_email_cfg = (settings.ADMIN_EMAIL or "").strip()
    admin_password_cfg = (settings.ADMIN_PASSWORD or "").strip()

    if not (admin_email_cfg and admin_password_cfg):
        raise HTTPException(status_code=500, detail="Admin credentials not configured")

    cred_email = (admin_credentials.email or "").strip()
    cred_password = (admin_credentials.password or "").strip()

    # Compare email case-insensitively, password exactly (but trimmed)
    if cred_email.lower() != admin_email_cfg.lower() or cred_password != admin_password_cfg:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    # Upsert admin user so that /auth/me and admin guards succeed
    result = await db.execute(select(User).where(User.email == admin_email_cfg))
    user = result.scalar_one_or_none()
    if user is None:
        hashed_password = get_password_hash(admin_password_cfg)
        user = User(
            name="Administrator",
            email=admin_email_cfg,
            phone="01700000000",
            hashed_password=hashed_password,
            is_admin=True,
            is_active=True
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        # Ensure flags are correct
        updated = False
        if not user.is_admin:
            user.is_admin = True
            updated = True
        if not user.is_active:
            user.is_active = True
            updated = True
        if updated:
            await db.commit()

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": admin_email_cfg, "is_admin": True},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@router.get("/me", response_model=UserOut)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user

@router.put("/profile", response_model=UserOut)
async def update_profile(
    update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user's profile. Hash password if provided."""
    # Apply changes
    data = update.dict(exclude_unset=True)

    # Handle password separately
    new_password = data.pop("password", None)

    # Apply simple field updates
    for field, value in data.items():
        if hasattr(current_user, field):
            setattr(current_user, field, value)

    # Normalize enums for gender and id_type if provided as strings
    if "gender" in data and data["gender"] is not None:
        try:
            current_user.gender = GenderEnum(data["gender"])  # type: ignore
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid gender value")
    if "id_type" in data and data["id_type"] is not None:
        try:
            current_user.id_type = IDTypeEnum(data["id_type"])  # type: ignore
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid id_type value")

    # Parse date_of_birth if provided as string (YYYY-MM-DD)
    if "date_of_birth" in data and isinstance(data["date_of_birth"], str):
        try:
            current_user.date_of_birth = datetime.strptime(data["date_of_birth"], "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_of_birth format; expected YYYY-MM-DD")

    # Update password hash
    if new_password:
        current_user.hashed_password = get_password_hash(new_password)

    await db.commit()
    await db.refresh(current_user)

    log_user_action(
        user_id=current_user.id,
        action="USER_PROFILE_UPDATED",
        details={"fields": list(data.keys()) + (["password"] if new_password else [])}
    )

    return current_user
