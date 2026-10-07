"""JWT `sub` must be a string for python-jose to decode it."""

import uuid

from starlette.testclient import TestClient

from app.core import email as email_service
from app.core.security import create_access_token, decode_token, subject_id
from app.main import app


def test_access_token_with_integer_user_id_can_be_decoded():
    token = create_access_token({"sub": 42})
    payload = decode_token(token)

    assert payload is not None
    assert payload["type"] == "access"
    assert payload["sub"] == "42"
    assert subject_id(payload) == 42


def test_register_then_me_accepts_issued_token(monkeypatch):
    sent = {}

    def fake_send(to_email, name, code):
        sent[to_email] = code
        return True

    monkeypatch.setattr(email_service, "send_confirmation_email", fake_send)

    client = TestClient(app)
    email = f"jwt-{uuid.uuid4().hex[:10]}@example.com"

    register = client.post(
        "/api/auth/register",
        json={"email": email, "name": "Jwt Sub", "password": "secret1"},
    )
    assert register.status_code == 200
    assert "access_token" not in register.json()

    confirm = client.post(
        "/api/auth/confirm",
        json={"email": email, "code": sent[email]},
    )
    assert confirm.status_code == 200, confirm.text
    token = confirm.json()["access_token"]
    user_id = confirm.json()["user"]["id"]

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    body = me.json()
    assert body["id"] == user_id
    assert body["email"] == email
