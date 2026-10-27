
import io
import uuid

import httpx
from PIL import Image

BASE_URL = "http://127.0.0.1:8000"
TIMEOUT = 15.0


def test_image_upload_requires_authentication():
    # Generate a valid PNG image entirely in memory.
    image_buffer = io.BytesIO()
    Image.new("RGB", (2, 2), color=(0, 150, 90)).save(
        image_buffer,
        format="PNG",
    )

    project_id = str(uuid.uuid4())

    response = httpx.post(
        f"{BASE_URL}/projects/{project_id}/images",
        files={
            "file": (
                "unauthorized-test.png",
                image_buffer.getvalue(),
                "image/png",
            )
        },
        data={"alt_text": "Unauthenticated upload test"},
        timeout=TIMEOUT,
    )

    assert response.status_code in (401, 403), (
        "Unauthenticated image upload should be rejected with "
        f"401 or 403, but received HTTP {response.status_code}."
    )
