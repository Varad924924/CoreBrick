
import os

import httpx
import pytest

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 15.0

COMPANY_ENDPOINTS = [
    "/company/architects/pending",
    "/company/enquiries",
    "/company/site-visits",
    "/company/audit-logs",
    "/company/projects/pending",
]


@pytest.fixture(scope="module")
def architect_token():
    """Log in with a test Architect account without storing credentials."""
    email = os.getenv("COREBRICK_TEST_ARCHITECT_EMAIL")
    password = os.getenv("COREBRICK_TEST_ARCHITECT_PASSWORD")

    if not email or not password:
        pytest.skip("Architect test credentials were not supplied.")

    response = httpx.post(
        f"{BASE_URL}/auth/login",
        json={"email": email, "password": password},
        timeout=TIMEOUT,
    )

    assert response.status_code == 200, (
        "Architect login failed. Check the test account and login API."
    )

    token = response.json().get("access_token")
    assert token, "Login response did not contain an access token."

    return token


@pytest.mark.parametrize("endpoint", COMPANY_ENDPOINTS)
def test_architect_cannot_access_company_endpoints(
    architect_token, endpoint
):
    """An authenticated Architect must not access Company-only routes."""
    response = httpx.get(
        f"{BASE_URL}{endpoint}",
        headers={"Authorization": f"Bearer {architect_token}"},
        timeout=TIMEOUT,
    )

    assert response.status_code == 403, (
        f"{endpoint} returned HTTP {response.status_code}; "
        "expected 403 for an authenticated Architect."
    )
