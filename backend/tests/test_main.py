import time

from fastapi.testclient import TestClient

from backend.app.main import SESSION_COOKIE, SESSION_STORE, create_session


def login(client: TestClient) -> str:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200
    return client.cookies.get(SESSION_COOKIE) or ""


def test_health_endpoint_is_public(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_example_endpoint_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/example")

    assert response.status_code == 401


def test_example_endpoint_returns_data_for_authenticated_user(
    client: TestClient,
) -> None:
    login(client)
    response = client.get("/api/example")

    assert response.status_code == 200
    assert response.json() == {"message": "hello world"}


def test_root_serves_placeholder_static_page(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Backend scaffolding ready" in response.text


def test_login_creates_http_only_session_cookie(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )

    assert response.status_code == 200
    assert response.json() == {"authenticated": True, "username": "user"}
    assert SESSION_COOKIE in client.cookies
    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie


def test_login_rejects_invalid_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"


def test_session_check_requires_and_returns_authenticated_user(
    client: TestClient,
) -> None:
    assert client.get("/api/auth/me").status_code == 401

    login(client)
    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json() == {"authenticated": True, "username": "user"}


def test_logout_invalidates_session_and_clears_cookie(client: TestClient) -> None:
    session_id = login(client)

    response = client.post("/api/auth/logout")

    assert response.status_code == 200
    assert response.json() == {"authenticated": False}
    assert session_id not in SESSION_STORE
    assert client.get("/api/auth/me").status_code == 401
    assert "max-age=0" in response.headers["set-cookie"].lower()


def test_unknown_and_expired_sessions_are_rejected(client: TestClient) -> None:
    client.cookies.set(SESSION_COOKIE, "unknown-session")
    assert client.get("/api/auth/me").status_code == 401

    session_id = create_session()
    SESSION_STORE[session_id] = time.time() - 1
    client.cookies.set(SESSION_COOKIE, session_id)

    assert client.get("/api/auth/me").status_code == 401
    assert session_id not in SESSION_STORE
