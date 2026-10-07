import secrets
import string
import json
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, List, Set

from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse, Response
from starlette.routing import Route, WebSocketRoute, Mount
from starlette.websockets import WebSocket, WebSocketDisconnect
from starlette.requests import Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import engine, Base, get_db, run_light_migrations
from app.core import confirmation as confirmation_service
from app.core import email as email_service
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, decode_token, subject_id
)
from app.models import User, Wall, Stroke, Signer, ToolType

settings = get_settings()


# ==========================================
# Helper functions
# ==========================================

def generate_slug() -> str:
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(8))


def validate_email(email: str) -> bool:
    import re
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email))


def validate_hex_color(color: str) -> bool:
    import re
    return bool(re.match(r'^#[0-9a-fA-F]{6}$', color))


def get_current_user(request: Request, db: Session) -> User:
    # Try cookie first, then Authorization header
    access_token = request.cookies.get("access_token")
    if not access_token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            access_token = auth_header[7:]
    
    if not access_token:
        raise HTTPException(status_code=401, detail="No autenticado")
    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Token inválido")
    user_id = subject_id(payload)
    user = db.query(User).filter(User.id == user_id).first() if user_id is not None else None
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


def get_optional_user(request: Request, db: Session) -> Optional[User]:
    access_token = request.cookies.get("access_token")
    if not access_token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            access_token = auth_header[7:]
    
    if not access_token:
        return None
    payload = decode_token(access_token)
    if not payload or payload.get("type") != "access":
        return None
    user_id = subject_id(payload)
    if user_id is None:
        return None
    return db.query(User).filter(User.id == user_id).first()


def get_client_ip(request: Request) -> str:
    # Detrás de un proxy/nginx la IP real llega en X-Forwarded-For
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return ""


def hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{settings.secret_key}:{ip}".encode("utf-8")).hexdigest()


def record_signature(request: Request, wall: Wall, user: Optional[User], db: Session) -> bool:
    """Registra una firma mientras sea una persona distinta del dueño.

    Cada IP única suma 1 (aunque vuelva a entrar y edite); el dueño
    dibujando sobre su propio muro nunca cuenta como firma.
    """
    if user and wall.owner_id == user.id:
        return False
    ip = get_client_ip(request)
    if not ip:
        return False
    ip_hash = hash_ip(ip)
    exists = db.query(Signer.id).filter(Signer.ip_hash == ip_hash).first() is not None
    if exists:
        return False
    db.add(Signer(ip_hash=ip_hash, wall_id=wall.id, author_id=user.id if user else None))
    db.commit()
    return True


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


# ==========================================
# Auth routes
# ==========================================

def _pending_registration_response(user: User, email_sent: bool) -> JSONResponse:
    return JSONResponse({
        "message": "Código de confirmación enviado a tu correo",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_confirmed": False
        },
        "email_confirmation": {
            "required": True,
            "sent": email_sent,
            "destiny": user.email,
            "expires_in_minutes": settings.confirmation_code_expire_minutes,
            "resend_cooldown_seconds": settings.confirmation_resend_cooldown_seconds
        }
    })


