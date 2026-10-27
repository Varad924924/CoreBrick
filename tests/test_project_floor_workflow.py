import os
import uuid

import httpx
import pytest


BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 20.0


def required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        pytest.fail(f"Missing environment variable: {name}")
    return value


def login_architect(client: httpx.Client) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        json={
            "email": required_env("COREBRICK_TEST_ARCHITECT_EMAIL"),
            "password": required_env("COREBRICK_TEST_ARCHITECT_PASSWORD"),
        },
    )

    assert response.status_code == 200, (
        f"Architect login failed: HTTP {response.status_code}"
    )

    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_test_project(
    client: httpx.Client,
    headers: dict[str, str],
) -> str:
    response = client.post(
        "/projects",
        headers=headers,
        json={
            "title": f"Floor API Test {uuid.uuid4().hex[:8]}",
            "property_type": "Residential",
            "city": "Pune",
            "state": "Maharashtra",
            "building_type": "Apartment",
            "floor_count": 2,
        },
    )

    assert response.status_code == 201, (
        f"Project creation failed: HTTP {response.status_code}: "
        f"{response.text[:300]}"
    )

    return response.json()["id"]


def test_floor_create_list_duplicate_and_public_visibility():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        headers = login_architect(client)
        project_id = create_test_project(client, headers)

        payload = {
            "floor_name": "Ground Floor",
            "floor_number": 0,
            "description": "Living room, kitchen and parking",
            "area_sqft": 1000,
            "sort_order": 0,
        }

        response = client.post(
            f"/projects/{project_id}/floors",
            headers=headers,
            json=payload,
        )

        assert response.status_code == 201, response.text
        floor = response.json()

        assert floor["floor_name"] == "Ground Floor"
        assert floor["floor_number"] == 0
        assert floor["project_id"] == project_id
        assert floor["area_sqft"] == 1000

        # The architect can see floors in their own project.
        response = client.get(
            f"/projects/mine/{project_id}/floors",
            headers=headers,
        )

        assert response.status_code == 200, response.text
        assert len(response.json()) == 1
        assert response.json()[0]["id"] == floor["id"]

        # Duplicate floor numbers are rejected.
        duplicate = client.post(
            f"/projects/{project_id}/floors",
            headers=headers,
            json=payload,
        )

        assert duplicate.status_code == 409, duplicate.text

        # Pending projects must not expose public floor information.
        public_response = client.get(
            f"/projects/{project_id}/floors"
        )

        assert public_response.status_code == 404


def test_floor_update_and_delete():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        headers = login_architect(client)
        project_id = create_test_project(client, headers)

        created = client.post(
            f"/projects/{project_id}/floors",
            headers=headers,
            json={
                "floor_name": "First Floor",
                "floor_number": 1,
                "area_sqft": 800,
            },
        )

        assert created.status_code == 201, created.text
        floor_id = created.json()["id"]

        # Update the floor name and area.
        updated = client.put(
            f"/projects/{project_id}/floors/{floor_id}",
            headers=headers,
            json={
                "floor_name": "First Floor - Revised",
                "area_sqft": 850,
            },
        )

        assert updated.status_code == 200, updated.text
        assert updated.json()["floor_name"] == "First Floor - Revised"
        assert updated.json()["area_sqft"] == 850

        # Delete the floor.
        deleted = client.delete(
            f"/projects/{project_id}/floors/{floor_id}",
            headers=headers,
        )

        assert deleted.status_code == 204

        remaining = client.get(
            f"/projects/mine/{project_id}/floors",
            headers=headers,
        )

        assert remaining.status_code == 200, remaining.text
        assert all(
            item["id"] != floor_id
            for item in remaining.json()
        )

def login_company(client: httpx.Client) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        json={
            "email": required_env("COREBRICK_TEST_COMPANY_EMAIL"),
            "password": required_env("COREBRICK_TEST_COMPANY_PASSWORD"),
        },
    )

    assert response.status_code == 200, (
        f"Company login failed: HTTP {response.status_code}"
    )

    return {
        "Authorization": f"Bearer {response.json()['access_token']}"
    }


def get_project_status(
    client: httpx.Client,
    headers: dict[str, str],
    project_id: str,
) -> str:
    response = client.get("/projects/mine", headers=headers)
    assert response.status_code == 200, response.text

    project = next(
        (item for item in response.json() if item["id"] == project_id),
        None,
    )
    assert project is not None, f"Project {project_id} was not found"

    return project["status"]



def approve_test_project(client, company_headers, project_id):
    # Fetch all images belonging to the project.
    images_response = client.get(
        f"/company/projects/{project_id}/images",
        headers=company_headers,
    )
    assert images_response.status_code == 200, (
        f"Could not fetch project images: "
        f"{images_response.status_code} {images_response.text[:300]}"
    )

    # Approve each image before approving the project.
    for image in images_response.json():
        if image.get("review_status") != "approved":
            image_response = client.post(
                f"/company/projects/{project_id}/images/{image['id']}/approve",
                headers=company_headers,
            )
            assert image_response.status_code == 200, (
                f"Image approval failed: "
                f"{image_response.status_code} {image_response.text[:300]}"
            )

    # Approve the project only after its images are reviewed.
    project_response = client.post(
        f"/company/projects/{project_id}/approve",
        headers=company_headers,
    )
    assert project_response.status_code == 200, (
        f"Project approval failed: "
        f"HTTP {project_response.status_code}: "
        f"{project_response.text[:300]}"
    )



