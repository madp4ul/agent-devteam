import json
import re
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

MENTION = re.compile(r"(?<![\w@])@([A-Za-z0-9_-]+)")


class DomainError(Exception):
    def __init__(self, status, message, details=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details or {}


class CoordinationStore:
    """Authoritative spike store exposed only through application commands/queries."""

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self.lock = threading.RLock()
        self._migrate()

    def close(self):
        with self.lock:
            self.connection.close()

    def _migrate(self):
        with self.connection:
            self.connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS agents (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS boards (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS columns (
                    id TEXT PRIMARY KEY,
                    board_id TEXT NOT NULL REFERENCES boards(id),
                    name TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    agent_id TEXT REFERENCES agents(id),
                    framework_owned INTEGER NOT NULL DEFAULT 0,
                    active INTEGER NOT NULL DEFAULT 1
                );
                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    board_id TEXT NOT NULL REFERENCES boards(id),
                    column_id TEXT NOT NULL REFERENCES columns(id),
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    run_state TEXT NOT NULL DEFAULT 'idle',
                    archived INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS comments (
                    id TEXT PRIMARY KEY,
                    task_id INTEGER NOT NULL REFERENCES tasks(id),
                    body TEXT NOT NULL,
                    author_kind TEXT NOT NULL,
                    author_id TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS relationships (
                    id TEXT PRIMARY KEY,
                    task_id INTEGER NOT NULL REFERENCES tasks(id),
                    target_task_id INTEGER NOT NULL REFERENCES tasks(id),
                    type TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS activity (
                    id TEXT PRIMARY KEY,
                    task_id INTEGER REFERENCES tasks(id),
                    type TEXT NOT NULL,
                    author_kind TEXT NOT NULL,
                    author_id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS activations (
                    id TEXT PRIMARY KEY,
                    task_id INTEGER NOT NULL REFERENCES tasks(id),
                    agent_id TEXT NOT NULL REFERENCES agents(id),
                    reason TEXT NOT NULL,
                    source_event_id TEXT NOT NULL REFERENCES activity(id),
                    state TEXT NOT NULL DEFAULT 'queued',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS attention_reasons (
                    id TEXT PRIMARY KEY,
                    task_id INTEGER NOT NULL REFERENCES tasks(id),
                    type TEXT NOT NULL,
                    source_event_id TEXT NOT NULL REFERENCES activity(id),
                    activation_id TEXT REFERENCES activations(id),
                    resolved INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS idempotency (
                    key TEXT PRIMARY KEY,
                    operation TEXT NOT NULL,
                    response TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
            attention_columns = {
                row["name"]
                for row in self.connection.execute("PRAGMA table_info(attention_reasons)")
            }
            if "activation_id" not in attention_columns:
                self.connection.execute(
                    "ALTER TABLE attention_reasons ADD COLUMN activation_id TEXT REFERENCES activations(id)"
                )

    @contextmanager
    def _transaction(self):
        with self.lock:
            self.connection.execute("BEGIN IMMEDIATE")
            try:
                yield self.connection
            except Exception:
                self.connection.rollback()
                raise
            else:
                self.connection.commit()

    def _command(self, operation, idempotency_key, action):
        if not idempotency_key:
            raise DomainError(400, "Idempotency-Key is required")
        with self._transaction() as connection:
            prior = connection.execute(
                "SELECT operation, response FROM idempotency WHERE key = ?",
                (idempotency_key,),
            ).fetchone()
            if prior:
                if prior["operation"] != operation:
                    raise DomainError(409, "idempotency key was used for another operation")
                return json.loads(prior["response"])
            response = action(connection)
            connection.execute(
                "INSERT INTO idempotency(key, operation, response, created_at) VALUES (?, ?, ?, ?)",
                (idempotency_key, operation, json.dumps(response), self._now()),
            )
            return response

    @staticmethod
    def _now():
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _event(connection, task_id, event_type, actor, payload):
        event_id = str(uuid.uuid4())
        connection.execute(
            """INSERT INTO activity
               (id, task_id, type, author_kind, author_id, payload, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                event_id,
                task_id,
                event_type,
                actor.kind,
                actor.identifier,
                json.dumps(payload),
                CoordinationStore._now(),
            ),
        )
        return event_id

    @staticmethod
    def _activation(connection, task_id, agent_id, reason, source_event_id):
        connection.execute(
            """INSERT INTO activations
               (id, task_id, agent_id, reason, source_event_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), task_id, agent_id, reason, source_event_id, CoordinationStore._now()),
        )

    def apply_process(self, definition, actor, idempotency_key):
        def apply(connection):
            boards = definition.get("boards", [])
            agents = definition.get("agents", [])
            if not boards:
                raise DomainError(400, "at least one board is required")

            connection.execute("UPDATE agents SET active = 0")
            connection.execute("UPDATE boards SET active = 0")
            connection.execute("UPDATE columns SET active = 0")

            for agent in agents:
                connection.execute(
                    """INSERT INTO agents(id, name, active) VALUES (?, ?, 1)
                       ON CONFLICT(id) DO UPDATE SET name = excluded.name, active = 1""",
                    (agent["id"], agent["name"]),
                )

            for board_position, board in enumerate(boards):
                connection.execute(
                    """INSERT INTO boards(id, name, position, active) VALUES (?, ?, ?, 1)
                       ON CONFLICT(id) DO UPDATE SET
                           name = excluded.name, position = excluded.position, active = 1""",
                    (board["id"], board["name"], board_position),
                )
                for column_position, column in enumerate(board.get("columns", [])):
                    existing_column = connection.execute(
                        "SELECT board_id FROM columns WHERE id = ?", (column["id"],)
                    ).fetchone()
                    if existing_column and existing_column["board_id"] != board["id"]:
                        raise DomainError(
                            400,
                            f"column identity {column['id']} already belongs to board "
                            f"{existing_column['board_id']}",
                        )
                    if column.get("agent_id") and not connection.execute(
                        "SELECT 1 FROM agents WHERE id = ? AND active = 1",
                        (column["agent_id"],),
                    ).fetchone():
                        raise DomainError(400, f"unknown agent: {column['agent_id']}")
                    connection.execute(
                        """INSERT INTO columns
                           (id, board_id, name, position, agent_id, framework_owned, active)
                           VALUES (?, ?, ?, ?, ?, 0, 1)
                           ON CONFLICT(id) DO UPDATE SET
                               board_id = excluded.board_id,
                               name = excluded.name,
                               position = excluded.position,
                               agent_id = excluded.agent_id,
                               framework_owned = 0,
                               active = 1""",
                        (
                            column["id"],
                            board["id"],
                            column["name"],
                            column_position,
                            column.get("agent_id"),
                        ),
                    )
                completion_id = f"completion:{board['id']}"
                connection.execute(
                    """INSERT INTO columns
                       (id, board_id, name, position, agent_id, framework_owned, active)
                       VALUES (?, ?, 'Completion', ?, NULL, 1, 1)
                       ON CONFLICT(id) DO UPDATE SET
                           board_id = excluded.board_id,
                           name = 'Completion',
                           position = excluded.position,
                           agent_id = NULL,
                           framework_owned = 1,
                           active = 1""",
                    (completion_id, board["id"], len(board.get("columns", []))),
                )

            self._event(
                connection,
                None,
                "process.applied",
                actor,
                {
                    "board_ids": [board["id"] for board in boards],
                    "agent_ids": [agent["id"] for agent in agents],
                },
            )
            return self._boards(connection)

        return self._command("apply_process", idempotency_key, apply)

    def create_task(self, values, actor, idempotency_key):
        def create(connection):
            column = connection.execute(
                "SELECT board_id, agent_id FROM columns WHERE id = ? AND active = 1",
                (values["column_id"],),
            ).fetchone()
            if not column or column["board_id"] != values["board_id"]:
                raise DomainError(400, "column is not active on the requested board")
            cursor = connection.execute(
                """INSERT INTO tasks(board_id, column_id, title, description)
                   VALUES (?, ?, ?, ?)""",
                (
                    values["board_id"],
                    values["column_id"],
                    values["title"],
                    values.get("description", ""),
                ),
            )
            task_id = cursor.lastrowid
            event_id = self._event(
                connection,
                task_id,
                "task.created",
                actor,
                {"column_id": values["column_id"], "revision": 1},
            )
            if column["agent_id"]:
                self._activation(connection, task_id, column["agent_id"], "column_entry", event_id)
            return self._task(connection, task_id)

        return self._command("create_task", idempotency_key, create)

    def move_task(self, task_id, column_id, expected_revision, actor, idempotency_key):
        def move(connection):
            task = connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            if not task:
                raise DomainError(404, "task not found")
            source_column = connection.execute(
                "SELECT active FROM columns WHERE id = ?", (task["column_id"],)
            ).fetchone()
            if source_column and not source_column["active"] and actor.kind != "user":
                raise DomainError(403, "only the user can remap an unmapped task")
            if task["revision"] != expected_revision:
                raise DomainError(
                    409,
                    "task revision conflict",
                    {"current": self._task(connection, task_id)},
                )
            column = connection.execute(
                "SELECT * FROM columns WHERE id = ? AND board_id = ? AND active = 1",
                (column_id, task["board_id"]),
            ).fetchone()
            if not column:
                raise DomainError(400, "destination column is not active on this board")
            revision = expected_revision + 1
            connection.execute(
                "UPDATE tasks SET column_id = ?, revision = ? WHERE id = ?",
                (column_id, revision, task_id),
            )
            event_id = self._event(
                connection,
                task_id,
                "task.moved",
                actor,
                {
                    "from_column_id": task["column_id"],
                    "to_column_id": column_id,
                    "revision": revision,
                },
            )
            if column["agent_id"]:
                self._activation(connection, task_id, column["agent_id"], "column_entry", event_id)
            return self._task(connection, task_id)

        return self._command(f"move_task:{task_id}", idempotency_key, move)

    def add_comment(self, task_id, body, actor, idempotency_key):
        def add(connection):
            if not connection.execute("SELECT 1 FROM tasks WHERE id = ?", (task_id,)).fetchone():
                raise DomainError(404, "task not found")
            comment_id = str(uuid.uuid4())
            created_at = self._now()
            connection.execute(
                """INSERT INTO comments
                   (id, task_id, body, author_kind, author_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (comment_id, task_id, body, actor.kind, actor.identifier, created_at),
            )
            event_id = self._event(
                connection,
                task_id,
                "comment.created",
                actor,
                {"comment_id": comment_id},
            )
            seen = set()
            for mention in MENTION.findall(body):
                normalized = mention.lower()
                if normalized in seen:
                    continue
                seen.add(normalized)
                if normalized == "user":
                    connection.execute(
                        """INSERT INTO attention_reasons
                           (id, task_id, type, source_event_id, created_at)
                           VALUES (?, ?, 'user_mention', ?, ?)""",
                        (str(uuid.uuid4()), task_id, event_id, created_at),
                    )
                elif connection.execute(
                    "SELECT 1 FROM agents WHERE lower(id) = ? AND active = 1", (normalized,)
                ).fetchone():
                    self._activation(connection, task_id, normalized, "agent_mention", event_id)
            return self._task(connection, task_id)

        return self._command(f"add_comment:{task_id}", idempotency_key, add)

    def add_relationship(self, task_id, relationship_type, target_task_id, actor, idempotency_key):
        def add(connection):
            if task_id == target_task_id:
                raise DomainError(400, "a task cannot relate to itself")
            task_ids = {
                row["id"]
                for row in connection.execute(
                    "SELECT id FROM tasks WHERE id IN (?, ?)", (task_id, target_task_id)
                )
            }
            if task_id not in task_ids or target_task_id not in task_ids:
                raise DomainError(404, "task not found")
            relationship_id = str(uuid.uuid4())
            connection.execute(
                """INSERT INTO relationships(id, task_id, target_task_id, type, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (relationship_id, task_id, target_task_id, relationship_type, self._now()),
            )
            self._event(
                connection,
                task_id,
                "relationship.created",
                actor,
                {
                    "relationship_id": relationship_id,
                    "type": relationship_type,
                    "target_task_id": target_task_id,
                },
            )
            return self._task(connection, task_id)

        return self._command(f"add_relationship:{task_id}", idempotency_key, add)

    def resolve_attention(self, task_id, reason_id, actor, idempotency_key):
        def resolve(connection):
            changed = connection.execute(
                """UPDATE attention_reasons SET resolved = 1
                   WHERE id = ? AND task_id = ? AND resolved = 0""",
                (reason_id, task_id),
            ).rowcount
            if not changed:
                raise DomainError(404, "unresolved attention reason not found")
            self._event(
                connection,
                task_id,
                "attention.resolved",
                actor,
                {"attention_reason_id": reason_id},
            )
            return self._task(connection, task_id)

        return self._command(f"resolve_attention:{task_id}", idempotency_key, resolve)

    def fail_activation(self, task_id, activation_id, diagnostic, actor, idempotency_key):
        def fail(connection):
            activation = connection.execute(
                "SELECT state FROM activations WHERE id = ? AND task_id = ?",
                (activation_id, task_id),
            ).fetchone()
            if not activation:
                raise DomainError(404, "activation not found")
            if activation["state"] not in {"queued", "running"}:
                raise DomainError(409, "activation is not fail-able in its current state")
            connection.execute(
                "UPDATE activations SET state = 'awaiting_recovery' WHERE id = ?",
                (activation_id,),
            )
            connection.execute(
                "UPDATE tasks SET run_state = 'failed' WHERE id = ?", (task_id,)
            )
            event_id = self._event(
                connection,
                task_id,
                "activation.failed",
                actor,
                {"activation_id": activation_id, "diagnostic": diagnostic},
            )
            reason_id = str(uuid.uuid4())
            connection.execute(
                """INSERT INTO attention_reasons
                   (id, task_id, type, source_event_id, activation_id, created_at)
                   VALUES (?, ?, 'activation_failure', ?, ?, ?)""",
                (reason_id, task_id, event_id, activation_id, self._now()),
            )
            return self._task(connection, task_id)

        return self._command(f"fail_activation:{activation_id}", idempotency_key, fail)

    def recover_activation(self, task_id, reason_id, decision, actor, idempotency_key):
        def recover(connection):
            reason = connection.execute(
                """SELECT activation_id FROM attention_reasons
                   WHERE id = ? AND task_id = ? AND type = 'activation_failure'
                     AND resolved = 0""",
                (reason_id, task_id),
            ).fetchone()
            if not reason:
                raise DomainError(404, "activation failure attention reason not found")
            if decision not in {"retry", "dismiss"}:
                raise DomainError(400, "recovery decision must be retry or dismiss")
            recovery_outcomes = {
                "retry": ("queued", "queued", "activation.retry_requested"),
                "dismiss": ("dismissed", "idle", "activation.dismissed"),
            }
            activation_state, task_state, event_type = recovery_outcomes[decision]
            connection.execute(
                "UPDATE activations SET state = ? WHERE id = ?",
                (activation_state, reason["activation_id"]),
            )
            connection.execute(
                "UPDATE attention_reasons SET resolved = 1 WHERE id = ?", (reason_id,)
            )
            connection.execute(
                "UPDATE tasks SET run_state = ? WHERE id = ?", (task_state, task_id)
            )
            self._event(
                connection,
                task_id,
                event_type,
                actor,
                {"activation_id": reason["activation_id"], "attention_reason_id": reason_id},
            )
            return self._task(connection, task_id)

        return self._command(
            f"recover_activation:{reason_id}:{decision}", idempotency_key, recover
        )

    def boards(self):
        with self.lock:
            return self._boards(self.connection)

    def task(self, task_id):
        with self.lock:
            task = self._task(self.connection, task_id)
            if not task:
                raise DomainError(404, "task not found")
            return task

    def _boards(self, connection):
        boards = []
        for board in connection.execute(
            "SELECT id, name FROM boards WHERE active = 1 ORDER BY position, id"
        ):
            columns = []
            for column in connection.execute(
                """SELECT c.id, c.name, c.position, c.agent_id, c.framework_owned,
                          a.name AS agent_name
                   FROM columns c LEFT JOIN agents a ON a.id = c.agent_id
                   WHERE c.board_id = ? AND c.active = 1
                   ORDER BY c.position, c.id""",
                (board["id"],),
            ):
                tasks = [
                    dict(row)
                    for row in connection.execute(
                        """SELECT id, title, revision, run_state FROM tasks
                           WHERE board_id = ? AND column_id = ? AND archived = 0
                           ORDER BY id""",
                        (board["id"], column["id"]),
                    )
                ]
                columns.append({**dict(column), "tasks": tasks})
            boards.append({**dict(board), "columns": columns})
        unmapped_tasks = [
            dict(task)
            for task in connection.execute(
                """SELECT t.id, t.title, t.board_id, t.column_id, c.name AS former_column_name
                   FROM tasks t
                   JOIN boards b ON b.id = t.board_id
                   JOIN columns c ON c.id = t.column_id
                   WHERE t.archived = 0
                     AND ((b.active = 1 AND c.active = 0)
                          OR (b.active = 0 AND c.framework_owned = 0))
                   ORDER BY t.id"""
            )
        ]
        retired_boards = []
        for board in connection.execute(
            "SELECT id, name FROM boards WHERE active = 0 ORDER BY position, id"
        ):
            tasks = [
                dict(task)
                for task in connection.execute(
                    """SELECT t.id, t.title, t.column_id, t.revision, t.run_state
                       FROM tasks t
                       JOIN columns c ON c.id = t.column_id
                       WHERE t.board_id = ? AND t.archived = 0 AND c.framework_owned = 1
                       ORDER BY t.id""",
                    (board["id"],),
                )
            ]
            retired_boards.append({**dict(board), "tasks": tasks})
        return {
            "boards": boards,
            "unmapped_tasks": unmapped_tasks,
            "retired_boards": retired_boards,
        }

    def _task(self, connection, task_id):
        row = connection.execute(
            """SELECT t.*, c.name AS column_name, b.name AS board_name
               FROM tasks t
               JOIN columns c ON c.id = t.column_id
               JOIN boards b ON b.id = t.board_id
               WHERE t.id = ?""",
            (task_id,),
        ).fetchone()
        if not row:
            return None
        task = dict(row)
        task["timeline"] = [
            {**dict(event), "payload": json.loads(event["payload"])}
            for event in connection.execute(
                """SELECT id, type, author_kind, author_id, payload, created_at
                   FROM activity WHERE task_id = ? ORDER BY created_at, rowid""",
                (task_id,),
            )
        ]
        task["comments"] = [
            dict(comment)
            for comment in connection.execute(
                """SELECT id, body, author_kind, author_id, created_at
                   FROM comments WHERE task_id = ? ORDER BY created_at, rowid""",
                (task_id,),
            )
        ]
        task["relationships"] = [
            dict(relationship)
            for relationship in connection.execute(
                """SELECT id, type, target_task_id, created_at
                   FROM relationships WHERE task_id = ? ORDER BY created_at, rowid""",
                (task_id,),
            )
        ]
        task["activations"] = [
            dict(activation)
            for activation in connection.execute(
                """SELECT id, agent_id, reason, source_event_id, state, created_at
                   FROM activations WHERE task_id = ? ORDER BY created_at, rowid""",
                (task_id,),
            )
        ]
        task["attention_reasons"] = [
            dict(reason)
            for reason in connection.execute(
                """SELECT id, type, source_event_id, activation_id, created_at
                   FROM attention_reasons
                   WHERE task_id = ? AND resolved = 0 ORDER BY created_at, rowid""",
                (task_id,),
            )
        ]
        task["available_columns"] = [
            dict(column)
            for column in connection.execute(
                """SELECT id, name FROM columns
                   WHERE board_id = ? AND active = 1 ORDER BY position, id""",
                (task["board_id"],),
            )
        ]
        return task
