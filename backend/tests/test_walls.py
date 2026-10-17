"""Muros y trazos.

- Cada usuario solo ve y edita sus muros.
- El muro guarda nombre, color de lienzo y visibilidad.
- Los trazos se reemplazan en bloque (PUT) y se leen completos.
- El endpoint público /api/w/{slug} solo expone muros públicos.
"""

import uuid

import pytest
from starlette.testclient import TestClient

from app.core import email as email_service
from app.main import app


@pytest.fixture
def sent_codes(monkeypatch):
    codes = {}

    def fake_send(to_email, name, code):
        codes[to_email] = code
        return True

    monkeypatch.setattr(email_service, "send_confirmation_email", fake_send)
    return codes


def _confirmed_client(sent_codes, prefix="walls", name="Muro Test"):
    client = TestClient(app)
    email = f"{prefix}-{uuid.uuid4().hex[:12]}@example.com"
    register = client.post(
        "/api/auth/register",
        json={"email": email, "name": name, "password": "secret1"},
    )
    assert register.status_code == 200, register.text
    confirm = client.post("/api/auth/confirm", json={"email": email, "code": sent_codes[email]})
    assert confirm.status_code == 200, confirm.text
    return client


@pytest.fixture
def client(sent_codes):
    return _confirmed_client(sent_codes)


