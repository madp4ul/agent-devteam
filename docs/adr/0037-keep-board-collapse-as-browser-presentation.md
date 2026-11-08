# Keep board collapse as browser presentation

Status: accepted

The user uses Row layout and wants compact boards that retain current work.
Remove Column layout and its selector. Ignore the old layout preference;
there is one supported presentation rather than a migration of workflow state.

Each board defaults to collapsed and remembers expansion by board ID in this
browser's local storage. This preference never changes the process or task
state. Storage failure leaves the current in-memory choice usable.

Collapsed boards retain an entire column when any task is active, waiting on a
relationship, needs attention, has queued/failed activations or a startup
failure, or belongs to an unwatched workflow column. The framework Completion
column is exempt from the unwatched rule; activity or other signals can still
retain it. Empty columns disappear, but the board header always remains.

Explicit text search and archived-task exploration show all columns while
applying their existing task filters. They do not overwrite the remembered
expansion choice. This keeps quiet and completed tasks discoverable. Expanding
a board exposes all creation and drag destinations; task detail continues to
offer every legal movement destination independently of board visibility.

## Consequences

- Visibility is a browser presentation of the complete authoritative board
  projection, not another scheduler or source of task facts.
- Shared polling continues at five seconds while idle, with the existing
  one-second active/draining cadence, so changes in either direction appear.
- Existing horizontal row positions and board navigation context remain owned
  by the board page and survive expansion changes where their row is present.
- The shared decorative SVG disclosure stays visually secondary and has an
  accessible button label and expansion state in both themes.
