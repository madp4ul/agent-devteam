import json
import urllib.parse
from http.server import BaseHTTPRequestHandler

from coordination.deployment import deployment_capabilities
from coordination.domain import Actor
from coordination.store import DomainError
from coordination.views import board_page, task_page


def create_handler(store):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            return

        def _json(self, status, payload):
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _html(self, status, markup):
            body = markup.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _body(self):
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            if self.headers.get("Content-Type", "").startswith("application/json"):
                return json.loads(raw.decode("utf-8")) if raw else {}
            parsed = urllib.parse.parse_qs(raw.decode("utf-8"))
            return {key: values[-1] for key, values in parsed.items()}

        def _api_actor(self):
            value = self.headers.get("X-Actor")
            if value is None:
                raise DomainError(400, "X-Actor is required for authored commands")
            try:
                return Actor.parse(value)
            except ValueError as error:
                raise DomainError(400, str(error)) from error

        @staticmethod
        def _ui_actor():
            return Actor("user", "local-ui")

        def _key(self, fallback=None):
            return self.headers.get("Idempotency-Key", fallback)

        def do_GET(self):
            try:
                path = urllib.parse.urlparse(self.path).path
                if path == "/":
                    self._html(200, board_page(store.boards()))
                elif path == "/api/boards":
                    self._json(200, store.boards())
                elif path == "/api/deployment-capabilities":
                    self._json(200, deployment_capabilities())
                elif path.startswith("/api/tasks/"):
                    self._json(200, store.task(int(path.rsplit("/", 1)[1])))
                elif path.startswith("/tasks/"):
                    self._html(200, task_page(store.task(int(path.rsplit("/", 1)[1]))))
                elif path == "/health":
                    self._json(200, {"status": "ok"})
                else:
                    raise DomainError(404, "not found")
            except (ValueError, DomainError) as error:
                if isinstance(error, DomainError):
                    self._json(error.status, {"error": error.message, **error.details})
                else:
                    self._json(400, {"error": "invalid identifier"})

        def do_POST(self):
            try:
                path = urllib.parse.urlparse(self.path).path
                body = self._body()
                if path == "/api/process/apply":
                    self._json(
                        200, store.apply_process(body, self._api_actor(), self._key())
                    )
                    return
                if path == "/api/tasks":
                    self._json(
                        201, store.create_task(body, self._api_actor(), self._key())
                    )
                    return
                if path == "/api/integrations/kanboard/events":
                    if not body.get("actor"):
                        raise DomainError(422, "actor identity is required for event provenance")
                    raise DomainError(
                        409,
                        "Kanboard-originated writes cannot join the authoritative coordination transaction",
                    )

                parts = [part for part in path.split("/") if part]
                is_api = path.startswith("/api/")
                if is_api and len(parts) >= 3 and parts[:2] == ["api", "tasks"]:
                    task_id = int(parts[2])
                    action_index = 3
                elif not is_api and len(parts) >= 2 and parts[0] == "tasks":
                    task_id = int(parts[1])
                    action_index = 2
                else:
                    raise DomainError(404, "not found")
                action = parts[action_index] if len(parts) > action_index else ""
                actor = self._api_actor() if is_api else self._ui_actor()
                fallback_key = (
                    f"form:{action}:{task_id}:{body.get('expected_revision', '')}:"
                    f"{body.get('column_id', '')}:{'/'.join(parts[action_index + 1:])}"
                )

                if action == "move":
                    result = store.move_task(
                        task_id,
                        body["column_id"],
                        int(body["expected_revision"]),
                        actor,
                        self._key(fallback_key),
                    )
                elif action == "comments" and is_api:
                    result = store.add_comment(task_id, body["body"], actor, self._key())
                elif action == "relationships" and is_api:
                    result = store.add_relationship(
                        task_id,
                        body["type"],
                        int(body["target_task_id"]),
                        actor,
                        self._key(),
                    )
                elif action == "activations" and is_api and len(parts) == 6 and parts[5] == "fail":
                    result = store.fail_activation(
                        task_id, parts[4], body.get("diagnostic", ""), actor, self._key()
                    )
                elif action == "attention" and len(parts) == action_index + 3:
                    reason_id = parts[action_index + 1]
                    decision = parts[action_index + 2]
                    if decision == "resolve":
                        result = store.resolve_attention(
                            task_id, reason_id, actor, self._key(fallback_key)
                        )
                    else:
                        result = store.recover_activation(
                            task_id,
                            reason_id,
                            decision,
                            actor,
                            self._key(fallback_key),
                        )
                else:
                    raise DomainError(404, "not found")

                if is_api:
                    self._json(200, result)
                else:
                    self.send_response(303)
                    self.send_header("Location", f"/tasks/{task_id}")
                    self.end_headers()
            except (KeyError, ValueError, json.JSONDecodeError) as error:
                self._json(400, {"error": f"invalid request: {error}"})
            except DomainError as error:
                self._json(error.status, {"error": error.message, **error.details})

    return Handler
