from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, validator
from app.models import ToolType


# User schemas
class UserBase(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=2, max_length=100)


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True


# Token schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None


# Wall schemas
class WallBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    background_color: str = Field(default="#ffffff", pattern="^#[0-9a-fA-F]{6}$")
    is_public: bool = True


class WallCreate(WallBase):
    pass


class WallUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    background_color: Optional[str] = Field(None, pattern="^#[0-9a-fA-F]{6}$")
    is_public: Optional[bool] = None


class WallResponse(WallBase):
    id: int
    owner_id: int
    slug: str
    created_at: datetime
    updated_at: datetime
    owner_name: Optional[str] = None

    class Config:
        orm_mode = True


class WallListResponse(BaseModel):
    walls: List[WallResponse]


# Stroke schemas
class StrokePoint(BaseModel):
    x: float
    y: float
    pressure: Optional[float] = 1.0
    time: int


class StrokeBase(BaseModel):
    tool: ToolType = ToolType.pen
    color: str = Field(default="#000000", pattern="^#[0-9a-fA-F]{6}$")
    width: int = Field(default=2, ge=1, le=50)
    points: List[StrokePoint]


class StrokeCreate(StrokeBase):
    author_id: Optional[int] = None
    author_name: str = "Anónimo"


class StrokeResponse(StrokeBase):
    id: int
    wall_id: int
    author_id: Optional[int]
    author_name: str
    created_at: datetime

    class Config:
        orm_mode = True


class StrokeListResponse(BaseModel):
    strokes: List[StrokeResponse]


# Public wall lookup
class WallBySlugResponse(BaseModel):
    id: int
    owner_id: int
    title: str
    slug: str
    background_color: str
    is_public: bool
    created_at: datetime
    updated_at: datetime
    owner_name: str

    class Config:
        orm_mode = True