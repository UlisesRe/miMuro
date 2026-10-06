from datetime import timedelta
from starlette.requests import Request
from fastapi import APIRouter, Depends, HTTPException, status, Response, Cookie, Header
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, decode_token, subject_id
)
from app.core.config import get_settings
from app.models import User, Wall, Stroke, ToolType
from app.schemas import (
    UserCreate, UserLogin, UserResponse, Token,
    WallCreate, WallUpdate, WallResponse, WallListResponse,
    StrokeCreate, StrokeResponse, StrokeListResponse,
    WallBySlugResponse
)

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])


def get_current_user(
    request: Request,
    access_token: str = Cookie(None),
    authorization: str = Header(None),
    db: Session = Depends(get_db)
) -> User:
    # Try cookie first, then Authorization header
    token = access_token
    if not token and authorization and authorization.startswith('Bearer '):
        token = authorization[7:]
    
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Token inválido")
    user_id = subject_id(payload)
    user = db.query(User).filter(User.id == user_id).first() if user_id is not None else None
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


def get_optional_user(
    request: Request,
    access_token: str = Cookie(None),
    authorization: str = Header(None),
    db: Session = Depends(get_db)
) -> Optional[User]:
    token = access_token
    if not token and authorization and authorization.startswith('Bearer '):
        token = authorization[7:]
    
    if not token:
        return None
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        return None
    user_id = subject_id(payload)
    if user_id is None:
        return None
    return db.query(User).filter(User.id == user_id).first()


@router.post("/register", response_model=Token)
def register(user_data: UserCreate, response: Response, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    user = User(
        email=user_data.email,
        name=user_data.name,
        password_hash=get_password_hash(user_data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token({"sub": user.id})
    refresh_token = create_refresh_token({"sub": user.id})

    response.set_cookie(
        key="access_token", value=access_token,
        httponly=True, secure=False, samesite="lax",
        max_age=settings.access_token_expire_minutes * 60
    )
    response.set_cookie(
        key="refresh_token", value=refresh_token,
        httponly=True, secure=False, samesite="lax",
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60
    )
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    access_token = create_access_token({"sub": user.id})
    refresh_token = create_refresh_token({"sub": user.id})

    response.set_cookie(
        key="access_token", value=access_token,
        httponly=True, secure=False, samesite="lax",
        max_age=settings.access_token_expire_minutes * 60
    )
    response.set_cookie(
        key="refresh_token", value=refresh_token,
        httponly=True, secure=False, samesite="lax",
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60
    )
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
def refresh_token(response: Response, refresh_token: str = Cookie(None), db: Session = Depends(get_db)):
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token requerido")

    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Refresh token inválido")

    user_id = subject_id(payload)
    user = db.query(User).filter(User.id == user_id).first() if user_id is not None else None
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    new_access = create_access_token({"sub": user.id})
    new_refresh = create_refresh_token({"sub": user.id})

    response.set_cookie(
        key="access_token", value=new_access,
        httponly=True, secure=False, samesite="lax",
        max_age=settings.access_token_expire_minutes * 60
    )
    response.set_cookie(
        key="refresh_token", value=new_refresh,
        httponly=True, secure=False, samesite="lax",
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60
    )
    return Token(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token", httponly=True, secure=False, samesite="lax")
    response.delete_cookie("refresh_token", httponly=True, secure=False, samesite="lax")
    return {"message": "Sesión cerrada"}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user