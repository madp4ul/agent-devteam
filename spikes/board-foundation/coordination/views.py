import html


def _escape(value):
    return html.escape(str(value), quote=True)


def _layout(title, body):
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{_escape(title)}</title>
  <style>
    :root {{ color-scheme: light; font: 16px/1.45 system-ui, sans-serif; }}
    body {{ margin: 0; background: #f4f5f7; color: #172b4d; }}
    header {{ background: #172b4d; color: white; padding: 1rem 1.5rem; }}
    main {{ padding: 1.5rem; }}
    .board {{ display: grid; grid-auto-flow: column; grid-auto-columns: minmax(17rem, 1fr); gap: 1rem; overflow-x: auto; align-items: start; }}
    .column, .panel {{ background: white; border: 1px solid #dfe1e6; border-radius: .5rem; padding: 1rem; }}
    .column h2 {{ margin-top: 0; font-size: 1rem; }}
    .watcher {{ color: #5e6c84; font-size: .85rem; }}
    .card {{ display: block; margin: .75rem 0; padding: .75rem; color: inherit; text-decoration: none; background: #fafbfc; border: 1px solid #dfe1e6; border-radius: .35rem; }}
    .card:focus, button:focus, select:focus, a:focus {{ outline: 3px solid #4c9aff; outline-offset: 2px; }}
    .badge {{ display: inline-block; padding: .1rem .45rem; border-radius: 999px; background: #deebff; font-size: .8rem; }}
    .attention {{ border-left: .35rem solid #ff991f; }}
    .spike-notice {{ background: #fff7d6; border-bottom: 1px solid #e2b203; color: #533f04; padding: .75rem 1.5rem; }}
    .stack > * + * {{ margin-top: 1rem; }}
    .timeline {{ padding-left: 1.25rem; }}
    form.inline {{ display: inline; }}
    label {{ font-weight: 600; }}
    select, button, textarea {{ font: inherit; padding: .45rem; }}
  </style>
</head>
<body><header><strong>Coordination board foundation</strong></header>
<aside class="spike-notice" role="note"><strong>Feasibility spike.</strong>
Drag-and-drop is intentionally not implemented. Use the accessible Move task action.</aside>
<main>{body}</main></body>
</html>"""


def board_page(projection):
    if not projection["boards"]:
        return _layout(
            "Board",
            f'<div class="stack"><h1>No active process board</h1>'
            f'{_unmapped_tasks(projection)}{_retired_boards(projection)}</div>',
        )
    board = projection["boards"][0]
    columns = []
    for column in board["columns"]:
        watcher = (
            f'<div class="watcher">Watched by {_escape(column["agent_name"])}</div>'
            if column["agent_name"]
            else '<div class="watcher">Unwatched</div>'
        )
        cards = "".join(
            f'<a class="card" href="/tasks/{task["id"]}">'
            f'<strong>#{task["id"]} {_escape(task["title"])}</strong><br>'
            f'<span class="badge">{_escape(task["run_state"])}</span></a>'
            for task in column["tasks"]
        ) or "<p>No tasks</p>"
        columns.append(
            f'<section class="column" aria-labelledby="column-{_escape(column["id"])}">'
            f'<h2 id="column-{_escape(column["id"])}">{_escape(column["name"])}</h2>'
            f"{watcher}{cards}</section>"
        )
    unmapped = _unmapped_tasks(projection)
    retired = _retired_boards(projection)
    return _layout(
        board["name"],
        f'<div class="stack"><h1>{_escape(board["name"])}</h1>{unmapped}'
        f'<div class="board">{"".join(columns)}</div>{retired}</div>',
    )


def _unmapped_tasks(projection):
    if not projection.get("unmapped_tasks"):
        return ""
    items = "".join(
        f'<li><a href="/tasks/{task["id"]}">#{task["id"]} {_escape(task["title"])}</a> '
        f'(former column: {_escape(task["former_column_name"])})</li>'
        for task in projection["unmapped_tasks"]
    )
    return f'<section class="panel attention"><h2>Unmapped tasks</h2><ul>{items}</ul></section>'


def _retired_boards(projection):
    retired = projection.get("retired_boards", [])
    if not retired:
        return "<p>No active process board.</p>" if not projection.get("boards") else ""
    sections = []
    for board in retired:
        tasks = "".join(
            f'<li><a href="/tasks/{task["id"]}">#{task["id"]} {_escape(task["title"])}</a></li>'
            for task in board["tasks"]
        ) or "<li>No completed tasks</li>"
        sections.append(
            f'<section class="panel"><h2>Retired board: {_escape(board["name"])}</h2>'
            f'<ul>{tasks}</ul></section>'
        )
    return "".join(sections)


def _attention_controls(task_id, reason):
    if reason["type"] == "activation_failure":
        return " ".join(
            f'<form class="inline" method="post" action="/tasks/{task_id}/attention/{_escape(reason["id"])}/{decision}">'
            f'<button type="submit">{label}</button></form>'
            for decision, label in (("retry", "Retry"), ("dismiss", "Dismiss"))
        )
    return (
        f'<form class="inline" method="post" action="/tasks/{task_id}/attention/{_escape(reason["id"])}/resolve">'
        '<button type="submit">Resolve</button></form>'
    )


def task_page(task):
    options = "".join(
        f'<option value="{_escape(column["id"])}"'
        f'{" selected" if column["id"] == task["column_id"] else ""}>'
        f'{_escape(column["name"])}</option>'
        for column in task["available_columns"]
    )
    attention = "".join(
        f'<div class="panel attention"><strong>Needs attention:</strong> {_escape(reason["type"])} '
        f'{_attention_controls(task["id"], reason)}</div>'
        for reason in task["attention_reasons"]
    )
    activation_state = task["activations"][-1]["state"] if task["activations"] else task["run_state"]
    comments = "".join(
        f'<li><strong>{_escape(comment["author_kind"])}:{_escape(comment["author_id"])}</strong>: '
        f'{_escape(comment["body"])}</li>'
        for comment in task["comments"]
    ) or "<li>No comments</li>"
    events = "".join(
        f'<li><code>{_escape(event["type"])}</code> by '
        f'{_escape(event["author_kind"])}:{_escape(event["author_id"])}</li>'
        for event in task["timeline"]
    )
    return _layout(
        task["title"],
        f"""<div class="stack">
<p><a href="/">← Back to board</a></p>
<h1>#{task['id']} {_escape(task['title'])}</h1>
{attention}
<section class="panel"><strong>Board:</strong> {_escape(task['board_name'])}<br>
<strong>Column:</strong> {_escape(task['column_name'])}<br>
<strong>Run state:</strong> <span class="badge">{_escape(activation_state)}</span></section>
<section class="panel"><h2>Description</h2><p>{_escape(task['description'])}</p></section>
<section class="panel"><h2>Move task</h2>
<form method="post" action="/tasks/{task['id']}/move">
<input type="hidden" name="expected_revision" value="{task['revision']}">
<label for="destination">Destination</label>
<select id="destination" name="column_id" aria-label="Move task to column">{options}</select>
<button type="submit">Move task</button>
</form></section>
<section class="panel"><h2>Comments</h2><ul>{comments}</ul></section>
<section class="panel"><h2>Activity</h2><ol class="timeline">{events}</ol></section>
</div>""",
    )
