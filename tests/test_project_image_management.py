
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
    assert token, f"{role} login returned no token."
    return {"Authorization": f"Bearer {token}"}


def png_bytes(color=(0, 150, 90)):
    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), color=color).save(buffer, format="PNG")
    return buffer.getvalue()


def create_project(client, headers):
    response = client.post(
        "/projects",
        headers=headers,
        json={
            "title": f"AUTOMATED TEST - Image management {uuid.uuid4().hex[:8]}",
            "description": "Automated image-management test.",
            "property_type": "Residential",
            "city": "Pune",
            "state": "Maharashtra",
            "area_sqft": 900,
        },
    )
    assert response.status_code == 201, (
        f"Project creation failed: HTTP {response.status_code}: "
        f"{response.text[:400]}"
    )
    return str(response.json()["id"])


def upload_image(client, headers, project_id, filename, is_cover=False):
    response = client.post(
        f"/projects/{project_id}/images",
        headers=headers,
        files={
            "file": (filename, png_bytes(), "image/png"),
        },
        data={
            "alt_text": filename,
            "is_cover": str(is_cover).lower(),
        },
    )
    assert response.status_code == 201, (
        f"Image upload failed: HTTP {response.status_code}: "
        f"{response.text[:400]}"
    )
    return response.json()


def test_replace_image_resets_review_state():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        headers = login(
            client,
            required_env("COREBRICK_TEST_ARCHITECT_EMAIL"),
            required_env("COREBRICK_TEST_ARCHITECT_PASSWORD"),
            "Architect",
        )
        project_id = create_project(client, headers)
        image = upload_image(
            client, headers, project_id, "replace-original.png"
        )

        response = client.post(
            f"/projects/mine/{project_id}/images/{image['id']}/replace",
            headers=headers,
            files={
                "file": (
                    "replace-new.png",
                    png_bytes((200, 30, 50)),
                    "image/png",
                )
            },
        )
        assert response.status_code == 200, (
            f"Image replacement failed: HTTP {response.status_code}: "
            f"{response.text[:400]}"
        )
        updated = response.json()
        assert updated["review_status"] == "pending_review"
        assert updated.get("review_notes") is None


def test_delete_image_removes_image_record():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        headers = login(
            client,
            required_env("COREBRICK_TEST_ARCHITECT_EMAIL"),
            required_env("COREBRICK_TEST_ARCHITECT_PASSWORD"),
            "Architect",
        )
        project_id = create_project(client, headers)
        image = upload_image(
            client, headers, project_id, "delete-test.png"
        )

        response = client.delete(
            f"/projects/mine/{project_id}/images/{image['id']}",
            headers=headers,
        )
        assert response.status_code == 204, (
            f"Image deletion failed: HTTP {response.status_code}: "
            f"{response.text[:400]}"
        )

        # The project is pending review, so use the authenticated
        # project image manager endpoint to verify its image list.
        listing = client.get(
            f"/projects/mine/{project_id}/images",
            headers=headers,
        )
        assert listing.status_code == 200, (
            f"Could not verify image list: HTTP {listing.status_code}: "
            f"{listing.text[:300]}"
        )
        assert all(
            str(item.get("id")) != str(image["id"])
            for item in listing.json()
        ), "Deleted image is still present in the image list."


