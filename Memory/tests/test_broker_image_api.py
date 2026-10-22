from __future__ import annotations

from pathlib import Path
import pytest
from starlette.testclient import TestClient

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "Message_Broker"))

from app import app


@pytest.fixture
def client():
    return TestClient(app)


def test_message_broker_image_comparison_api(client):
    # Format or clean image comparison via HTTP API
    client.delete("/images/comparison?all=true")

    # 1. POST /images/comparison
    post_res = client.post(
        "/images/comparison",
        json={
            "image_id": "test_api_img_1",
            "app_name": "Calculator",
            "timestamp": 123456789.0,
            "pixel_values": {"shape": [2, 2], "data": "AAA="},
            "grayscale_matrix": {"shape": [2, 2], "data": "AAA="},
        },
    )
    assert post_res.status_code == 201
    post_data = post_res.json()
    assert post_data["status"] == "success"
    assert post_data["image_id"] == "test_api_img_1"

    # 2. GET /images/comparison
    get_res = client.get("/images/comparison?limit=10")
    assert get_res.status_code == 200
    images = get_res.json()
    assert len(images) == 1
    assert images[0]["image_id"] == "test_api_img_1"
    assert images[0]["app_name"] == "Calculator"

    # 3. GET /images/comparison/{image_id}
    detail_res = client.get("/images/comparison/test_api_img_1")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["image_id"] == "test_api_img_1"

    # 4. GET /images/comparison/search?app_name=Calculator
    search_res = client.get("/images/comparison/search?app_name=Calculator")
    assert search_res.status_code == 200
    results = search_res.json()
    assert len(results) == 1
    assert results[0]["image_id"] == "test_api_img_1"

    # Search non-existent app
    search_empty = client.get("/images/comparison/search?app_name=NonExistentApp")
    assert search_empty.status_code == 200
    assert len(search_empty.json()) == 0

    # 5. DELETE /images/comparison/{image_id}
    del_res = client.delete("/images/comparison/test_api_img_1")
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True

    # Verify 404 after deletion
    detail_404 = client.get("/images/comparison/test_api_img_1")
    assert detail_404.status_code == 404

    # Clean up
    client.delete("/images/comparison?all=true")