def _create_wall(client, **overrides):
    payload = {"title": "Mi muro", "background_color": "#ffcc00", "is_public": True}
    payload.update(overrides)
    res = client.post("/api/walls", json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_walls_require_auth():
    anon = TestClient(app)
    assert anon.get("/api/walls").status_code == 401
    assert anon.post("/api/walls", json={"title": "x"}).status_code == 401


def test_create_and_list_wall(client):
    wall = _create_wall(client, title="Mi primer muro")

    assert wall["title"] == "Mi primer muro"
    assert wall["slug"]
    assert wall["is_public"] is True
    assert wall["background_color"] == "#ffcc00"
    assert wall["strokes"] == []

    listing = client.get("/api/walls").json()["walls"]
    assert [w["id"] for w in listing] == [wall["id"]]
    assert listing[0]["strokes_count"] == 0


def test_create_wall_validation(client):
    empty = client.post("/api/walls", json={"title": "  ", "background_color": "#ffffff"})
    assert empty.status_code == 400

    bad_color = client.post(
        "/api/walls",
        json={"title": "ok", "background_color": "red"},
    )
    assert bad_color.status_code == 400


def test_strokes_are_replaced_in_bulk(client):
    wall = _create_wall(client)
    wall_id = wall["id"]

    strokes = [
        {"tool": "pen", "color": "#111111", "width": 4, "points": [0, 0, 10, 10, 20, 5]},
        {"tool": "eraser", "color": "#111111", "width": 12, "points": [5, 5, 6, 6]},
    ]
    save = client.put(f"/api/walls/{wall_id}/strokes", json={"strokes": strokes})
    assert save.status_code == 200
    assert save.json()["strokes_count"] == 2

    detail = client.get(f"/api/walls/{wall_id}").json()
    assert len(detail["strokes"]) == 2
    assert detail["strokes"][0]["points"] == [0, 0, 10, 10, 20, 5]
    assert detail["strokes"][1]["tool"] == "eraser"

    # El segundo guardado reemplaza la lista completa.
    client.put(f"/api/walls/{wall_id}/strokes", json={"strokes": [strokes[0]]})
    assert len(client.get(f"/api/walls/{wall_id}").json()["strokes"]) == 1


def test_invalid_stroke_is_rejected(client):
    wall = _create_wall(client)
    good = {"tool": "pen", "color": "#111111", "width": 4, "points": [0, 0, 1, 1]}
    client.put(f"/api/walls/{wall['id']}/strokes", json={"strokes": [good]})

    for bad in (
        {"tool": "spray", "color": "#111111", "width": 4, "points": [0, 0, 1, 1]},
        {"tool": "pen", "color": "nope", "width": 4, "points": [0, 0, 1, 1]},
        {"tool": "pen", "color": "#111111", "width": 0, "points": [0, 0, 1, 1]},
        {"tool": "pen", "color": "#111111", "width": 4, "points": [0]},
    ):
        res = client.put(f"/api/walls/{wall['id']}/strokes", json={"strokes": [bad]})
        assert res.status_code == 400, bad

    # Un cuerpo inválido no debe borrar lo que ya había.
    assert len(client.get(f"/api/walls/{wall['id']}").json()["strokes"]) == 1


def test_update_wall(client):
    wall = _create_wall(client, title="Antes")

    res = client.patch(
        f"/api/walls/{wall['id']}",
        json={"title": "Después", "is_public": False, "background_color": "#000000"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "Después"
    assert body["is_public"] is False
    assert body["background_color"] == "#000000"

    assert client.patch(f"/api/walls/{wall['id']}", json={"background_color": "azul"}).status_code == 400


def test_public_wall_by_slug(client):
    wall = _create_wall(client, title="Público", is_public=True)
    client.put(
        f"/api/walls/{wall['id']}/strokes",
        json={"strokes": [{"tool": "pen", "color": "#111111", "width": 4, "points": [1, 2, 3, 4]}]},
    )

    anon = TestClient(app)
    res = anon.get(f"/api/w/{wall['slug']}")
    assert res.status_code == 200
    body = res.json()
    assert len(body["strokes"]) == 1
    assert body["owner_name"]


def test_private_wall_is_hidden_from_public(client):
    wall = _create_wall(client, title="Privado", is_public=False)

    anon = TestClient(app)
    assert anon.get(f"/api/w/{wall['slug']}").status_code == 404


def test_walls_are_isolated_between_users(client, sent_codes):
    wall = _create_wall(client, title="Mío")

    other = _confirmed_client(sent_codes, prefix="other", name="Otra Persona")

    assert other.get(f"/api/walls/{wall['id']}").status_code == 404
    assert other.patch(f"/api/walls/{wall['id']}", json={"title": "Robado"}).status_code == 404
    assert other.delete(f"/api/walls/{wall['id']}").status_code == 404
    assert other.put(f"/api/walls/{wall['id']}/strokes", json={"strokes": []}).status_code == 404
    assert other.get("/api/walls").json()["walls"] == []


def test_delete_wall_removes_it(client):
    wall = _create_wall(client)

    assert client.delete(f"/api/walls/{wall['id']}").status_code == 200
    assert client.get(f"/api/walls/{wall['id']}").status_code == 404
    assert client.get("/api/walls").json()["walls"] == []


def test_guest_signs_a_public_wall(client):
    wall = _create_wall(client, title="Firmable", is_public=True)

    anon = TestClient(app)
    res = anon.post(
        f"/api/w/{wall['slug']}/sign",
        json={
            "name": "  Ana  ",
            "strokes": [{"tool": "pen", "color": "#e03131", "width": 6, "points": [1, 2, 3, 4]}],
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["signer_name"] == "Ana"

    body = anon.get(f"/api/w/{wall['slug']}").json()
    assert len(body["strokes"]) == 1
    assert body["strokes"][0]["signer_name"] == "Ana"


def test_signatures_are_appended_and_survive_the_owner_saving(client):
    wall = _create_wall(client, title="Firmas")
    anon = TestClient(app)
    pen = {"tool": "pen", "color": "#1971c2", "width": 4, "points": [0, 0, 5, 5]}

    anon.post(f"/api/w/{wall['slug']}/sign", json={"name": "Ana", "strokes": [pen]})
    anon.post(f"/api/w/{wall['slug']}/sign", json={"name": "Luis", "strokes": [pen]})

    detail = client.get(f"/api/walls/{wall['id']}").json()
    assert [s["signer_name"] for s in detail["strokes"]] == ["Ana", "Luis"]

    # El dueño agrega un trazo propio y reenvía las firmas: no se pierden.
    own = {"tool": "pen", "color": "#111111", "width": 4, "points": [1, 1, 2, 2]}
    save = client.put(
        f"/api/walls/{wall['id']}/strokes",
        json={"strokes": [own] + detail["strokes"]},
    )
    assert save.status_code == 200, save.text

    after = client.get(f"/api/walls/{wall['id']}").json()
    assert [s["signer_name"] for s in after["strokes"]] == [None, "Ana", "Luis"]


def test_sign_validation(client):
    public = _create_wall(client, title="Público", is_public=True)
    private = _create_wall(client, title="Privado", is_public=False)
    anon = TestClient(app)
    pen = {"tool": "pen", "color": "#111111", "width": 4, "points": [0, 0, 1, 1]}

    # Muro privado o inexistente: no se firma.
    assert anon.post(
        f"/api/w/{private['slug']}/sign", json={"name": "Ana", "strokes": [pen]}
    ).status_code == 404
    assert anon.post(
        "/api/w/noexiste/sign", json={"name": "Ana", "strokes": [pen]}
    ).status_code == 404

    # Sin nombre, sin trazos o con goma: 400.
    assert anon.post(
        f"/api/w/{public['slug']}/sign", json={"name": "   ", "strokes": [pen]}
    ).status_code == 400
    assert anon.post(
        f"/api/w/{public['slug']}/sign", json={"name": "Ana", "strokes": []}
    ).status_code == 400
    eraser = {"tool": "eraser", "color": "#111111", "width": 4, "points": [0, 0, 1, 1]}
    assert anon.post(
        f"/api/w/{public['slug']}/sign", json={"name": "Ana", "strokes": [eraser]}
    ).status_code == 400

    # Nada de eso quedó guardado.
    assert anon.get(f"/api/w/{public['slug']}").json()["strokes"] == []