def test_architect_cannot_replace_or_delete_another_architect_image():
    suffix = uuid.uuid4().hex[:10]
    second_email = f"image-owner-{suffix}@example.com"
    second_password = uuid.uuid4().hex + "Aa1!"
    second_phone = f"9{uuid.uuid4().int % 1_000_000_000:09d}"

    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        owner_headers = login(
            client,
            required_env("COREBRICK_TEST_ARCHITECT_EMAIL"),
            required_env("COREBRICK_TEST_ARCHITECT_PASSWORD"),
            "Project owner Architect",
        )
        company_headers = login(
            client,
            required_env("COREBRICK_TEST_COMPANY_EMAIL"),
            required_env("COREBRICK_TEST_COMPANY_PASSWORD"),
            "Company",
        )

        registration = client.post(
            "/auth/register/architect",
            json={
                "full_name": f"Image Owner Test {suffix}",
                "email": second_email,
                "password": second_password,
                "phone": second_phone,
                "bio": "Temporary image ownership test account.",
            },
        )
        assert registration.status_code == 201, (
            f"Architect registration failed: HTTP "
            f"{registration.status_code}: {registration.text[:400]}"
        )

        pending = client.get(
            "/company/architects/pending",
            headers=company_headers,
        )
        assert pending.status_code == 200
        profile = next(
            (
                item for item in pending.json()
                if item.get("email") == second_email
            ),
            None,
        )
        assert profile is not None, "Test architect was not in the approval queue."

        approval = client.post(
            f"/company/architects/{profile['id']}/approve",
            headers=company_headers,
        )
        assert approval.status_code == 200

        second_headers = login(
            client, second_email, second_password, "Second Architect"
        )
        project_id = create_project(client, owner_headers)
        image = upload_image(
            client, owner_headers, project_id, "private-owner-image.png"
        )

        replace = client.post(
            f"/projects/mine/{project_id}/images/{image['id']}/replace",
            headers=second_headers,
            files={
                "file": (
                    "unauthorized-replace.png",
                    png_bytes((20, 30, 200)),
                    "image/png",
                )
            },
        )
        assert replace.status_code in (403, 404), (
            f"Unauthorized replacement was not blocked: "
            f"HTTP {replace.status_code}: {replace.text[:300]}"
        )

        delete = client.delete(
            f"/projects/mine/{project_id}/images/{image['id']}",
            headers=second_headers,
        )
        assert delete.status_code in (403, 404), (
            f"Unauthorized deletion was not blocked: "
            f"HTTP {delete.status_code}: {delete.text[:300]}"
        )



def test_delete_image_removes_physical_file():
    from app.routers.project_images import UPLOAD_DIR

    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        headers = login(
            client,
            required_env("COREBRICK_TEST_ARCHITECT_EMAIL"),
            required_env("COREBRICK_TEST_ARCHITECT_PASSWORD"),
            "Architect",
        )
        project_id = create_project(client, headers)

        files_before = set(UPLOAD_DIR.iterdir())

        image = upload_image(
            client, headers, project_id, "physical-delete-test.png"
        )

        files_after = set(UPLOAD_DIR.iterdir())
        new_files = files_after - files_before

        assert len(new_files) == 1, (
            f"Expected one new stored image file, found {len(new_files)}."
        )
        stored_path = new_files.pop()
        assert stored_path.is_file(), "Uploaded image file was not stored."

        response = client.delete(
            f"/projects/mine/{project_id}/images/{image['id']}",
            headers=headers,
        )
        assert response.status_code == 204, (
            f"Image deletion failed: HTTP {response.status_code}: "
            f"{response.text[:300]}"
        )
        assert not stored_path.exists(), (
            f"Image file still exists after deletion: {stored_path}"
        )



def test_deleting_cover_promotes_another_image():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        headers = login(
            client,
            required_env("COREBRICK_TEST_ARCHITECT_EMAIL"),
            required_env("COREBRICK_TEST_ARCHITECT_PASSWORD"),
            "Architect",
        )
        project_id = create_project(client, headers)

        cover = upload_image(
            client, headers, project_id, "cover-to-delete.png",
            is_cover=True,
        )
        other = upload_image(
            client, headers, project_id, "replacement-cover.png",
        )

        response = client.delete(
            f"/projects/mine/{project_id}/images/{cover['id']}",
            headers=headers,
        )
        assert response.status_code == 204, (
            f"Cover deletion failed: HTTP {response.status_code}: "
            f"{response.text[:300]}"
        )

        listing = client.get(
            f"/projects/mine/{project_id}/images",
            headers=headers,
        )
        assert listing.status_code == 200, (
            f"Could not retrieve images: HTTP {listing.status_code}: "
            f"{listing.text[:300]}"
        )

        remaining = listing.json()
        remaining_ids = {str(item["id"]) for item in remaining}

        assert str(cover["id"]) not in remaining_ids, (
            "Deleted cover image is still present."
        )
        replacement = next(
            (
                item for item in remaining
                if str(item["id"]) == str(other["id"])
            ),
            None,
        )
        assert replacement is not None, "The other image was unexpectedly removed."
        assert replacement["is_cover"] is True, (
            "The remaining image was not promoted to cover."
        )
