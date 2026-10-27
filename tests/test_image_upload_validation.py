
import io
import os
import uuid

import httpx
import pytest
from PIL import Image

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30.0
MAX_IMAGE_SIZE = 5 * 1024 * 1024


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
        f"{role} login failed: HTTP {response.status_code}"
    )

    token = response.json().get("access_token")
    assert token, f"{role} login returned no access token."
    return {"Authorization": f"Bearer {token}"}


def test_image_upload_rejects_unsupported_and_oversized_files():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        architect_headers = login(
            client,
            required_env("COREBRICK_TEST_ARCHITECT_EMAIL"),
            required_env("COREBRICK_TEST_ARCHITECT_PASSWORD"),
            "Architect",
        )
        company_headers = login(
            client,
            required_env("COREBRICK_TEST_COMPANY_EMAIL"),
            required_env("COREBRICK_TEST_COMPANY_PASSWORD"),
            "Company",
        )

        # Create a project and have Company approve it.
        title = f"AUTOMATED TEST - Image validation {uuid.uuid4().hex[:8]}"

        create_response = client.post(
            "/projects",
            headers=architect_headers,
            json={
                "title": title,
                "description": "Image validation test.",
                "property_type": "Residential",
                "city": "Pune",
                "state": "Maharashtra",
                "area_sqft": 900,
            },
        )
        assert create_response.status_code == 201, create_response.text[:300]

        project_id = str(create_response.json()["id"])
        assert create_response.json()["status"] == "pending_review"

        approve_response = client.post(
            f"/company/projects/{project_id}/approve",
            headers=company_headers,
        )
        assert approve_response.status_code == 200, approve_response.text[:300]

        # Attempt 1: upload an unsupported text file.
        invalid_response = client.post(
            f"/projects/{project_id}/images",
            headers=architect_headers,
            files={
                "file": (
                    "not-an-image.txt",
                    b"This is plain text, not an image.",
                    "text/plain",
                )
            },
            data={"alt_text": "Unsupported format test"},
        )

        assert 400 <= invalid_response.status_code < 500, (
            "Unsupported file was not rejected: "
            f"HTTP {invalid_response.status_code}"
        )

        # Attempt 2: generate a valid PNG larger than the 5 MiB limit.
        width, height = 1500, 1500
        raw_pixels = os.urandom(width * height * 3)
        large_image = Image.frombytes("RGB", (width, height), raw_pixels)

        buffer = io.BytesIO()
        large_image.save(buffer, format="PNG")
        large_png = buffer.getvalue()

        assert len(large_png) > MAX_IMAGE_SIZE, (
            "Generated test PNG is not larger than the configured 5 MiB limit."
        )

        oversized_response = client.post(
            f"/projects/{project_id}/images",
            headers=architect_headers,
            files={
                "file": (
                    "oversized-test.png",
                    large_png,
                    "image/png",
                )
            },
            data={"alt_text": "Oversized image test"},
        )

        assert 400 <= oversized_response.status_code < 500, (
            "Oversized image was not rejected: "
            f"HTTP {oversized_response.status_code}"
        )

        # Neither failed upload should disturb the approved project.
        public_response = client.get("/projects/public")
        assert public_response.status_code == 200

        assert any(
            str(item["id"]) == project_id
            for item in public_response.json()
        ), "Rejected uploads unexpectedly removed the project from public listings."

        images_response = client.get(f"/projects/{project_id}/images")
        assert images_response.status_code == 200
        assert images_response.json() == [], (
            "A rejected upload unexpectedly created an image record."
        )
