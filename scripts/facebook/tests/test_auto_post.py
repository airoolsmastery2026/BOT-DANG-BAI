from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


MODULE_PATH = Path(__file__).resolve().parents[1] / "auto_post.py"
SPEC = importlib.util.spec_from_file_location("facebook_auto_post", MODULE_PATH)
assert SPEC and SPEC.loader
AUTO_POST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUTO_POST)


class LoadPostsTests(unittest.TestCase):
    def write_json(self, payload: object) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "posts.json"
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return path

    def test_load_posts_normalizes_valid_data(self) -> None:
        path = self.write_json([
            {"id": " post-1 ", "content": " Nội dung ", "is_published": 0}
        ])

        posts = AUTO_POST.load_posts(path)

        self.assertEqual(posts[0]["id"], "post-1")
        self.assertEqual(posts[0]["content"], "Nội dung")
        self.assertFalse(posts[0]["is_published"])

    def test_load_posts_rejects_duplicate_ids(self) -> None:
        path = self.write_json([
            {"id": "same", "content": "Một"},
            {"id": "same", "content": "Hai"},
        ])

        with self.assertRaises(AUTO_POST.DataFileError):
            AUTO_POST.load_posts(path)

    def test_load_posts_rejects_non_list_payload(self) -> None:
        path = self.write_json({"id": "post-1"})

        with self.assertRaises(AUTO_POST.DataFileError):
            AUTO_POST.load_posts(path)


class PublishTests(unittest.TestCase):
    def config(self, data_file: Path) -> object:
        return AUTO_POST.Config(
            page_id="page-id",
            access_token="secret-token",
            graph_api_version="v19.0",
            data_file=data_file,
            timeout_seconds=10,
        )

    @patch.object(AUTO_POST.requests, "post")
    def test_publish_to_facebook_returns_remote_id(self, request_post: Mock) -> None:
        response = Mock()
        response.ok = True
        response.json.return_value = {"id": "page-id_123"}
        request_post.return_value = response

        remote_id = AUTO_POST.publish_to_facebook(
            self.config(Path("unused.json")), "Xin chào"
        )

        self.assertEqual(remote_id, "page-id_123")
        request_post.assert_called_once()
        _, kwargs = request_post.call_args
        self.assertEqual(kwargs["timeout"], 10)
        self.assertEqual(kwargs["data"]["message"], "Xin chào")

    @patch.object(AUTO_POST.requests, "post")
    def test_publish_to_facebook_raises_on_api_error(self, request_post: Mock) -> None:
        response = Mock()
        response.ok = False
        response.status_code = 400
        response.text = "Bad request"
        response.json.return_value = {
            "error": {"message": "Invalid token", "code": 190}
        }
        request_post.return_value = response

        with self.assertRaisesRegex(RuntimeError, "Invalid token"):
            AUTO_POST.publish_to_facebook(
                self.config(Path("unused.json")), "Xin chào"
            )

    @patch.object(AUTO_POST, "publish_to_facebook", return_value="page-id_456")
    def test_publish_next_post_updates_only_first_pending_post(
        self, publish: Mock
    ) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "posts.json"
        path.write_text(
            json.dumps([
                {"id": "done", "content": "Đã đăng", "is_published": True},
                {"id": "next", "content": "Đăng tiếp", "is_published": False},
                {"id": "later", "content": "Đăng sau", "is_published": False},
            ], ensure_ascii=False),
            encoding="utf-8",
        )

        published = AUTO_POST.publish_next_post(self.config(path))
        saved = json.loads(path.read_text(encoding="utf-8"))

        self.assertTrue(published)
        self.assertTrue(saved[1]["is_published"])
        self.assertEqual(saved[1]["facebook_post_id"], "page-id_456")
        self.assertFalse(saved[2]["is_published"])
        publish.assert_called_once_with(self.config(path), "Đăng tiếp")


if __name__ == "__main__":
    unittest.main()
