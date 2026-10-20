"""miMuro - API (Starlette).

Autenticación con confirmación por email, un contador público de miembros
y el muro: cada usuario crea lienzos (nombre, color y visibilidad) y los
traza. Los trazos se guardan como datos, no como píxeles.
"""

import json
import re
import secrets

from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import Base, engine, get_db, run_light_migrations
from app.core import confirmation as confirmation_service
from app.core import email as email_service
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    subject_id,
    verify_password,
)
from app.models import Stroke, User, Wall

settings = get_settings()


# ==========================================
# Errors
# ==========================================

class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


# ==========================================
# Helpers
# ==========================================

def validate_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email))


def get_current_user(request: Request, db: Session) -> User:
    # Cookie first, then Authorization header.
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


def user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "is_confirmed": bool(user.is_confirmed),
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def set_session_cookies(response: JSONResponse, access_token: str, refresh_token: str) -> None:
    # En local (http) la cookie va sin Secure y SameSite=lax; en producción
    # (HTTPS, frontend en otro dominio) tiene que ser Secure + SameSite=None,
    # si no el navegador no la manda en las llamadas cross-site.
    secure = not settings.debug
    samesite = "none" if secure else "lax"

    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
    )


# ==========================================
# Auth
# ==========================================

def _pending_registration_response(user: User, email_sent: bool) -> JSONResponse:
    return JSONResponse({
        "message": "Código de confirmación enviado a tu correo",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "is_confirmed": False,
        },
        "email_confirmation": {
            "required": True,
            "sent": email_sent,
            "destiny": user.email,
            "expires_in_minutes": settings.confirmation_code_expire_minutes,
            "resend_cooldown_seconds": settings.confirmation_resend_cooldown_seconds,
        },
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
            # Registro pendiente: retomar el flujo reenviando el código.
            wait = confirmation_service.seconds_until_resend(existing)
            if wait > 0:
                return JSONResponse(
                    {"detail": f"Ya te enviamos un código. Esperá {wait} segundos antes de pedir otro."},
                    status_code=429,
                )
            code = confirmation_service.issue_code(existing, db)
            email_sent = email_service.send_confirmation_email(existing.email, existing.name, code)
            return _pending_registration_response(existing, email_sent)

        user = User(
            email=email,
            name=name,
            password_hash=get_password_hash(password),
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
                {"detail": "Tu cuenta todavía está pendiente de confirmación. Revisá tu correo."},
                status_code=403,
            )

        access_token = create_access_token({"sub": user.id})
        refresh_token = create_refresh_token({"sub": user.id})

        response = JSONResponse({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": user_to_dict(user),
        })
        set_session_cookies(response, access_token, refresh_token)
        return response
    finally:
        db.close()


async def refresh_token(request: Request):
    db = next(get_db())
    try:
        try:
            data = await request.json()
        except Exception:
            data = {}
        token = (
            request.cookies.get("refresh_token")
            or data.get("refresh_token")
            or ""
        )

        payload = decode_token(token) if token else None
        if not payload or payload.get("type") != "refresh":
            return JSONResponse({"detail": "Sesión expirada"}, status_code=401)

        user = db.query(User).filter(User.id == subject_id(payload)).first()
        if not user:
            return JSONResponse({"detail": "Usuario no encontrado"}, status_code=401)

        access_token = create_access_token({"sub": user.id})
        new_refresh = create_refresh_token({"sub": user.id})

        response = JSONResponse({
            "access_token": access_token,
            "refresh_token": new_refresh,
            "token_type": "bearer",
        })
        set_session_cookies(response, access_token, new_refresh)
        return response
    finally:
        db.close()


async def logout(request: Request):
    response = JSONResponse({"message": "Sesión cerrada"})
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return response


async def me(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        return JSONResponse(user_to_dict(user))
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

        # Registro terminado: se crea la sesión.
        access_token = create_access_token({"sub": user.id})
        refresh_token = create_refresh_token({"sub": user.id})

        response = JSONResponse({
            "message": message,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": user_to_dict(user),
        })
        set_session_cookies(response, access_token, refresh_token)
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
                status_code=429,
            )

        code = confirmation_service.issue_code(user, db)
        sent = email_service.send_confirmation_email(user.email, user.name, code)

        body = {
            "message": "Código reenviado" if sent else "No se pudo enviar el correo. Reintentá más tarde.",
            "email_confirmation": {
                "sent": sent,
                "destiny": user.email,
                "expires_in_minutes": settings.confirmation_code_expire_minutes,
                "resend_cooldown_seconds": settings.confirmation_resend_cooldown_seconds,
            },
        }
        return JSONResponse(body, status_code=200 if sent else 502)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


# ==========================================
# Public
# ==========================================

async def health(request: Request):
    return JSONResponse({"status": "ok"})


async def get_stats(request: Request):
    """Contador público de personas registradas (prueba social del home)."""
    db = next(get_db())
    try:
        members = db.query(func.count(User.id)).scalar() or 0
        return JSONResponse({"members": members})
    finally:
        db.close()


# ==========================================
# Walls
# ==========================================

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
_MAX_STROKES = 5000
_MAX_STROKES_PER_SIGNATURE = 60
_MAX_POINTS_PER_STROKE = 20000
_MAX_SIGNER_NAME = 60


def _wall_to_dict(wall: Wall, *, strokes=None, strokes_count=None) -> dict:
    data = {
        "id": wall.id,
        "title": wall.title,
        "slug": wall.slug,
        "background_color": wall.background_color,
        "is_public": bool(wall.is_public),
        "created_at": wall.created_at.isoformat() if wall.created_at else None,
        "updated_at": wall.updated_at.isoformat() if wall.updated_at else None,
    }
    if strokes_count is not None:
        data["strokes_count"] = strokes_count
    if strokes is not None:
        data["strokes"] = [_stroke_to_dict(stroke) for stroke in strokes]
    return data


def _stroke_to_dict(stroke: Stroke) -> dict:
    return {
        "tool": stroke.tool,
        "color": stroke.color,
        "width": stroke.width,
        "points": json.loads(stroke.points or "[]"),
        "signer_name": stroke.signer_name or None,
    }


def _clean_stroke(item) -> dict | None:
    """Valida y normaliza un trazo recibido del cliente."""
    if not isinstance(item, dict):
        return None

    tool = item.get("tool")
    if tool not in ("pen", "eraser"):
        return None

    color = str(item.get("color", "#111111"))
    if not _HEX_COLOR.match(color):
        return None

    try:
        width = int(item.get("width", 4))
    except (TypeError, ValueError):
        return None
    if not 1 <= width <= 100:
        return None

    points = item.get("points")
    if not isinstance(points, list) or len(points) < 2 or len(points) % 2 != 0:
        return None
    if len(points) > _MAX_POINTS_PER_STROKE:
        return None
    try:
        points = [round(float(value), 2) for value in points]
    except (TypeError, ValueError):
        return None

    # Opcional: lo mandan las firmas de invitados y el guardado del dueño
    # reenvía los nombres para no perderlos al reemplazar la lista.
    signer_name = item.get("signer_name")
    if signer_name is not None:
        signer_name = str(signer_name).strip()[:_MAX_SIGNER_NAME] or None

    return {
        "tool": tool,
        "color": color,
        "width": width,
        "points": points,
        "signer_name": signer_name,
    }


def _generate_slug(db: Session) -> str:
    while True:
        slug = secrets.token_hex(4)
        if not db.query(Wall.id).filter(Wall.slug == slug).first():
            return slug


def _owned_wall(db: Session, user: User, wall_id) -> Wall | None:
    try:
        wall_id = int(wall_id)
    except (TypeError, ValueError):
        return None
    return db.query(Wall).filter(Wall.id == wall_id, Wall.owner_id == user.id).first()


def _wall_strokes(db: Session, wall_id: int):
    return (
        db.query(Stroke)
        .filter(Stroke.wall_id == wall_id)
        .order_by(Stroke.id)
        .all()
    )


async def list_walls(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        walls = (
            db.query(Wall)
            .filter(Wall.owner_id == user.id)
            .order_by(Wall.created_at.desc(), Wall.id.desc())
            .all()
        )
        counts = dict(
            db.query(Stroke.wall_id, func.count(Stroke.id))
            .filter(Stroke.wall_id.in_([wall.id for wall in walls]))
            .group_by(Stroke.wall_id)
            .all()
        ) if walls else {}
        return JSONResponse({
            "walls": [
                _wall_to_dict(wall, strokes_count=counts.get(wall.id, 0))
                for wall in walls
            ]
        })
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def create_wall(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        data = await request.json()

        title = str(data.get("title", "")).strip()
        color = str(data.get("background_color", "#ffffff")).strip()
        is_public = bool(data.get("is_public", True))

        if not title or len(title) > 100:
            return JSONResponse({"detail": "Poné un nombre de hasta 100 caracteres"}, status_code=400)
        if not _HEX_COLOR.match(color):
            return JSONResponse({"detail": "Color de lienzo inválido"}, status_code=400)

        wall = Wall(
            owner_id=user.id,
            title=title,
            slug=_generate_slug(db),
            background_color=color,
            is_public=is_public,
        )
        db.add(wall)
        db.commit()
        db.refresh(wall)

        return JSONResponse(_wall_to_dict(wall, strokes=[], strokes_count=0), status_code=201)
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def get_wall(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        wall = _owned_wall(db, user, request.path_params.get("wall_id"))
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)
        return JSONResponse(_wall_to_dict(wall, strokes=_wall_strokes(db, wall.id)))
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def update_wall(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        wall = _owned_wall(db, user, request.path_params.get("wall_id"))
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        data = await request.json()

        if "title" in data:
            title = str(data.get("title", "")).strip()
            if not title or len(title) > 100:
                return JSONResponse({"detail": "Poné un nombre de hasta 100 caracteres"}, status_code=400)
            wall.title = title

        if "background_color" in data:
            color = str(data.get("background_color", "")).strip()
            if not _HEX_COLOR.match(color):
                return JSONResponse({"detail": "Color de lienzo inválido"}, status_code=400)
            wall.background_color = color

        if "is_public" in data:
            wall.is_public = bool(data.get("is_public"))

        db.commit()
        db.refresh(wall)
        return JSONResponse(_wall_to_dict(
            wall, strokes_count=len(_wall_strokes(db, wall.id))
        ))
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def delete_wall(request: Request):
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        wall = _owned_wall(db, user, request.path_params.get("wall_id"))
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        db.query(Stroke).filter(Stroke.wall_id == wall.id).delete()
        db.delete(wall)
        db.commit()
        return JSONResponse({"message": "Muro eliminado"})
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def save_strokes(request: Request):
    """Reemplaza todos los trazos del muro por los que llegan en el cuerpo.

    El cliente manda la lista completa, así deshacer, borrar todo y la goma
    quedan consistentes sin endpoints extra.
    """
    db = next(get_db())
    try:
        user = get_current_user(request, db)
        wall = _owned_wall(db, user, request.path_params.get("wall_id"))
        if not wall:
            return JSONResponse({"detail": "Muro no encontrado"}, status_code=404)

        data = await request.json()
        strokes = data.get("strokes")
        if not isinstance(strokes, list) or len(strokes) > _MAX_STROKES:
            return JSONResponse({"detail": "Lista de trazos inválida"}, status_code=400)

        cleaned = []
        for item in strokes:
            stroke = _clean_stroke(item)
            if stroke is None:
                return JSONResponse({"detail": "Hay un trazo inválido"}, status_code=400)
            cleaned.append(stroke)

        db.query(Stroke).filter(Stroke.wall_id == wall.id).delete()
        for stroke in cleaned:
            db.add(Stroke(
                wall_id=wall.id,
                tool=stroke["tool"],
                color=stroke["color"],
                width=stroke["width"],
                points=json.dumps(stroke["points"]),
                signer_name=stroke["signer_name"],
                author_name=stroke["signer_name"] or user.name,
            ))
        db.commit()

        return JSONResponse({"strokes_count": len(cleaned)})
    except HTTPException as e:
        return JSONResponse({"detail": e.detail}, status_code=e.status_code)
    finally:
        db.close()


async def get_public_wall(request: Request):
    """Muro compartible (sin sesión). Los privados no se exponen."""
    db = next(get_db())
    try:
        slug = request.path_params.get("slug", "")
        wall = db.query(Wall).filter(Wall.slug == slug).first()
        if not wall or not wall.is_public:
            return JSONResponse({"detail": "Este muro no existe o es privado"}, status_code=404)

        owner = db.query(User).filter(User.id == wall.owner_id).first()
        body = _wall_to_dict(wall, strokes=_wall_strokes(db, wall.id))
        body["owner_name"] = owner.name if owner else ""
        return JSONResponse(body)
    finally:
        db.close()


async def sign_wall(request: Request):
    """Firma de un invitado: agrega trazos a un muro público (sin sesión).

    Solo lápiz: los invitados no borran lo que hay. Los trazos se agregan
    al final de la lista (no la reemplazan), así dos personas pueden firmar
    sin pisarse y el dueño sigue pudiendo guardar y deshacer lo suyo. La
    página pública los ordena al revés al dibujar, para que la firma nueva
    quede por debajo de las anteriores.
    """
    db = next(get_db())
    try:
        slug = request.path_params.get("slug", "")
        wall = db.query(Wall).filter(Wall.slug == slug).first()
        if not wall or not wall.is_public:
            return JSONResponse({"detail": "Este muro no existe o es privado"}, status_code=404)

        try:
            data = await request.json()
        except Exception:
            data = None
        if not isinstance(data, dict):
            return JSONResponse({"detail": "Firma inválida"}, status_code=400)

        name = str(data.get("name", "")).strip()
        if not 1 <= len(name) <= _MAX_SIGNER_NAME:
            return JSONResponse(
                {"detail": f"Escribí tu nombre (hasta {_MAX_SIGNER_NAME} caracteres)"},
                status_code=400,
            )

        strokes = data.get("strokes")
        if not isinstance(strokes, list) or not strokes:
            return JSONResponse({"detail": "Dibujá algo antes de firmar"}, status_code=400)
        if len(strokes) > _MAX_STROKES_PER_SIGNATURE:
            return JSONResponse({"detail": "Demasiados trazos en una firma"}, status_code=400)

        cleaned = []
        for item in strokes:
            stroke = _clean_stroke(item)
            if stroke is None or stroke["tool"] != "pen":
                return JSONResponse({"detail": "Hay un trazo inválido"}, status_code=400)
            cleaned.append(stroke)

        current = db.query(func.count(Stroke.id)).filter(Stroke.wall_id == wall.id).scalar() or 0
        if current + len(cleaned) > _MAX_STROKES:
            return JSONResponse({"detail": "Este muro ya no tiene espacio"}, status_code=400)

        for stroke in cleaned:
            db.add(Stroke(
                wall_id=wall.id,
                tool=stroke["tool"],
                color=stroke["color"],
                width=stroke["width"],
                points=json.dumps(stroke["points"]),
                signer_name=name,
                author_name=name,
            ))
        db.commit()

        return JSONResponse(
            {"signer_name": name, "strokes_count": len(cleaned)},
            status_code=201,
        )
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

        Route("/api/auth/register", register, methods=["POST"]),
        Route("/api/auth/login", login, methods=["POST"]),
        Route("/api/auth/refresh", refresh_token, methods=["POST"]),
        Route("/api/auth/logout", logout, methods=["POST"]),
        Route("/api/auth/me", me, methods=["GET"]),
        Route("/api/auth/confirm", confirm_email, methods=["POST"]),
        Route("/api/auth/resend-confirmation", resend_confirmation, methods=["POST"]),

        Route("/api/walls", list_walls, methods=["GET"]),
        Route("/api/walls", create_wall, methods=["POST"]),
        Route("/api/walls/{wall_id}", get_wall, methods=["GET"]),
        Route("/api/walls/{wall_id}", update_wall, methods=["PATCH"]),
        Route("/api/walls/{wall_id}", delete_wall, methods=["DELETE"]),
        Route("/api/walls/{wall_id}/strokes", save_strokes, methods=["PUT"]),
        Route("/api/w/{slug}", get_public_wall, methods=["GET"]),
        Route("/api/w/{slug}/sign", sign_wall, methods=["POST"]),
    ],
    exception_handlers={HTTPException: http_exception_handler},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
