
import uuid

import httpx

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 30.0


def test_unknown_project_images_are_not_accessible():
    project_id = str(uuid.uuid4())

    response = httpx.get(
        f"{BASE_URL}/projects/{project_id}/images",
        timeout=TIMEOUT,
    )

    assert response.status_code == 404


def test_unknown_project_image_file_is_not_accessible():
    project_id = str(uuid.uuid4())
    image_id = str(uuid.uuid4())

    response = httpx.get(
        f"{BASE_URL}/projects/{project_id}/images/{image_id}/file",
        timeout=TIMEOUT,
    )

    assert response.status_code == 404