async def register(request: Request):
    db = next(get_db())
    try:
        data = await request.json()
        email = data.get("email", "").strip()
        name = data.get("name", "").strip()
        password = data.get("password", "")

        if not email or not validate_email(email):
            return JSONResponse({"detail": "Email inválido"}, status_code=400)
        if len(name) < 2:
            return JSONResponse({"detail": "Nombre muy corto"}, status_code=400)
        if len(password) < 6:
            return JSONResponse({"detail": "Mínimo 6 caracteres"}, status_code=400)

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            if existing.is_confirmed:
                return JSONResponse({"detail": "Email ya registrado"}, status_code=400)
            # Registro pendiente: retomar el flujo reenviando el código
            wait = confirmation_service.seconds_until_resend(existing)
            if wait > 0:
                return JSONResponse(
                    {"detail": f"Ya te enviamos un código. Esperá {wait} segundos antes de pedir otro."},
                    status_code=429
                )
            code = confirmation_service.issue_code(existing, db)
            email_sent = email_service.send_confirmation_email(existing.email, existing.name, code)
            return _pending_registration_response(existing, email_sent)

        user = User(
            email=email,
            name=name,
            password_hash=get_password_hash(password)
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        code = confirmation_service.issue_code(user, db)
        email_sent = email_service.send_confirmation_email(user.email, user.name, code)

        return _pending_registration_response(user, email_sent)
    finally:
        db.close()


async def login(request: Request):
    db = next(get_db())
    try:
        data = await request.json()
        email = data.get("email", "").strip()
        password = data.get("password", "")

        user = db.query(User).filter(User.email == email).first()
        if not user or not verify_password(password, user.password_hash):
            return JSONResponse({"detail": "Credenciales inválidas"}, status_code=401)

        if not user.is_confirmed:
            return JSONResponse(
                {"detail": "Tu registro está pendiente de confirmación. Revisá tu correo para terminarlo."},
                status_code=403
            )

        access_token = create_access_token({"sub": user.id})
        refresh_token = create_refresh_token({"sub": user.id})

        response = JSONResponse({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "is_confirmed": bool(user.is_confirmed),
                "created_at": user.created_at.isoformat() if user.created_at else None
            }
        })
        response.set_cookie("access_token", access_token, httponly=True, secure=False, samesite="lax", max_age=settings.access_token_expire_minutes * 60)
        response.set_cookie("refresh_token", refresh_token, httponly=True, secure=False, samesite="lax", max_age=settings.refresh_token_expire_days * 24 * 60 * 60)
        return response
    finally:
        db.close()


async def refresh_token(request: Request):
    db = next(get_db())
    try:
        refresh_token = request.cookies.get("refresh_token")
        if not refresh_token:
            return JSONResponse({"detail": "Refresh token requerido"}, status_code=401)

        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            return JSONResponse({"detail": "Refresh token inválido"}, status_code=401)

        user_id = subject_id(payload)
        user = db.query(User).filter(User.id == user_id).first() if user_id is not None else None
        if not user:
            return JSONResponse({"detail": "Usuario no encontrado"}, status_code=401)

        if not user.is_confirmed:
            return JSONResponse(
                {"detail": "Tu registro está pendiente de confirmación. Revisá tu correo para terminarlo."},
                status_code=403
            )

        new_access = create_access_token({"sub": user.id})
        new_refresh = create_refresh_token({"sub": user.id})

        response = JSONResponse({"access_token": new_access, "refresh_token": new_refresh, "token_type": "bearer"})
        response.set_cookie("access_token", new_access, httponly=True, secure=False, samesite="lax", max_age=settings.access_token_expire_minutes * 60)
        response.set_cookie("refresh_token", new_refresh, httponly=True, secure=False, samesite="lax", max_age=settings.refresh_token_expire_days * 24 * 60 * 60)
        return response
    finally:
        db.close()


async def logout(request: Request):
    response = JSONResponse({"message": "Sesión cerrada"})
    response.delete_cookie("access_token", httponly=True, secure=False, samesite="lax")
    response.delete_cookie("refresh_token", httponly=True, secure=False, samesite="lax")
    return response