def test_floor_changes_return_approved_project_to_pending_review():
    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        architect_headers = login_architect(client)
        company_headers = login_company(client)
        project_id = create_test_project(client, architect_headers)

        # First approve the project.
        approve_test_project(client, company_headers, project_id)

        assert (
            get_project_status(client, architect_headers, project_id)
            == "approved"
        )

        # Adding a floor changes the project and must trigger reapproval.
        response = client.post(
            f"/projects/{project_id}/floors",
            headers=architect_headers,
            json={
                "floor_name": "Ground Floor",
                "floor_number": 0,
                "area_sqft": 900,
            },
        )

        assert response.status_code == 201, response.text

        assert (
            get_project_status(client, architect_headers, project_id)
            == "pending_review"
        )


def test_deleting_floor_preserves_image_and_clears_floor_association():
    from io import BytesIO
    from PIL import Image

    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        architect_headers = login_architect(client)
        company_headers = login_company(client)
        project_id = create_test_project(client, architect_headers)

        # Create a floor for this project.
        floor_response = client.post(
            f"/projects/{project_id}/floors",
            headers=architect_headers,
            json={
                "floor_name": "First Floor",
                "floor_number": 1,
                "area_sqft": 800,
            },
        )
        assert floor_response.status_code == 201, floor_response.text
        floor_id = floor_response.json()["id"]

        # Generate a small, valid PNG image for the upload.
        image_buffer = BytesIO()
        Image.new("RGB", (2, 2), "white").save(image_buffer, format="PNG")
        image_bytes = image_buffer.getvalue()

        image_response = client.post(
            f"/projects/{project_id}/images",
            headers=architect_headers,
            data={
                "alt_text": "First-floor plan test",
                "category": "floor_plan",
                "floor_id": floor_id,
                "is_cover": "false",
                "sort_order": "0",
            },
            files={
                "file": ("floor-plan.png", image_bytes, "image/png")
            },
        )

        assert image_response.status_code == 201, image_response.text
        image_id = image_response.json()["id"]

        # Delete the floor. Its image should remain in the project.
        delete_response = client.delete(
            f"/projects/{project_id}/floors/{floor_id}",
            headers=architect_headers,
        )
        assert delete_response.status_code == 204

        # Approve the changed project to make its images publicly accessible.
        approve_test_project(client, company_headers, project_id)

        images_response = client.get(
            f"/projects/{project_id}/images"
        )
        assert images_response.status_code == 200, images_response.text

        images = images_response.json()
        retained_image = next(
            (image for image in images if image["id"] == image_id),
            None,
        )

        assert retained_image is not None, "Image was unexpectedly deleted"
        assert retained_image["floor_id"] is None

        # The retained image file must still be accessible.
        file_response = client.get(retained_image["image_url"])
        assert file_response.status_code == 200


def test_architect_cannot_manage_another_architect_floors():
    import secrets

    with httpx.Client(base_url=BASE_URL, timeout=TIMEOUT) as client:
        owner_headers = login_architect(client)
        company_headers = login_company(client)

        # Register a second architect with a unique email.
        second_email = f"floor-owner-{uuid.uuid4().hex[:12]}@example.com"
        second_password = secrets.token_urlsafe(24)
        second_phone = f"9{uuid.uuid4().int % 1_000_000_000:09d}"

        registration = client.post(
            "/auth/register/architect",
            json={
                "full_name": "Floor Test Architect",
                "email": second_email,
                "password": second_password,
                "phone": second_phone,
                "bio": "Automated floor ownership test",
            },
        )

        assert registration.status_code in (200, 201), (
            f"Second architect registration failed: "
            f"HTTP {registration.status_code}: {registration.text[:300]}"
        )

        # Find the new application and approve it through the Company API.
        pending_response = client.get(
            "/company/architects/pending",
            headers=company_headers,
        )
        assert pending_response.status_code == 200, pending_response.text

        second_profile = next(
            (
                item
                for item in pending_response.json()
                if item["email"] == second_email
            ),
            None,
        )
        assert second_profile is not None, (
            "The new architect was not found in pending applications"
        )

        approval_response = client.post(
            f"/company/architects/{second_profile['id']}/approve",
            headers=company_headers,
        )
        assert approval_response.status_code == 200, approval_response.text

        # Log in as the second architect and create their project and floor.
        second_login = client.post(
            "/auth/login",
            json={
                "email": second_email,
                "password": second_password,
            },
        )
        assert second_login.status_code == 200, second_login.text

        second_headers = {
            "Authorization": (
                f"Bearer {second_login.json()['access_token']}"
            )
        }

        project_id = create_test_project(client, second_headers)

        floor_response = client.post(
            f"/projects/{project_id}/floors",
            headers=second_headers,
            json={
                "floor_name": "Ground Floor",
                "floor_number": 0,
                "area_sqft": 700,
            },
        )
        assert floor_response.status_code == 201, floor_response.text
        floor_id = floor_response.json()["id"]

        # The first architect must not list, edit, or delete the other
        # architect's floor.
        list_response = client.get(
            f"/projects/mine/{project_id}/floors",
            headers=owner_headers,
        )
        assert list_response.status_code == 403

        update_response = client.put(
            f"/projects/{project_id}/floors/{floor_id}",
            headers=owner_headers,
            json={"floor_name": "Unauthorized edit"},
        )
        assert update_response.status_code == 403

        delete_response = client.delete(
            f"/projects/{project_id}/floors/{floor_id}",
            headers=owner_headers,
        )
        assert delete_response.status_code == 403