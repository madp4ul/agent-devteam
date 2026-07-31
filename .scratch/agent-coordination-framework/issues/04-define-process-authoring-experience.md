# Define the Process Authoring Experience

Type: wayfinder:prototype
Status: resolved
Blocked by: 01
Parent: ../map.md

## Question

What should a user edit or operate to define version-controlled boards,
columns, agents, roles, instructions, and coordination rules, and how should
the framework explain invalid definitions?

## Comments

- A throwaway UI prototype compared a repository workbench, visual process
  canvas, and guided setup. It showed that a dedicated authoring UI would add
  substantial product surface while largely recreating existing editors. The
  prototype was discarded after that decision was captured below.

## Answer

The first version has no dedicated process-authoring page. A process definition
is a documented set of version-controlled files in a conventional directory in
the project repository, edited with the user's normal editor. Building an
in-product editor would add substantial surface area while mostly recreating
tools such as VS Code; the interactive prototype made that trade-off concrete.

Use YAML for the structured definitions of boards, columns, agents, roles, and
coordination rules. Keep each agent's long-form instructions in a referenced
Markdown file rather than embedding large block strings in YAML. The exact file
names, directory layout, and schema belong in the later software specification.

The framework provides a JSON Schema, reference documentation, a tutorial, and
examples. The schema is the common structural contract for framework validation
and for optional completion and inline diagnostics supplied by standard YAML
editor tooling. The first version does not provide or require a custom VS Code
extension.

Definitions are validated both by an explicit command and whenever the
framework loads them. Diagnostics should use compiler-style source locations
and report the file, line and column, invalid value, violated rule, consequence,
and a concrete correction when one can be suggested safely. Cross-file and
behavioral checks follow the same diagnostic shape and point to the most
relevant source location available.
