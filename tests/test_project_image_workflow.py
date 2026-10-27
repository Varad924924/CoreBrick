import io
import os
import uuid

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


def login(client, email, password, account_type):
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )

    assert response.status_code == 200, (
        f"{account_type} login failed: HTTP "
        f"{response.status_code}: {response.text[:300]}"
    )

    token = response.json().get("access_token")
    assert token, f"{account_type} login returned no access token."

    return {"Authorization": f"Bearer {token}"}


def test_uploading_image_resets_approval_and_protects_images():
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

        # 1. Architect creates a project.
        title = f"AUTOMATED TEST - Image {uuid.uuid4().hex[:8]}"

        create_response = client.post(
            "/projects",
            headers=architect_headers,
            json={
                "title": title,
                "description": "Automated image-review security test.",
                "property_type": "Residential",
                "city": "Pune",
                "state": "Maharashtra",
                "area_sqft": 900,
            },
        )

        assert create_response.status_code == 201, (
            f"Project creation failed: HTTP "
            f"{create_response.status_code}: "
            f"{create_response.text[:400]}"
        )

        project_id = str(create_response.json()["id"])
        assert create_response.json()["status"] == "pending_review"

        # 2. Company approves the project.
        approval_response = client.post(
            f"/company/projects/{project_id}/approve",
            headers=company_headers,
        )

        assert approval_response.status_code == 200, (
            f"Approval failed: HTTP {approval_response.status_code}: "
            f"{approval_response.text[:400]}"
        )

        # Verify the project is now public.
        public_response = client.get("/projects/public")
        assert public_response.status_code == 200

        assert any(
            str(item["id"]) == project_id
            for item in public_response.json()
        ), "Approved project was not publicly visible."

        # 3. Generate a small, valid PNG image in memory.
        image_buffer = io.BytesIO()
        Image.new("RGB", (2, 2), color=(0, 150, 90)).save(
            image_buffer, format="PNG"
        )

        image_bytes = image_buffer.getvalue()

        # 4. Architect uploads an image to their own approved project.
        upload_response = client.post(
            f"/projects/{project_id}/images",
            headers=architect_headers,
            files={
                "file": (
                    "automated-test.png",
                    image_bytes,
                    "image/png",
                )
            },
            data={"alt_text": "Automated test image"},
        )

        assert upload_response.status_code == 201, (
            f"Image upload failed: HTTP "
            f"{upload_response.status_code}: "
            f"{upload_response.text[:400]}"
        )

        image_info = upload_response.json()
        image_id = image_info.get("id")

        assert image_id, (
            f"Upload response did not contain an image ID. "
            f"Returned fields: {list(image_info.keys())}"
        )

        # 5. The upload must reset the project to pending review.
        mine_response = client.get(
            "/projects/mine",
            headers=architect_headers,
        )
        assert mine_response.status_code == 200

        own_project = next(
            (
                item for item in mine_response.json()
                if str(item["id"]) == project_id
            ),
            None,
        )

        assert own_project is not None
        assert own_project["status"] == "pending_review", (
            "Uploading an image did not reset the project to pending_review."
        )

        # 6. The pending project must no longer appear publicly.
        public_after_upload = client.get("/projects/public")
        assert public_after_upload.status_code == 200

        assert not any(
            str(item["id"]) == project_id
            for item in public_after_upload.json()
        ), "Project remained publicly visible after image upload."

        # 7. The image listing must be inaccessible while review is pending.
        images_response = client.get(
            f"/projects/{project_id}/images"
        )
        assert images_response.status_code == 404, (
            "Images for a pending project should not be publicly accessible."
        )

        # 8. Direct file access must also be blocked.
        file_response = client.get(
            f"/projects/{project_id}/images/{image_id}/file"
        )
        assert file_response.status_code == 404, (
            "Direct image-file access should be blocked while review is pending."
        )

        print(f"\nImage-review workflow passed: {title}")
        print(f"Project ID: {project_id}")
        print(f"Image ID: {image_id}")