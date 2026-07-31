"""Đăng tối đa một bài chưa xuất bản lên Facebook Fanpage qua Graph API.

Biến môi trường bắt buộc:
- FACEBOOK_PAGE_ID
- FACEBOOK_PAGE_ACCESS_TOKEN

Biến môi trường tùy chọn:
- FACEBOOK_GRAPH_API_VERSION (mặc định: v19.0)
- FACEBOOK_POSTS_FILE (mặc định: data_posts.json cạnh file này)
- FACEBOOK_REQUEST_TIMEOUT (mặc định: 30 giây)

Không ghi token trực tiếp vào mã nguồn hoặc commit token lên GitHub.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_FILE = SCRIPT_DIR / "data_posts.json"


@dataclass(frozen=True)
class Config:
    page_id: str
    access_token: str
    graph_api_version: str
    data_file: Path
    timeout_seconds: float


class ConfigurationError(RuntimeError):
    """Cấu hình chạy không hợp lệ."""


class DataFileError(RuntimeError):
    """File hàng đợi không hợp lệ hoặc không thể lưu."""


def load_config() -> Config:
    page_id = os.getenv("FACEBOOK_PAGE_ID", "").strip()
    access_token = os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN", "").strip()
    graph_api_version = os.getenv("FACEBOOK_GRAPH_API_VERSION", "v19.0").strip()
    data_file = Path(os.getenv("FACEBOOK_POSTS_FILE", str(DEFAULT_DATA_FILE))).expanduser()

    try:
        timeout_seconds = float(os.getenv("FACEBOOK_REQUEST_TIMEOUT", "30"))
    except ValueError as exc:
        raise ConfigurationError("FACEBOOK_REQUEST_TIMEOUT phải là một số.") from exc

    if not page_id:
        raise ConfigurationError("Thiếu biến môi trường FACEBOOK_PAGE_ID.")
    if not access_token:
        raise ConfigurationError("Thiếu biến môi trường FACEBOOK_PAGE_ACCESS_TOKEN.")
    if not graph_api_version.startswith("v"):
        raise ConfigurationError("FACEBOOK_GRAPH_API_VERSION phải có dạng vXX.X.")
    if timeout_seconds <= 0:
        raise ConfigurationError("FACEBOOK_REQUEST_TIMEOUT phải lớn hơn 0.")

    return Config(
        page_id=page_id,
        access_token=access_token,
        graph_api_version=graph_api_version,
        data_file=data_file,
        timeout_seconds=timeout_seconds,
    )


def load_posts(filename: Path) -> list[dict[str, Any]]:
    if not filename.exists():
        raise DataFileError(f"Không tìm thấy file dữ liệu: {filename}")

    try:
        with filename.open("r", encoding="utf-8") as file:
            payload = json.load(file)
    except json.JSONDecodeError as exc:
        raise DataFileError(
            f"JSON không hợp lệ tại dòng {exc.lineno}, cột {exc.colno}: {exc.msg}"
        ) from exc
    except OSError as exc:
        raise DataFileError(f"Không thể đọc file dữ liệu: {exc}") from exc

    if not isinstance(payload, list):
        raise DataFileError("File dữ liệu phải chứa một mảng JSON.")

    normalized: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for index, item in enumerate(payload):
        if not isinstance(item, dict):
            raise DataFileError(f"Phần tử thứ {index + 1} phải là một object JSON.")

        post_id = str(item.get("id", "")).strip()
        content = str(item.get("content", "")).strip()

        if not post_id:
            raise DataFileError(f"Bài thứ {index + 1} thiếu trường id.")
        if post_id in seen_ids:
            raise DataFileError(f"ID bị trùng: {post_id}")
        if not content:
            raise DataFileError(f"Bài {post_id} không có nội dung.")

        seen_ids.add(post_id)
        normalized.append({
            **item,
            "id": post_id,
            "content": content,
            "is_published": bool(item.get("is_published", False)),
        })

    return normalized


def save_posts_atomic(filename: Path, posts: list[dict[str, Any]]) -> None:
    filename.parent.mkdir(parents=True, exist_ok=True)

    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=filename.parent,
            prefix=f".{filename.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary_file:
            json.dump(posts, temporary_file, ensure_ascii=False, indent=2)
            temporary_file.write("\n")
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
            temporary_path = Path(temporary_file.name)

        os.replace(temporary_path, filename)
    except OSError as exc:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink(missing_ok=True)
        raise DataFileError(f"Không thể cập nhật file dữ liệu: {exc}") from exc


def publish_to_facebook(config: Config, message: str) -> str:
    endpoint = (
        f"https://graph.facebook.com/{config.graph_api_version}/"
        f"{config.page_id}/feed"
    )

    try:
        response = requests.post(
            endpoint,
            data={"message": message, "access_token": config.access_token},
            timeout=config.timeout_seconds,
        )
    except requests.Timeout as exc:
        raise RuntimeError("Facebook Graph API phản hồi quá thời gian.") from exc
    except requests.RequestException as exc:
        raise RuntimeError(f"Không thể kết nối Facebook Graph API: {exc}") from exc

    try:
        payload = response.json()
    except ValueError:
        payload = {}

    if not response.ok:
        error = payload.get("error") if isinstance(payload, dict) else None
        message_text = error.get("message") if isinstance(error, dict) else None
        error_code = error.get("code") if isinstance(error, dict) else None
        detail = message_text or response.text[:300] or f"HTTP {response.status_code}"
        suffix = f" (mã {error_code})" if error_code is not None else ""
        raise RuntimeError(f"Facebook API từ chối yêu cầu: {detail}{suffix}")

    remote_post_id = payload.get("id") if isinstance(payload, dict) else None
    if not remote_post_id:
        raise RuntimeError("Facebook API trả về thành công nhưng không có ID bài viết.")

    return str(remote_post_id)


def publish_next_post(config: Config) -> bool:
    posts = load_posts(config.data_file)

    for post in posts:
        if post["is_published"]:
            continue

        print(f"Đang đăng bài {post['id']}...")
        remote_post_id = publish_to_facebook(config, post["content"])

        post["is_published"] = True
        post["facebook_post_id"] = remote_post_id
        save_posts_atomic(config.data_file, posts)

        print(f"Đăng thành công. Facebook Post ID: {remote_post_id}")
        return True

    print("Không còn bài viết nào trong hàng đợi.")
    return False


def main() -> int:
    try:
        config = load_config()
        publish_next_post(config)
        return 0
    except (ConfigurationError, DataFileError, RuntimeError) as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
