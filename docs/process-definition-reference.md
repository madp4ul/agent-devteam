# Process-definition reference

A process definition is a UTF-8 YAML file validated against
[`schemas/process-definition.schema.json`](../schemas/process-definition.schema.json).
It contains workflow configuration only; live tasks and coordination history
remain in the application's relational store.

## Editor setup

Add this modeline as the first line of a definition whose location is two
directories below the repository root, as in the supplied example:

```yaml
# yaml-language-server: $schema=../../schemas/process-definition.schema.json
```

Adjust the relative path when the definition lives elsewhere. Editors with YAML
language-server support then provide completion and structural validation from
the JSON Schema.

## Root fields

| Field | Type | Meaning |
| --- | --- | --- |
| `schemaVersion` | integer | Required schema version. Ticket 15 supports only `1`. |
| `name` | non-empty string | Process display name. |
| `defaultTaskWorkspaceStartingRef` | non-empty string | Git ref future task workspaces resolve immediately before provisioning. Ticket 15 records this value but does not provision workspaces. |
| `coordinationGuidance` | non-empty string | Process-wide guidance supplied to future agent activations. |
| `agents` | array | Agent directory. May be empty when every workflow column is unwatched. |
| `boards` | non-empty array | Ordered boards shown by the application. |

Unknown fields are rejected so misspellings cannot silently change behavior.

## Agents

Each agent has these required fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable process entity ID. It must be unique across agents. |
| `name` | Editable display name. |
| `role` | Focused responsibility in the process. |
| `summary` | Short directory description that helps collaborators choose whom to involve. |
| `instructions` | Path to a readable UTF-8 Markdown file, resolved relative to the YAML file. |

Instruction content participates in the semantic process-definition fingerprint.
Keep long-form instructions in the referenced Markdown file rather than embedding
them in YAML.

## Boards and columns

A board requires `id`, `name`, `guidance`, and a non-empty ordered `columns`
array. A workflow column requires `id` and `name`; `watchingAgent` is optional.
When present, `watchingAgent` must name a declared agent ID. Omitting it creates
an ordinary unwatched waiting state.

Board IDs are unique within the process. Column IDs are unique within their
board. IDs use lowercase letters and digits separated by single hyphens, begin
with a letter, and remain stable across display-name and ordering changes.
Changing an ID changes identity; renaming does not.

Do not declare a `completion` column. The framework always appends exactly one
column with ID `completion` and name `Completion` to every board. It is always
last, framework-owned, and unwatched.

## Validation and startup behavior

Run explicit validation with:

```sh
pnpm exec node --experimental-strip-types src/cli.ts validate path/to/process.yaml
```

Diagnostics report the source file, line, column, invalid value, violated rule,
consequence, and a safe correction when one is known. Startup performs the same
validation. An invalid definition produces configuration-error mode: prior
boards are not exposed, automation cannot resume, and board mutation is rejected.
The application never falls back to a previously valid definition.

A valid startup applies the definition transactionally and visibly starts with
automation paused. An explicit Resume action changes the current automation
gate. Every later application startup begins paused again. Ticket 15 does not
dispatch attempts; the gate is the shared contract later runtime adapters must
honor.

The semantic process-definition version is a SHA-256 fingerprint of validated
effective YAML content plus referenced instruction content. YAML comments,
formatting, mapping-key order, and equivalent path spellings that resolve to the
same instruction file do not change it. Ordered board and column arrays,
effective field values, and instruction content do.

The definition is loaded only at startup. File watching and hot reload are not
part of the first version.
