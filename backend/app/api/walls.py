import secrets
import string
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_current_user, get_optional_user
from app.models import User, Wall, Stroke
from app.schemas import (
    WallCreate, WallUpdate, WallResponse, WallListResponse,
    StrokeCreate, StrokeResponse, StrokeListResponse,
    WallBySlugResponse
)

router = APIRouter(prefix="/walls", tags=["walls"])


def generate_slug() -> str:
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(8))


@router.post("", response_model=WallResponse, status_code=status.HTTP_201_CREATED)
def create_wall(wall_data: WallCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    slug = generate_slug()
    while db.query(Wall).filter(Wall.slug == slug).first():
        slug = generate_slug()

    wall = Wall(
        owner_id=current_user.id,
        title=wall_data.title,
        slug=slug,
        background_color=wall_data.background_color,
        is_public=wall_data.is_public
    )
    db.add(wall)
    db.commit()
    db.refresh(wall)

    return WallResponse(
        id=wall.id,
        owner_id=wall.owner_id,
        title=wall.title,
        slug=wall.slug,
        background_color=wall.background_color,
        is_public=wall.is_public,
        created_at=wall.created_at,
        updated_at=wall.updated_at,
        owner_name=current_user.name
    )


@router.get("", response_model=WallListResponse)
def list_walls(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    walls = db.query(Wall).filter(Wall.owner_id == current_user.id).order_by(Wall.created_at.desc()).all()
    return WallListResponse(walls=[
        WallResponse(
            id=w.id,
            owner_id=w.owner_id,
            title=w.title,
            slug=w.slug,
            background_color=w.background_color,
            is_public=w.is_public,
            created_at=w.created_at,
            updated_at=w.updated_at,
            owner_name=current_user.name
        ) for w in walls
    ])


@router.get("/{wall_id}", response_model=WallResponse)
def get_wall(wall_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_optional_user)):
    wall = db.query(Wall).filter(Wall.id == wall_id).first()
    if not wall:
        raise HTTPException(status_code=404, detail="Muro no encontrado")

    # Check access: owner or public wall
    if not wall.is_public and (not current_user or wall.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="No tienes acceso a este muro")

    return WallResponse(
        id=wall.id,
        owner_id=wall.owner_id,
        title=wall.title,
        slug=wall.slug,
        background_color=wall.background_color,
        is_public=wall.is_public,
        created_at=wall.created_at,
        updated_at=wall.updated_at,
        owner_name=wall.owner.name
    )


@router.get("/slug/{slug}", response_model=WallBySlugResponse)
def get_wall_by_slug(slug: str, db: Session = Depends(get_db)):
    wall = db.query(Wall).filter(Wall.slug == slug).first()
    if not wall:
        raise HTTPException(status_code=404, detail="Muro no encontrado")

    if not wall.is_public:
        raise HTTPException(status_code=404, detail="Muro no encontrado")

    return WallBySlugResponse(
        id=wall.id,
        owner_id=wall.owner_id,
        title=wall.title,
        slug=wall.slug,
        background_color=wall.background_color,
        is_public=wall.is_public,
        created_at=wall.created_at,
        updated_at=wall.updated_at,
        owner_name=wall.owner.name
    )


@router.patch("/{wall_id}", response_model=WallResponse)
def update_wall(wall_id: int, wall_data: WallUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wall = db.query(Wall).filter(Wall.id == wall_id).first()
    if not wall:
        raise HTTPException(status_code=404, detail="Muro no encontrado")

    if wall.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el propietario puede modificar el muro")

    if wall_data.title is not None:
        wall.title = wall_data.title
    if wall_data.background_color is not None:
        wall.background_color = wall_data.background_color
    if wall_data.is_public is not None:
        wall.is_public = wall_data.is_public

    db.commit()
    db.refresh(wall)

    return WallResponse(
        id=wall.id,
        owner_id=wall.owner_id,
        title=wall.title,
        slug=wall.slug,
        background_color=wall.background_color,
        is_public=wall.is_public,
        created_at=wall.created_at,
        updated_at=wall.updated_at,
        owner_name=current_user.name
    )


@router.post("/{wall_id}/reset", response_model=WallResponse)
def reset_wall(wall_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wall = db.query(Wall).filter(Wall.id == wall_id).first()
    if not wall:
        raise HTTPException(status_code=404, detail="Muro no encontrado")

    if wall.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el propietario puede resetear el muro")

    # Delete all strokes
    db.query(Stroke).filter(Stroke.wall_id == wall_id).delete()
    db.commit()
    db.refresh(wall)

    return WallResponse(
        id=wall.id,
        owner_id=wall.owner_id,
        title=wall.title,
        slug=wall.slug,
        background_color=wall.background_color,
        is_public=wall.is_public,
        created_at=wall.created_at,
        updated_at=wall.updated_at,
        owner_name=current_user.name
    )


@router.delete("/{wall_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wall(wall_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wall = db.query(Wall).filter(Wall.id == wall_id).first()
    if not wall:
        raise HTTPException(status_code=404, detail="Muro no encontrado")

    if wall.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el propietario puede eliminar el muro")

    db.delete(wall)
    db.commit()
    return None


# Stroke endpoints
@router.post("/{wall_id}/strokes", response_model=StrokeResponse, status_code=status.HTTP_201_CREATED)
def create_stroke(wall_id: int, stroke_data: StrokeCreate, db: Session = Depends(get_db), current_user: User = Depends(get_optional_user)):
    wall = db.query(Wall).filter(Wall.id == wall_id).first()
    if not wall:
        raise HTTPException(status_code=404, detail="Muro no encontrado")

    if not wall.is_public and (not current_user or wall.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="No tienes permiso para dibujar en este muro")

    stroke = Stroke(
        wall_id=wall_id,
        author_id=current_user.id if current_user else None,
        author_name=stroke_data.author_name,
        tool=stroke_data.tool,
        color=stroke_data.color,
        width=stroke_data.width,
        points=[p.model_dump() for p in stroke_data.points]
    )
    db.add(stroke)
    db.commit()
    db.refresh(stroke)

    return StrokeResponse(
        id=stroke.id,
        wall_id=stroke.wall_id,
        author_id=stroke.author_id,
        author_name=stroke.author_name,
        tool=stroke.tool,
        color=stroke.color,
        width=stroke.width,
        points=stroke.points,
        created_at=stroke.created_at
    )


@router.get("/{wall_id}/strokes", response_model=StrokeListResponse)
def list_strokes(wall_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_optional_user)):
    wall = db.query(Wall).filter(Wall.id == wall_id).first()
    if not wall:
        raise HTTPException(status_code=404, detail="Muro no encontrado")

    if not wall.is_public and (not current_user or wall.owner_id != current_user.id):
        raise HTTPException(status_code=403, detail="No tienes acceso a este muro")

    strokes = db.query(Stroke).filter(Stroke.wall_id == wall_id).order_by(Stroke.created_at.asc()).all()
    return StrokeListResponse(strokes=[
        StrokeResponse(
            id=s.id,
            wall_id=s.wall_id,
            author_id=s.author_id,
            author_name=s.author_name,
            tool=s.tool,
            color=s.color,
            width=s.width,
            points=s.points,
            created_at=s.created_at
        ) for s in strokes
    ])


@router.delete("/{wall_id}/strokes/{stroke_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stroke(wall_id: int, stroke_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    wall = db.query(Wall).filter(Wall.id == wall_id).first()
    if not wall:
        raise HTTPException(status_code=404, detail="Muro no encontrado")

    if wall.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el propietario puede borrar trazos")

    stroke = db.query(Stroke).filter(Stroke.id == stroke_id, Stroke.wall_id == wall_id).first()
    if not stroke:
        raise HTTPException(status_code=404, detail="Trazo no encontrado")

    db.delete(stroke)
    db.commit()
    return None