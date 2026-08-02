import os
from http.server import ThreadingHTTPServer
from pathlib import Path

from coordination.domain import Actor
from coordination.http import create_handler
from coordination.store import CoordinationStore


DEMO_PROCESS = {
    "agents": [{"id": "implementer", "name": "Implementation Agent"}],
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
                {"id": "user-review", "name": "User Review", "agent_id": None},
            ],
        }
    ],
}


def main():
    database = Path(os.environ.get("COORDINATION_DATABASE", "/coordination/data/coordination.sqlite3"))
    store = CoordinationStore(database)
    if not store.boards()["boards"]:
        store.apply_process(
            DEMO_PROCESS, Actor("framework", "startup-seed"), "demo-process-v1"
        )
        store.create_task(
            {
                "board_id": "delivery",
                "column_id": "backlog",
                "title": "Inspect the board-foundation spike",
                "description": "Use the task page's Move task form to exercise the accessible path.",
            },
            Actor("framework", "startup-seed"),
            "demo-task-v1",
        )
    server = ThreadingHTTPServer(("0.0.0.0", 8080), create_handler(store))
    try:
        server.serve_forever()
    finally:
        store.close()


if __name__ == "__main__":
    main()
