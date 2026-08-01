# Define Agent Permissions and Approval Boundaries

Type: wayfinder:grilling
Status: resolved
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

## Answer

Reuse one user-controlled Codex permission policy for every agent run. The
coordination framework defines no permissions by agent, role, or process and
does not override Codex's sandbox or approval configuration when starting a
run. Process instructions may tell an agent which actions its role should take,
but they are guidance rather than a source of technical authority.

The inherited policy is Codex's persistent configuration as resolved for the
SDK process; a temporary permission level selected for a particular Codex app
task is not assumed to carry over. Codex remains responsible for sandbox
enforcement and any configured automatic approval review.

The first version does not implement interactive approval handling. When a
required action is denied or still needs human approval that the SDK run cannot
obtain, record a permission block, require user attention, and suspend that
activation without automatic retry. The user may perform the action manually
or change the Codex policy, then explicitly continue the preserved activation.

Do not add special protection for process-definition files or branches that
change them. Agents are trusted to follow their instructions, and a dedicated
permission or merge-guard system is not valuable enough for the first version.
Likewise, do not build a framework approval UI unless later experience makes
interactive approvals important enough to justify a deeper App Server
integration.
