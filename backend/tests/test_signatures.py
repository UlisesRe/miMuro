"""Contador global de firmas: cuenta personas (IPs únicas), no trazos.

- El dueño dibujando sobre su propio muro NO suma.
- Un visitante que entra por el link y deja su firma suma 1.
- Esa misma persona volviendo a entrar y editando NO vuelve a sumar.
- Cada IP distinta suma 1 (también usuarios logueados ajenos al muro).
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


def _confirmed_user(sent_codes):
    client = TestClient(app)
    email = f"sig-{uuid.uuid4().hex[:12]}@example.com"
    res = client.post(
        "/api/auth/register",
        json={"email": email, "name": "Dueño", "password": "secret1"},
    )
    assert res.status_code == 200, res.text
    ok = client.post("/api/auth/confirm", json={"email": email, "code": sent_codes[email]})
    assert ok.status_code == 200, ok.text
    return client, email


def _unique_ip():
    # Random so tests never collide across runs: the
    # signer table lives in the local mimuro.db.
    h = uuid.uuid4().hex
    return f"{int(h[0:2], 16)}.{int(h[2:4], 16)}.{int(h[4:6], 16)}.{int(h[6:8], 16)}"


def _create_wall(client, title="Muro público"):
    res = client.post("/api/walls", json={"title": title})
    assert res.status_code == 201, res.text
    return res.json()


def _stroke(client, wall_id, headers=None):
    return client.post(
        f"/api/walls/{wall_id}/strokes",
        json={
            "tool": "pen",
            "color": "#000000",
            "width": 2,
            "points": [{"x": 0, "y": 0}, {"x": 10, "y": 10}],
            "author_name": "Visitante",
        },
        headers=headers,
    )


def _signatures(client):
    return client.get("/api/stats").json()["strokes"]


def test_owner_strokes_do_not_count(sent_codes):
    owner, _ = _confirmed_user(sent_codes)
    wall = _create_wall(owner)

    before = _signatures(owner)
    assert _stroke(owner, wall["id"]).status_code == 201
    assert _stroke(owner, wall["id"]).status_code == 201
    assert _signatures(owner) == before


def test_anonymous_ip_counts_once(sent_codes):
    owner, _ = _confirmed_user(sent_codes)
    wall = _create_wall(owner)

    anon = TestClient(app)
    h = {"X-Forwarded-For": _unique_ip()}
    before = _signatures(owner)

    assert _stroke(anon, wall["id"], headers=h).status_code == 201
    assert _signatures(owner) == before + 1

    # Vuelve a entrar y edita su firma: no vuelve a sumar
    assert _stroke(anon, wall["id"], headers=h).status_code == 201
    assert _signatures(owner) == before + 1


def test_each_unique_ip_counts_once(sent_codes):
    owner, _ = _confirmed_user(sent_codes)
    wall = _create_wall(owner)

    a, b = TestClient(app), TestClient(app)
    before = _signatures(owner)

    assert _stroke(a, wall["id"], headers={"X-Forwarded-For": _unique_ip()}).status_code == 201
    assert _signatures(owner) == before + 1
    assert _stroke(b, wall["id"], headers={"X-Forwarded-For": _unique_ip()}).status_code == 201
    assert _signatures(owner) == before + 2


def test_authenticated_non_owner_counts_once(sent_codes):
    owner, _ = _confirmed_user(sent_codes)
    wall = _create_wall(owner)

    other, _ = _confirmed_user(sent_codes)
    # Una IP propia para poder identificar la persona en el contador
    h = {"X-Forwarded-For": _unique_ip()}
    before = _signatures(owner)

    assert _stroke(other, wall["id"], headers=h).status_code == 201
    assert _signatures(owner) == before + 1
    assert _stroke(other, wall["id"], headers=h).status_code == 201
    assert _signatures(owner) == before + 1