async def me(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        return JSONResponse({
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_confirmed": bool(user.is_confirmed),
            "created_at": user.created_at.isoformat() if user.created_at else None
        })
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def confirm_email(request: Request):
    db = next(get_db())
    try:
        try:
            data = await request.json()
        except Exception:
            data = {}
        email = str(data.get("email", "")).strip()
        code = str(data.get("code", "")).strip()

        if not email:
            return JSONResponse({"detail": "Email requerido"}, status_code=400)
        if len(code) != 6 or not code.isdigit():
            return JSONResponse({"detail": "El código debe tener 6 dígitos"}, status_code=400)

        user = db.query(User).filter(User.email == email).first()
        if not user:
            return JSONResponse({"detail": "No hay ningún registro pendiente con ese email"}, status_code=400)
        if user.is_confirmed:
            return JSONResponse({"detail": "La cuenta ya está confirmada. Iniciá sesión."}, status_code=400)

        ok, message = confirmation_service.verify_code(user, code, db)
        if not ok:
            return JSONResponse({"detail": message}, status_code=400)

        # Registro terminado: se crea la sesión
        access_token = create_access_token({"sub": user.id})
        refresh_token = create_refresh_token({"sub": user.id})

        response = JSONResponse({
            "message": message,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "is_confirmed": True,
                "created_at": user.created_at.isoformat() if user.created_at else None
            }
        })
        response.set_cookie("access_token", access_token, httponly=True, secure=False, samesite="lax", max_age=settings.access_token_expire_minutes * 60)
        response.set_cookie("refresh_token", refresh_token, httponly=True, secure=False, samesite="lax", max_age=settings.refresh_token_expire_days * 24 * 60 * 60)
        return response
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def resend_confirmation(request: Request):
    db = next(get_db())
    try:
        try:
            data = await request.json()
        except Exception:
            data = {}
        email = str(data.get("email", "")).strip()
        if not email:
            return JSONResponse({"detail": "Email requerido"}, status_code=400)

        user = db.query(User).filter(User.email == email).first()
        if not user:
            return JSONResponse({"detail": "No hay ningún registro pendiente con ese email"}, status_code=400)
        if user.is_confirmed:
            return JSONResponse({"detail": "La cuenta ya está confirmada. Iniciá sesión."}, status_code=400)

        wait = confirmation_service.seconds_until_resend(user)
        if wait > 0:
            return JSONResponse(
                {"detail": f"Esperá {wait} segundos antes de pedir otro código"},
                status_code=429
            )

        code = confirmation_service.issue_code(user, db)
        sent = email_service.send_confirmation_email(user.email, user.name, code)

        body = {
            "message": "Código reenviado" if sent else "No se pudo enviar el correo. Reintentá más tarde.",
            "email_confirmation": {
                "sent": sent,
                "destiny": user.email,
                "expires_in_minutes": settings.confirmation_code_expire_minutes,
                "resend_cooldown_seconds": settings.confirmation_resend_cooldown_seconds
            }
        }
        return JSONResponse(body, status_code=200 if sent else 502)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


# ==========================================
# Wall routes
# ==========================================

def wall_to_dict(wall: Wall, owner_name: str = None, strokes_count: int = None) -> dict:
    data = {
        "id": wall.id,
        "owner_id": wall.owner_id,
        "title": wall.title,
        "slug": wall.slug,
        "background_color": wall.background_color,
        "is_public": wall.is_public,
        "created_at": wall.created_at.isoformat() if wall.created_at else None,
        "updated_at": wall.updated_at.isoformat() if wall.updated_at else None,
        "owner_name": owner_name
    }
    if strokes_count is not None:
        data["strokes_count"] = strokes_count
    return data


def stroke_to_dict(stroke: Stroke) -> dict:
    return {
        "id": stroke.id,
        "wall_id": stroke.wall_id,
        "author_id": stroke.author_id,
        "author_name": stroke.author_name,
        "tool": stroke.tool.value if hasattr(stroke.tool, 'value') else stroke.tool,
        "color": stroke.color,
        "width": stroke.width,
        "points": stroke.points,
        "created_at": stroke.created_at.isoformat() if stroke.created_at else None
    }


