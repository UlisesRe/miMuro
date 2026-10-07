"""Confirmación de email: el registro NO termina hasta ingresar el código.

- POST /auth/register crea la cuenta pendiente, envía el código y NO da sesión.
- POST /auth/confirm {email, code} termina el registro y crea la sesión.
- POST /auth/resend-confirmation {email} reenvía con cooldown.
- El login bloquea cuentas pendientes (403), nunca pide código a cuentas activas.
"""

import uuid

import pytest
from starlette.testclient import TestClient

from app.core import email as email_service
from app.core.config import get_settings
from app.main import app

settings = get_settings()


@pytest.fixture
def sent_codes(monkeypatch):
    codes = {}

    def fake_send(to_email, name, code):
        codes[to_email] = code
        return True

    monkeypatch.setattr(email_service, "send_confirmation_email", fake_send)
    return codes


def _register(sent_codes, client=None):
    client = client or TestClient(app)
    email = f"confirm-{uuid.uuid4().hex[:12]}@example.com"
    res = client.post(
        "/api/auth/register",
        json={"email": email, "name": "Conf Test", "password": "secret1"},
    )
    assert res.status_code == 200, res.text
    assert email in sent_codes
    return client, email, res.json()


def test_register_does_not_create_session_and_sends_code(sent_codes):
    _, email, body = _register(sent_codes)

    assert "access_token" not in body
    code = sent_codes[email]
    assert len(code) == 6 and code.isdigit()
    assert body["user"]["is_confirmed"] is False
    assert body["email_confirmation"]["required"] is True
    assert body["email_confirmation"]["sent"] is True
    assert body["email_confirmation"]["destiny"] == email
    assert body["email_confirmation"]["resend_cooldown_seconds"] == settings.confirmation_resend_cooldown_seconds


def test_reregister_pending_within_cooldown_returns_429(sent_codes):
    client, email, _ = _register(sent_codes)

    res = client.post(
        "/api/auth/register",
        json={"email": email, "name": "Conf Test", "password": "secret1"},
    )
    assert res.status_code == 429
    assert "Esperá" in res.json()["detail"]
    assert "access_token" not in res.json()


def test_reregister_pending_after_cooldown_issues_new_code(sent_codes, monkeypatch):
    client, email, _ = _register(sent_codes)
    old_code = sent_codes[email]

    monkeypatch.setattr(settings, "confirmation_resend_cooldown_seconds", 0)

    res = client.post(
        "/api/auth/register",
        json={"email": email, "name": "Conf Test", "password": "secret1"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "access_token" not in body
    assert body["user"]["is_confirmed"] is False
    assert body["email_confirmation"]["required"] is True
    assert sent_codes[email] != old_code

    # El código viejo ya no sirve y el nuevo termina el registro
    stale = client.post("/api/auth/confirm", json={"email": email, "code": old_code})
    assert stale.status_code == 400
    ok = client.post("/api/auth/confirm", json={"email": email, "code": sent_codes[email]})
    assert ok.status_code == 200
    assert ok.json()["user"]["is_confirmed"] is True


def test_reregister_confirmed_email_returns_400(sent_codes, monkeypatch):
    client, email, _ = _register(sent_codes)
    monkeypatch.setattr(settings, "confirmation_resend_cooldown_seconds", 0)
    ok = client.post("/api/auth/confirm", json={"email": email, "code": sent_codes[email]})
    assert ok.status_code == 200

    res = client.post(
        "/api/auth/register",
        json={"email": email, "name": "Conf Test", "password": "secret1"},
    )
    assert res.status_code == 400
    assert "ya registrado" in res.json()["detail"]


def test_register_without_confirm_cannot_login(sent_codes):
    _, email, _ = _register(sent_codes)

    fresh = TestClient(app)
    login = fresh.post(
        "/api/auth/login",
        json={"email": email, "password": "secret1"},
    )
    assert login.status_code == 403
    assert "pendiente" in login.json()["detail"]


def test_confirm_completes_registration_and_starts_session(sent_codes):
    _, email, _ = _register(sent_codes)

    client = TestClient(app)
    res = client.post(
        "/api/auth/confirm",
        json={"email": email, "code": sent_codes[email]},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["user"]["is_confirmed"] is True
    assert body["access_token"]

    # confirm setea las cookies: la sesión queda activa
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["is_confirmed"] is True

    # y ahora el login normal funciona sin pedir código
    fresh = TestClient(app)
    login = fresh.post(
        "/api/auth/login",
        json={"email": email, "password": "secret1"},
    )
    assert login.status_code == 200
    assert login.json()["user"]["is_confirmed"] is True


def test_confirm_requires_email_and_valid_code(sent_codes):
    client = TestClient(app)

    no_email = client.post("/api/auth/confirm", json={"code": "123456"})
    assert no_email.status_code == 400

    bad_code = client.post(
        "/api/auth/confirm",
        json={"email": "nobody@example.com", "code": "123"},
    )
    assert bad_code.status_code == 400

    unknown = client.post(
        "/api/auth/confirm",
        json={"email": f"nobody-{uuid.uuid4().hex[:8]}@example.com", "code": "123456"},
    )
    assert unknown.status_code == 400


def test_wrong_codes_consume_attempts_then_invalidate(sent_codes):
    _, email, _ = _register(sent_codes)
    code = sent_codes[email]
    wrong = "000000" if code != "000000" else "111111"
    client = TestClient(app)

    for _ in range(settings.confirmation_max_attempts - 1):
        res = client.post("/api/auth/confirm", json={"email": email, "code": wrong})
        assert res.status_code == 400
        assert "incorrecto" in res.json()["detail"]

    last = client.post("/api/auth/confirm", json={"email": email, "code": wrong})
    assert last.status_code == 400
    assert "invalidado" in last.json()["detail"]

    valid_after = client.post("/api/auth/confirm", json={"email": email, "code": code})
    assert valid_after.status_code == 400
    assert "Solicitá uno nuevo" in valid_after.json()["detail"]


def test_resend_respects_cooldown(sent_codes):
    _, email, _ = _register(sent_codes)

    client = TestClient(app)
    res = client.post("/api/auth/resend-confirmation", json={"email": email})
    assert res.status_code == 429
    assert "Esperá" in res.json()["detail"]


def test_resend_issues_new_code(sent_codes, monkeypatch):
    _, email, _ = _register(sent_codes)
    old_code = sent_codes[email]

    monkeypatch.setattr(settings, "confirmation_resend_cooldown_seconds", 0)

    client = TestClient(app)
    res = client.post("/api/auth/resend-confirmation", json={"email": email})
    assert res.status_code == 200, res.text
    assert sent_codes[email] != old_code
    assert res.json()["email_confirmation"]["sent"] is True


def test_resend_unknown_email(sent_codes):
    client = TestClient(app)
    res = client.post(
        "/api/auth/resend-confirmation",
        json={"email": f"nobody-{uuid.uuid4().hex[:8]}@example.com"},
    )
    assert res.status_code == 400
