from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session
from typing import Dict, List, Set
import json
import asyncio

from app.core.database import get_db
from app.core.security import decode_token, subject_id
from app.models import User, Wall, Stroke

router = APIRouter(prefix="/ws", tags=["websocket"])


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

        # Notify others
        await self.broadcast_to_wall(wall_id, {
            "type": "user_joined",
            "user_id": user_data.get("user_id"),
            "user_name": user_data.get("user_name"),
            "color": user_data.get("color")
        }, exclude=websocket)

        # Send current users list
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
            asyncio.create_task(self.broadcast_to_wall(wall_id, {
                "type": "user_left",
                "user_id": user_data.get("user_id"),
                "user_name": user_data.get("user_name")
            }))

    async def broadcast_to_wall(self, wall_id: int, message: dict, exclude: WebSocket = None):
        if wall_id not in self.active_connections:
            return
        dead_connections = []
        for ws in self.active_connections[wall_id]:
            if ws != exclude:
                try:
                    await ws.send_text(json.dumps(message))
                except Exception:
                    dead_connections.append(ws)
        for ws in dead_connections:
            self.disconnect(ws, wall_id)

    async def send_personal(self, websocket: WebSocket, message: dict):
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            pass


manager = ConnectionManager()


async def get_ws_user(
    websocket: WebSocket,
    wall_id: int,
    token: str = Query(None),
    db: Session = Depends(get_db)
) -> dict:
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
                # Generate consistent color from user_id
                colors = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#06b6d4", "#f97316"]
                color = colors[user.id % len(colors)]

    return {"user_id": user_id, "user_name": user_name, "color": color}


@router.websocket("/walls/{wall_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    wall_id: int,
    token: str = Query(None),
    db: Session = Depends(get_db)
):
    # Verify wall exists
    wall = db.query(Wall).filter(Wall.id == wall_id).first()
    if not wall:
        await websocket.close(code=4004)
        return

    user_data = await get_ws_user(websocket, wall_id, token, db)

    await manager.connect(websocket, wall_id, user_data)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                msg_type = message.get("type")

                if msg_type == "stroke":
                    # Broadcast stroke to others
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