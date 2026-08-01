# Define Agent Permissions and Approval Boundaries

Type: wayfinder:grilling
Status: open
Blocked by: 02, 05
Parent: ../map.md

## Question

Which actions may agents take without the user, which actions require explicit
approval, and how should those boundaries interact with Codex sandboxing and
the configurable process?

## Comments

- Input from **Define the Git Task-Workspace Lifecycle**: Codex's normal
  `workspace-write` sandbox protects `.git` as read-only, including the Git
  directory resolved through a worktree's `.git` pointer. Editing task files
  therefore fits the ordinary workspace boundary, but process-directed branch,
  commit, and merge operations need an explicit approval or permission design.
  See [Protected paths in writable roots](https://learn.chatgpt.com/docs/agent-approvals-security#protected-paths-in-writable-roots).