async def create_wall(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        data = await request.json()

        title = data.get("title", "").strip()
        background_color = data.get("background_color", "#ffffff")
        is_public = data.get("is_public", True)

        if not title:
            return JSONResponse({"detail": "Título requerido"}, status_code=400)
        if not validate_hex_color(background_color):
            return JSONResponse({"detail": "Color inválido"}, status_code=400)

        slug = generate_slug()
        while db.query(Wall).filter(Wall.slug == slug).first():
            slug = generate_slug()

        wall = Wall(
            owner_id=user.id,
            title=title,
            slug=slug,
            background_color=background_color,
            is_public=is_public
        )
        db.add(wall)
        db.commit()
        db.refresh(wall)

        return JSONResponse(wall_to_dict(wall, user.name), status_code=201)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def list_walls(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        walls = db.query(Wall).filter(Wall.owner_id == user.id).order_by(Wall.created_at.desc()).all()
        counts = {}
        if walls:
            rows = (
                db.query(Stroke.wall_id, func.count(Stroke.id))
                .filter(Stroke.wall_id.in_([w.id for w in walls]))
                .group_by(Stroke.wall_id)
                .all()
            )
            counts = {row[0]: row[1] for row in rows}
        return JSONResponse({"walls": [
            wall_to_dict(w, user.name, counts.get(w.id, 0)) for w in walls
        ]})
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def get_wall(request: Request):
    db = next(get_db())
    try:
        wall_id = int(request.path_params["wall_id"])
        user = get_optional_user(request, db)

        wall = db.query(Wall).filter(Wall.id == wall_id).first()
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        if not wall.is_public and (not user or wall.owner_id != user.id):
            return JSONResponse({"detail": "No tienes acceso a este muro"}, status_code=403)

        count = db.query(func.count(Stroke.id)).filter(Stroke.wall_id == wall.id).scalar() or 0
        return JSONResponse(wall_to_dict(wall, wall.owner.name, count))
    finally:
        db.close()


async def get_wall_by_slug(request: Request):
    db = next(get_db())
    try:
        slug = request.path_params["slug"]
        wall = db.query(Wall).filter(Wall.slug == slug).first()
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        if not wall.is_public:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        return JSONResponse(wall_to_dict(wall, wall.owner.name))
    finally:
        db.close()


async def update_wall(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        wall_id = int(request.path_params["wall_id"])
        data = await request.json()

        wall = db.query(Wall).filter(Wall.id == wall_id).first()
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        if wall.owner_id != user.id:
            return JSONResponse({"detail": "Solo el propietario puede modificar el muro"}, status_code=403)

        if "title" in data:
            title = data["title"].strip()
            if not title:
                return JSONResponse({"detail": "Título requerido"}, status_code=400)
            wall.title = title
        if "background_color" in data:
            if not validate_hex_color(data["background_color"]):
                return JSONResponse({"detail": "Color inválido"}, status_code=400)
            wall.background_color = data["background_color"]
        if "is_public" in data:
            wall.is_public = bool(data["is_public"])

        db.commit()
        db.refresh(wall)
        return JSONResponse(wall_to_dict(wall, user.name))
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def reset_wall(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        wall_id = int(request.path_params["wall_id"])

        wall = db.query(Wall).filter(Wall.id == wall_id).first()
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        if wall.owner_id != user.id:
            return JSONResponse({"detail": "Solo el propietario puede resetear el muro"}, status_code=403)

        db.query(Stroke).filter(Stroke.wall_id == wall_id).delete()
        db.commit()
        db.refresh(wall)
        return JSONResponse(wall_to_dict(wall, user.name))
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def delete_wall(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        wall_id = int(request.path_params["wall_id"])

        wall = db.query(Wall).filter(Wall.id == wall_id).first()
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        if wall.owner_id != user.id:
            return JSONResponse({"detail": "Solo el propietario puede eliminar el muro"}, status_code=403)

        db.delete(wall)
        db.commit()
        return Response(status_code=204)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def create_stroke(request: Request):
    db = next(get_db())
    try:
        wall_id = int(request.path_params["wall_id"])
        user = get_optional_user(request, db)
        data = await request.json()

        wall = db.query(Wall).filter(Wall.id == wall_id).first()
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        if not wall.is_public and (not user or wall.owner_id != user.id):
            return JSONResponse({"detail": "No tienes permiso para dibujar en este muro"}, status_code=403)

        tool = data.get("tool", "pen")
        color = data.get("color", "#000000")
        width = data.get("width", 2)
        points = data.get("points", [])
        author_name = data.get("author_name", "Anónimo")

        if not validate_hex_color(color):
            return JSONResponse({"detail": "Color inválido"}, status_code=400)
        if not isinstance(points, list):
            return JSONResponse({"detail": "Puntos inválidos"}, status_code=400)

        stroke = Stroke(
            wall_id=wall_id,
            author_id=user.id if user else None,
            author_name=author_name,
            tool=tool,
            color=color,
            width=width,
            points=points
        )
        db.add(stroke)
        db.commit()
        db.refresh(stroke)
        record_signature(request, wall, user, db)

        return JSONResponse(stroke_to_dict(stroke), status_code=201)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def list_strokes(request: Request):
    db = next(get_db())
    try:
        wall_id = int(request.path_params["wall_id"])
        user = get_optional_user(request, db)

        wall = db.query(Wall).filter(Wall.id == wall_id).first()
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        if not wall.is_public and (not user or wall.owner_id != user.id):
            return JSONResponse({"detail": "No tienes acceso a este muro"}, status_code=403)

        strokes = db.query(Stroke).filter(Stroke.wall_id == wall_id).order_by(Stroke.created_at.asc()).all()
        return JSONResponse({"strokes": [stroke_to_dict(s) for s in strokes]})
    finally:
        db.close()


async def delete_stroke(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        wall_id = int(request.path_params["wall_id"])
        stroke_id = int(request.path_params["stroke_id"])

        wall = db.query(Wall).filter(Wall.id == wall_id).first()
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        if wall.owner_id != user.id:
            return JSONResponse({"detail": "Solo el propietario puede borrar trazos"}, status_code=403)

        stroke = db.query(Stroke).filter(Stroke.id == stroke_id, Stroke.wall_id == wall_id).first()
        if not stroke:
            return JSONResponse({"detail": "Trazo no encontrado"}, status_code=404)

        db.delete(stroke)
        db.commit()
        return Response(status_code=204)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


# ==========================================
# WebSocket
# ==========================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
        self.user_info: Dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket, wall_id: int, user_data: dict):
        await websocket.accept()
        if wall_id not in self.active_connections:
            self.active_connections[wall_id] = []
        self.active_connections[wall_id].append(websocket)
        self.user_info[websocket] = user_data

        await self.broadcast_to_wall(wall_id, {
            "type": "user_joined",
            "user_id": user_data.get("user_id"),
            "user_name": user_data.get("user_name"),
            "color": user_data.get("color")
        }, exclude=websocket)

        users = []
        for ws in self.active_connections[wall_id]:
            if ws != websocket and ws in self.user_info:
                info = self.user_info[ws]
                users.append({
                    "user_id": info.get("user_id"),
                    "user_name": info.get("user_name"),
                    "color": info.get("color")
                })
        await websocket.send_text(json.dumps({
            "type": "users_list",
            "users": users
        }))

    def disconnect(self, websocket: WebSocket, wall_id: int):
        if wall_id in self.active_connections:
            if websocket in self.active_connections[wall_id]:
                self.active_connections[wall_id].remove(websocket)
            if not self.active_connections[wall_id]:
                del self.active_connections[wall_id]

        user_data = self.user_info.pop(websocket, None)
        if user_data:
            import asyncio
            asyncio.create_task(self.broadcast_to_wall(wall_id, {
                "type": "user_left",
                "user_id": user_data.get("user_id"),
                "user_name": user_data.get("user_name")
            }))

    async def broadcast_to_wall(self, wall_id: int, message: dict, exclude: WebSocket = None):
        if wall_id not in self.active_connections:
            return
        dead = []
        for ws in self.active_connections[wall_id]:
            if ws != exclude:
                try:
                    await ws.send_text(json.dumps(message))
                except Exception:
                    dead.append(ws)
        for ws in dead:
            self.disconnect(ws, wall_id)


manager = ConnectionManager()


async def get_ws_user(websocket: WebSocket, wall_id: int, token: str = None, db: Session = None) -> dict:
    user_id = None
    user_name = "Anónimo"
    color = "#3b82f6"

    if token:
        payload = decode_token(token)
        if payload and payload.get("type") == "access":
            user = db.query(User).filter(User.id == subject_id(payload)).first()
            if user:
                user_id = user.id
                user_name = user.name
                colors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#06b6d4", "#f97316"]
                color = colors[user.id % len(colors)]

    return {"user_id": user_id, "user_name": user_name, "color": color}


async def websocket_endpoint(websocket: WebSocket):
    wall_id = int(websocket.path_params["wall_id"])
    token = websocket.query_params.get("token")

    db = next(get_db())
    try:
        wall = db.query(Wall).filter(Wall.id == wall_id).first()
        if not wall:
            await websocket.close(code=4004)
            return
    finally:
        db.close()

    db = next(get_db())
    try:
        user_data = await get_ws_user(websocket, wall_id, token, db)
    finally:
        db.close()

    await manager.connect(websocket, wall_id, user_data)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                msg_type = message.get("type")

                if msg_type == "stroke":
                    await manager.broadcast_to_wall(wall_id, {
                        "type": "stroke",
                        "data": {
                            **message.get("data", {}),
                            "author_id": user_data["user_id"],
                            "author_name": user_data["user_name"]
                        }
                    }, exclude=websocket)

                elif msg_type == "delete":
                    await manager.broadcast_to_wall(wall_id, {
                        "type": "delete",
                        "stroke_id": message.get("stroke_id")
                    }, exclude=websocket)

                elif msg_type == "reset":
                    await manager.broadcast_to_wall(wall_id, {
                        "type": "reset"
                    }, exclude=websocket)

                elif msg_type == "cursor":
                    await manager.broadcast_to_wall(wall_id, {
                        "type": "cursor",
                        "x": message.get("x"),
                        "y": message.get("y"),
                        "user_id": user_data["user_id"],
                        "user_name": user_data["user_name"],
                        "color": user_data["color"]
                    }, exclude=websocket)

            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        manager.disconnect(websocket, wall_id)
    except Exception:
        manager.disconnect(websocket, wall_id)


# ==========================================
# Health
# ==========================================

async def health(request: Request):
    return JSONResponse({"status": "ok"})


async def get_stats(request: Request):
    db = next(get_db())
    try:
        walls_count = db.query(func.count(Wall.id)).scalar() or 0
        # "Firmas totales" = personas (IPs únicas) que firmaron; el dueño no cuenta
        strokes_count = db.query(func.count(Signer.id)).scalar() or 0
        online = sum(len(conns) for conns in manager.active_connections.values())
        return JSONResponse({
            "walls": walls_count,
            "strokes": strokes_count,
            "online": online
        })
    finally:
        db.close()


# ==========================================
# App setup
# ==========================================

Base.metadata.create_all(bind=engine)
run_light_migrations()

app = Starlette(
    debug=settings.debug,
    routes=[
        Route("/api/", health, methods=["GET"]),
        Route("/api/health", health, methods=["GET"]),
        Route("/api/stats", get_stats, methods=["GET"]),

        # Auth
        Route("/api/auth/register", register, methods=["POST"]),
        Route("/api/auth/login", login, methods=["POST"]),
        Route("/api/auth/refresh", refresh_token, methods=["POST"]),
        Route("/api/auth/logout", logout, methods=["POST"]),
        Route("/api/auth/me", me, methods=["GET"]),
        Route("/api/auth/confirm", confirm_email, methods=["POST"]),
        Route("/api/auth/resend-confirmation", resend_confirmation, methods=["POST"]),

        # Walls
        Route("/api/walls", create_wall, methods=["POST"]),
        Route("/api/walls", list_walls, methods=["GET"]),
        Route("/api/walls/{wall_id:int}", get_wall, methods=["GET"]),
        Route("/api/walls/slug/{slug}", get_wall_by_slug, methods=["GET"]),
        Route("/api/walls/{wall_id:int}", update_wall, methods=["PATCH"]),
        Route("/api/walls/{wall_id:int}/reset", reset_wall, methods=["POST"]),
        Route("/api/walls/{wall_id:int}", delete_wall, methods=["DELETE"]),

        # Strokes
        Route("/api/walls/{wall_id:int}/strokes", create_stroke, methods=["POST"]),
        Route("/api/walls/{wall_id:int}/strokes", list_strokes, methods=["GET"]),
        Route("/api/walls/{wall_id:int}/strokes/{stroke_id:int}", delete_stroke, methods=["DELETE"]),

        # WebSocket
        WebSocketRoute("/api/ws/walls/{wall_id:int}", websocket_endpoint),
    ],
    exception_handlers={HTTPException: http_exception_handler},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)