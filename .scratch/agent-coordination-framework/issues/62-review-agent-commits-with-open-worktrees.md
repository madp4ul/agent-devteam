# 62 — Review Agent Commits While Task Worktrees Are Open

**What to build:** Investigate and reduce the friction caused when linked task
worktrees prevent the primary repository from switching to an agent's commit or
branch for user review.

**Blocked by:** None

**Status:** open

- [ ] Reproduce and document the exact Git constraints for the review flows
  encountered in real-project use, including whether the target is a branch
  already checked out by a task worktree or a detached commit.
- [ ] Identify which review actions genuinely require switching the primary
  worktree and which can be supported by opening the task worktree, inspecting
  a commit directly, comparing refs, or another Git-native workflow.
- [ ] Evaluate a small set of safe product responses, including clearer review
  guidance, direct navigation to the owning task workspace, or guarded
  workspace lifecycle changes.
- [ ] Do not remove active worktrees, move their branches, or discard changes
  merely to make the primary repository switchable.
- [ ] Preserve concurrent task isolation and Git's linked-worktree safety
  invariants.
- [ ] Turn the selected response into explicit implementation acceptance
  criteria before changing workspace behavior.

## Comments

- This ticket intentionally records a real-use annoyance even if Git's linked
  worktree constraints mean the primary repository cannot simply switch to an
  agent branch. It begins as a bounded feasibility and workflow investigation.

