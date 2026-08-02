import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from coordination.http import create_handler
from coordination.store import CoordinationStore


PROCESS = {
    "boards": [
        {
            "id": "delivery",
            "name": "Delivery",
            "columns": [
                {"id": "backlog", "name": "Backlog", "agent_id": None},
                {
                    "id": "implementation",
                    "name": "Implementation",
                    "agent_id": "implementer",
                },
            ],
        }
    ],
    "agents": [
        {"id": "implementer", "name": "Implementation Agent"},
        {"id": "reviewer", "name": "Code Reviewer"},
    ],
}


@contextmanager
def running_server(handler):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


@contextmanager
def running_application():
    with tempfile.TemporaryDirectory() as directory:
        store = CoordinationStore(Path(directory) / "coordination.sqlite3")
        try:
            with running_server(create_handler(store)) as base_url:
                yield base_url
        finally:
            store.close()


@contextmanager
def reachable_project_container():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()

        def log_message(self, format, *args):
            return

    with running_server(Handler) as base_url:
        yield base_url


def request(base_url, method, path, body=None, headers=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    outgoing_headers = {"Content-Type": "application/json", **(headers or {})}
    request_object = urllib.request.Request(
        base_url + path, data=data, headers=outgoing_headers, method=method
    )
    try:
        with urllib.request.urlopen(request_object) as response:
            payload = response.read().decode("utf-8")
            return response.status, response.headers, json.loads(payload) if payload else None
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8")
        return error.code, error.headers, json.loads(payload) if payload else None


class BoardFoundationIntegrationTests(unittest.TestCase):
    def test_process_reapplication_preserves_identities_and_live_tasks(self):
        with running_application() as base_url:
            status, _, first_apply = request(
                base_url,
                "POST",
                "/api/process/apply",
                PROCESS,
                {"Idempotency-Key": "apply-1", "X-Actor": "user:paul"},
            )
            self.assertEqual(200, status)
            self.assertEqual("delivery", first_apply["boards"][0]["id"])

            _, _, task = request(
                base_url,
                "POST",
                "/api/tasks",
                {
                    "board_id": "delivery",
                    "column_id": "backlog",
                    "title": "Preserve this live task",
                    "description": "Existing work must survive process reapplication.",
                },
                {"Idempotency-Key": "task-1", "X-Actor": "user:paul"},
            )

            renamed = json.loads(json.dumps(PROCESS))
            renamed["boards"][0]["name"] = "Product Delivery"
            renamed["boards"][0]["columns"][0]["name"] = "Ideas"
            renamed["agents"][0]["name"] = "Builder"
            status, _, second_apply = request(
                base_url,
                "POST",
                "/api/process/apply",
                renamed,
                {"Idempotency-Key": "apply-2", "X-Actor": "user:paul"},
            )

            self.assertEqual(200, status)
            self.assertEqual("Product Delivery", second_apply["boards"][0]["name"])
            status, _, preserved = request(
                base_url, "GET", f"/api/tasks/{task['id']}"
            )
            self.assertEqual(200, status)
            self.assertEqual("backlog", preserved["column_id"])
            self.assertEqual("Ideas", preserved["column_name"])

            without_backlog = json.loads(json.dumps(renamed))
            without_backlog["boards"][0]["columns"] = [
                without_backlog["boards"][0]["columns"][1]
            ]
            _, _, removed = request(
                base_url,
                "POST",
                "/api/process/apply",
                without_backlog,
                {"Idempotency-Key": "apply-3", "X-Actor": "user:paul"},
            )
            self.assertEqual(task["id"], removed["unmapped_tasks"][0]["id"])
            _, _, still_inspectable = request(
                base_url, "GET", f"/api/tasks/{task['id']}"
            )
            self.assertEqual("backlog", still_inspectable["column_id"])

            _, _, restored = request(
                base_url,
                "POST",
                "/api/process/apply",
                renamed,
                {"Idempotency-Key": "apply-4", "X-Actor": "user:paul"},
            )
            self.assertEqual([], restored["unmapped_tasks"])

    def test_commands_atomically_preserve_actor_event_and_activation_provenance(self):
        with running_application() as base_url:
            request(
                base_url,
                "POST",
                "/api/process/apply",
                PROCESS,
                {"Idempotency-Key": "apply", "X-Actor": "user:paul"},
            )
            _, _, task = request(
                base_url,
                "POST",
                "/api/tasks",
                {
                    "board_id": "delivery",
                    "column_id": "backlog",
                    "title": "Trace every change",
                    "description": "Prove exact provenance.",
                },
                {"Idempotency-Key": "task", "X-Actor": "user:paul"},
            )

            move_headers = {
                "Idempotency-Key": "move-once",
                "X-Actor": "agent:reviewer",
            }
            status, _, moved = request(
                base_url,
                "POST",
                f"/api/tasks/{task['id']}/move",
                {"column_id": "implementation", "expected_revision": 1},
                move_headers,
            )
            self.assertEqual(200, status)
            _, _, duplicate = request(
                base_url,
                "POST",
                f"/api/tasks/{task['id']}/move",
                {"column_id": "implementation", "expected_revision": 1},
                move_headers,
            )
            self.assertEqual(moved, duplicate)

            _, _, detail = request(base_url, "GET", f"/api/tasks/{task['id']}")
            move_events = [
                event for event in detail["timeline"] if event["type"] == "task.moved"
            ]
            self.assertEqual(1, len(move_events))
            self.assertEqual("agent", move_events[0]["author_kind"])
            self.assertEqual("reviewer", move_events[0]["author_id"])
            self.assertEqual(move_events[0]["id"], detail["activations"][0]["source_event_id"])
            self.assertEqual("column_entry", detail["activations"][0]["reason"])

            request(
                base_url,
                "POST",
                f"/api/tasks/{task['id']}/comments",
                {"body": "Please check this @reviewer, and again @reviewer. Decision @user."},
                {"Idempotency-Key": "comment", "X-Actor": "agent:implementer"},
            )
            _, _, target = request(
                base_url,
                "POST",
                "/api/tasks",
                {
                    "board_id": "delivery",
                    "column_id": "backlog",
                    "title": "Dependency target",
                    "description": "Independent related task.",
                },
                {"Idempotency-Key": "target-task", "X-Actor": "user:paul"},
            )
            request(
                base_url,
                "POST",
                f"/api/tasks/{task['id']}/relationships",
                {"type": "depends_on", "target_task_id": target["id"]},
                {"Idempotency-Key": "relationship", "X-Actor": "user:paul"},
            )
            _, _, detail = request(base_url, "GET", f"/api/tasks/{task['id']}")

            mention_activations = [
                activation
                for activation in detail["activations"]
                if activation["reason"] == "agent_mention"
            ]
            self.assertEqual(1, len(mention_activations))
            self.assertEqual("reviewer", mention_activations[0]["agent_id"])
            self.assertEqual(1, len(detail["attention_reasons"]))
            relationship_event = next(
                event
                for event in detail["timeline"]
                if event["type"] == "relationship.created"
            )
            self.assertEqual(("user", "paul"), (relationship_event["author_kind"], relationship_event["author_id"]))

    def test_fallback_board_has_linkable_details_and_accessible_move(self):
        with running_application() as base_url:
            request(
                base_url,
                "POST",
                "/api/process/apply",
                PROCESS,
                {"Idempotency-Key": "apply", "X-Actor": "user:paul"},
            )
            _, _, task = request(
                base_url,
                "POST",
                "/api/tasks",
                {
                    "board_id": "delivery",
                    "column_id": "backlog",
                    "title": "Move without dragging",
                    "description": "The full task entry point.",
                },
                {"Idempotency-Key": "task", "X-Actor": "user:paul"},
            )

            with urllib.request.urlopen(base_url + "/") as response:
                board_html = response.read().decode("utf-8")
            self.assertIn("Feasibility spike", board_html)
            self.assertIn("Drag-and-drop is intentionally not implemented", board_html)
            self.assertIn("Move without dragging", board_html)
            self.assertIn(f'href="/tasks/{task["id"]}"', board_html)

            with urllib.request.urlopen(base_url + f"/tasks/{task['id']}") as response:
                detail_html = response.read().decode("utf-8")
            self.assertIn('aria-label="Move task to column"', detail_html)
            self.assertIn('<button type="submit">Move task</button>', detail_html)

            form = urllib.parse.urlencode(
                {"column_id": "implementation", "expected_revision": "1"}
            ).encode("utf-8")
            move_request = urllib.request.Request(
                base_url + f"/tasks/{task['id']}/move",
                data=form,
                method="POST",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(move_request) as response:
                moved_html = response.read().decode("utf-8")
            self.assertIn("Implementation", moved_html)
            self.assertIn("queued", moved_html)

    def test_documented_kanboard_move_webhook_is_rejected_without_actor(self):
        documented_webhook = {
            "event_name": "task.move.column",
            "event_data": {
                "task_id": "4",
                "task": {
                    "id": "4",
                    "creator_id": "1",
                    "owner_id": "0",
                    "column_id": "2",
                    "title": "My task",
                },
                "changes": {"column_id": "2"},
            },
        }
        with running_application() as base_url:
            status, _, result = request(
                base_url, "POST", "/api/integrations/kanboard/events", documented_webhook
            )
            self.assertEqual(422, status)
            self.assertEqual("actor identity is required for event provenance", result["error"])

    def test_api_rejects_commands_without_actor_context(self):
        with running_application() as base_url:
            status, _, result = request(
                base_url,
                "POST",
                "/api/process/apply",
                PROCESS,
                {"Idempotency-Key": "missing-actor"},
            )
            self.assertEqual(400, status)
            self.assertEqual("X-Actor is required for authored commands", result["error"])

    def test_retiring_board_unmaps_unfinished_tasks_and_only_user_can_restore_them(self):
        with running_application() as base_url:
            request(
                base_url,
                "POST",
                "/api/process/apply",
                PROCESS,
                {"Idempotency-Key": "apply", "X-Actor": "user:paul"},
            )
            _, _, task = request(
                base_url,
                "POST",
                "/api/tasks",
                {
                    "board_id": "delivery",
                    "column_id": "backlog",
                    "title": "Remain visible after board retirement",
                    "description": "Unfinished work becomes unmapped.",
                },
                {"Idempotency-Key": "task", "X-Actor": "user:paul"},
            )
            replacement = {
                "agents": PROCESS["agents"],
                "boards": [
                    {
                        "id": "support",
                        "name": "Support",
                        "columns": [
                            {"id": "support-backlog", "name": "Backlog", "agent_id": None}
                        ],
                    }
                ],
            }
            _, _, retired = request(
                base_url,
                "POST",
                "/api/process/apply",
                replacement,
                {"Idempotency-Key": "retire", "X-Actor": "user:paul"},
            )
            self.assertEqual(task["id"], retired["unmapped_tasks"][0]["id"])
            delivery = next(board for board in retired["retired_boards"] if board["id"] == "delivery")
            self.assertEqual([], delivery["tasks"])

            request(
                base_url,
                "POST",
                "/api/process/apply",
                PROCESS,
                {"Idempotency-Key": "restore", "X-Actor": "user:paul"},
            )
            without_backlog = json.loads(json.dumps(PROCESS))
            without_backlog["boards"][0]["columns"] = [
                without_backlog["boards"][0]["columns"][1]
            ]
            request(
                base_url,
                "POST",
                "/api/process/apply",
                without_backlog,
                {"Idempotency-Key": "remove-column", "X-Actor": "user:paul"},
            )
            status, _, result = request(
                base_url,
                "POST",
                f"/api/tasks/{task['id']}/move",
                {"column_id": "implementation", "expected_revision": 1},
                {"Idempotency-Key": "agent-remap", "X-Actor": "agent:implementer"},
            )
            self.assertEqual(403, status)
            self.assertEqual("only the user can remap an unmapped task", result["error"])

    def test_failed_activation_exposes_retry_and_dismiss_recovery(self):
        with running_application() as base_url:
            request(
                base_url,
                "POST",
                "/api/process/apply",
                PROCESS,
                {"Idempotency-Key": "apply", "X-Actor": "user:paul"},
            )
            _, _, task = request(
                base_url,
                "POST",
                "/api/tasks",
                {
                    "board_id": "delivery",
                    "column_id": "implementation",
                    "title": "Recover a failed activation",
                    "description": "The failure is simulated at the runtime adapter boundary.",
                },
                {"Idempotency-Key": "task", "X-Actor": "user:paul"},
            )
            activation_id = task["activations"][0]["id"]
            status, _, failed = request(
                base_url,
                "POST",
                f"/api/tasks/{task['id']}/activations/{activation_id}/fail",
                {"diagnostic": "controlled runtime failure"},
                {"Idempotency-Key": "fail", "X-Actor": "framework:runtime"},
            )
            self.assertEqual(200, status)
            reason_id = failed["attention_reasons"][0]["id"]

            with urllib.request.urlopen(base_url + f"/tasks/{task['id']}") as response:
                detail_html = response.read().decode("utf-8")
            self.assertIn(">Retry</button>", detail_html)
            self.assertIn(">Dismiss</button>", detail_html)

            status, _, retried = request(
                base_url,
                "POST",
                f"/api/tasks/{task['id']}/attention/{reason_id}/retry",
                {},
                {"Idempotency-Key": "retry", "X-Actor": "user:paul"},
            )
            self.assertEqual(200, status)
            self.assertEqual("queued", retried["activations"][0]["state"])
            self.assertEqual([], retried["attention_reasons"])

            _, _, failed_again = request(
                base_url,
                "POST",
                f"/api/tasks/{task['id']}/activations/{activation_id}/fail",
                {"diagnostic": "controlled repeat failure"},
                {"Idempotency-Key": "fail-again", "X-Actor": "framework:runtime"},
            )
            second_reason_id = failed_again["attention_reasons"][0]["id"]
            status, _, dismissed = request(
                base_url,
                "POST",
                f"/api/tasks/{task['id']}/attention/{second_reason_id}/dismiss",
                {},
                {"Idempotency-Key": "dismiss", "X-Actor": "user:paul"},
            )
            self.assertEqual(200, status)
            self.assertEqual("dismissed", dismissed["activations"][0]["state"])
            self.assertEqual([], dismissed["attention_reasons"])

    def test_deployment_probe_checks_required_local_boundaries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repository = root / "repository"
            workspaces = root / "workspaces"
            codex_home = root / "codex"
            repository.mkdir()
            workspaces.mkdir()
            codex_home.mkdir()
            (codex_home / "auth.json").write_text("{}", encoding="utf-8")

            previous = {
                name: os.environ.get(name)
                for name in (
                    "PROJECT_REPOSITORY_PATH",
                    "TASK_WORKSPACES_PATH",
                    "CODEX_HOME_PATH",
                    "PROJECT_CONTAINER_ENDPOINT",
                )
            }
            with reachable_project_container() as project_container_endpoint:
                os.environ.update(
                    {
                        "PROJECT_REPOSITORY_PATH": str(repository),
                        "TASK_WORKSPACES_PATH": str(workspaces),
                        "CODEX_HOME_PATH": str(codex_home),
                        "PROJECT_CONTAINER_ENDPOINT": project_container_endpoint,
                    }
                )
                try:
                    with running_application() as base_url:
                        status, _, result = request(
                            base_url, "GET", "/api/deployment-capabilities"
                        )
                finally:
                    for name, value in previous.items():
                        if value is None:
                            os.environ.pop(name, None)
                        else:
                            os.environ[name] = value

            self.assertEqual(200, status)
            self.assertTrue(result["project_repository"]["readable"])
            self.assertTrue(result["task_workspaces"]["writable"])
            self.assertTrue(result["codex_authentication"]["available"])
            self.assertTrue(result["project_containers"]["reachable"])


if __name__ == "__main__":
    unittest.main()
