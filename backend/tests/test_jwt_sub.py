"""JWT `sub` must be a string for python-jose to decode it."""

from starlette.testclient import TestClient

from app.core.security import create_access_token, decode_token, subject_id
from app.main import app


def test_access_token_with_integer_user_id_can_be_decoded():
    token = create_access_token({"sub": 42})
    payload = decode_token(token)

    assert payload is not None
    assert payload["type"] == "access"
    assert payload["sub"] == "42"
    assert subject_id(payload) == 42


def test_register_then_me_accepts_issued_token():
    client = TestClient(app)
    email = "jwt-sub-fix@example.com"

    register = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "name": "Jwt Sub",
            "password": "secret1",
        },
    )
    if register.status_code == 400:
        login = client.post(
            "/api/auth/login",
            json={"email": email, "password": "secret1"},
        )
        assert login.status_code == 200
        token = login.json()["access_token"]
        user_id = login.json()["user"]["id"]
    else:
        assert register.status_code == 200
        token = register.json()["access_token"]
        user_id = register.json()["user"]["id"]

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    body = me.json()
    assert body["id"] == user_id
    assert body["email"] == email
