import io
import os
import uuid
import secrets

import httpx
import pytest
from PIL import Image

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30.0


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        pytest.fail(f"Missing environment variable: {name}")
    return value


def login(client, email, password, role):
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )

    assert response.status_code == 200, (
        f"{role} login failed: HTTP {response.status_code}: "
        f"{response.text[:300]}"
    )

    token = response.json().get("access_token")
    assert token, f"{role} login returned no access token."

    return {"Authorization": f"Bearer {token}"}


def test_architect_cannot_upload_to_another_architect_project():
    owner_email = required_env("COREBRICK_TEST_ARCHITECT_EMAIL")
    owner_password = required_env("COREBRICK_TEST_ARCHITECT_PASSWORD")
    company_email = required_env("COREBRICK_TEST_COMPANY_EMAIL")
    company_password = required_env("COREBRICK_TEST_COMPANY_PASSWORD")

    suffix = uuid.uuid4().hex[:10]
    second_email = f"cross-owner-{suffix}@example.com"
    second_password = secrets.token_urlsafe(32)
    second_phone = f"9{uuid.uuid4().int % 1_000_000_000:09d}"

    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        # 1. Authenticate the existing project owner and Company.
        owner_headers = login(
            client, owner_email, owner_password, "Project owner Architect"
        )
        company_headers = login(
            client, company_email, company_password, "Company"
        )

        # 2. Register a second Architect with unique test credentials.
        registration = client.post(
            "/auth/register/architect",
            json={
                "full_name": f"Cross-Owner Test {suffix}",
                "email": second_email,
                "password": second_password,
                "phone": second_phone,
                "bio": "Temporary development security test account.",
            },
        )

        assert registration.status_code == 201, (
            f"Second Architect registration failed: HTTP "
            f"{registration.status_code}: {registration.text[:400]}"
        )

        # 3. Company approves the second Architect.
        pending_response = client.get(
            "/company/architects/pending",
            headers=company_headers,
        )
        assert pending_response.status_code == 200

        second_profile = next(
            (
                profile
                for profile in pending_response.json()
                if profile.get("email") == second_email
            ),
            None,
        )
        assert second_profile is not None, (
            "New Architect was not found in the Company approval queue."
        )

        approval_response = client.post(
            f"/company/architects/{second_profile['id']}/approve",
            headers=company_headers,
        )
        assert approval_response.status_code == 200, (
            f"Second Architect approval failed: HTTP "
            f"{approval_response.status_code}: "
            f"{approval_response.text[:400]}"
        )

        # Log in after approval to obtain a fresh token.
        second_headers = login(
            client, second_email, second_password, "Second Architect"
        )

        # 4. The original Architect creates a project.
        title = f"AUTOMATED TEST - Ownership {suffix}"
        project_response = client.post(
            "/projects",
            headers=owner_headers,
            json={
                "title": title,
                "description": "Cross-Architect upload authorization test.",
                "property_type": "Residential",
                "city": "Pune",
                "state": "Maharashtra",
                "area_sqft": 900,
            },
        )

        assert project_response.status_code == 201, (
            f"Project creation failed: HTTP "
            f"{project_response.status_code}: "
            f"{project_response.text[:400]}"
        )

        project_id = str(project_response.json()["id"])
        assert project_response.json()["status"] == "pending_review"

        # 5. Company approves the original Architect's project.
        project_approval = client.post(
            f"/company/projects/{project_id}/approve",
            headers=company_headers,
        )
        assert project_approval.status_code == 200, (
            f"Project approval failed: HTTP "
            f"{project_approval.status_code}: "
            f"{project_approval.text[:400]}"
        )

        # 6. The second Architect attempts to upload an image to it.
        buffer = io.BytesIO()
        Image.new("RGB", (2, 2), color=(0, 150, 90)).save(
            buffer, format="PNG"
        )

        upload_response = client.post(
            f"/projects/{project_id}/images",
            headers=second_headers,
            files={
                "file": (
                    "cross-owner-test.png",
                    buffer.getvalue(),
                    "image/png",
                )
            },
            data={"alt_text": "Cross-Architect upload test"},
        )

        assert upload_response.status_code in (403, 404), (
            "Cross-Architect image upload should be rejected with "
            f"403 or 404, received HTTP {upload_response.status_code}: "
            f"{upload_response.text[:300]}"
        )

        # 7. Verify that the rejected attempt created no image.
        images_response = client.get(
            f"/projects/{project_id}/images"
        )
        assert images_response.status_code == 200
        assert images_response.json() == [], (
            "An image was created despite the unauthorized upload attempt."
        )

        # 8. Verify the legitimate owner's project remains approved and public.
        public_response = client.get("/projects/public")
        assert public_response.status_code == 200

        public_project = next(
            (
                item for item in public_response.json()
                if str(item["id"]) == project_id
            ),
            None,
        )
        assert public_project is not None, (
            "Unauthorized upload unexpectedly hid the owner's project."
        )
        assert public_project["status"] == "approved"

        print(f"\nCross-Architect upload security test passed: {title}")
        print(f"Project ID: {project_id}")