from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_example_endpoint() -> None:
    response = client.get("/api/example")

    assert response.status_code == 200
    assert response.json() == {"message": "hello world"}


def test_root_serves_static_page() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Backend scaffolding ready" in response.text
    assert "fetch(\"/api/example\")" in response.text
