import secrets
import string
import json
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, List, Set

from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import JSONResponse, Response
from starlette.routing import Route, WebSocketRoute, Mount
from starlette.websockets import WebSocket, WebSocketDisconnect
from starlette.requests import Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import engine, Base, get_db
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, decode_token, subject_id
)
from app.models import User, Wall, Stroke, ToolType

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


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail


async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


# ==========================================
# Auth routes
# ==========================================

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

        if db.query(User).filter(User.email == email).first():
            return JSONResponse({"detail": "Email ya registrado"}, status_code=400)

        user = User(
            email=email,
            name=name,
            password_hash=get_password_hash(password)
        )
        db.add(user)
        db.commit()
        db.refresh(user)

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
                "created_at": user.created_at.isoformat() if user.created_at else None
            }
        })
        response.set_cookie("access_token", access_token, httponly=True, secure=False, samesite="lax", max_age=settings.access_token_expire_minutes * 60)
        response.set_cookie("refresh_token", refresh_token, httponly=True, secure=False, samesite="lax", max_age=settings.refresh_token_expire_days * 24 * 60 * 60)
        return response
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
            "created_at": user.created_at.isoformat() if user.created_at else None
        })
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


# ==========================================
# Wall routes
# ==========================================

def wall_to_dict(wall: Wall, owner_name: str = None) -> dict:
    return {
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
        return JSONResponse({"walls": [wall_to_dict(w, user.name) for w in walls]})
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

        return JSONResponse(wall_to_dict(wall, wall.owner.name))
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


# ==========================================
# App setup
# ==========================================

Base.metadata.create_all(bind=engine)

app = Starlette(
    debug=settings.debug,
    routes=[
        Route("/api/", health, methods=["GET"]),
        Route("/api/health", health, methods=["GET"]),

        # Auth
        Route("/api/auth/register", register, methods=["POST"]),
        Route("/api/auth/login", login, methods=["POST"]),
        Route("/api/auth/refresh", refresh_token, methods=["POST"]),
        Route("/api/auth/logout", logout, methods=["POST"]),
        Route("/api/auth/me", me, methods=["GET"]),

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