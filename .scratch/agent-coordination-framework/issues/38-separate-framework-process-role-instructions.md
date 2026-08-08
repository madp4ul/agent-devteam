# 38 — Separate Framework, Process, and Role Instructions

**What to build:** Give every activation an explicit, consistently composed
instruction hierarchy so invariant coordination-framework mechanics are taught
once by the product, process definitions describe only process-specific
cooperation, and agent instruction files remain focused on one role.

**Blocked by:** 20 — Consult Agents and Notify the User; 36 — Configure Agent Models and Reasoning

**Status:** open

- [ ] Define and document four distinct prompt layers: product-owned framework
  instructions, process-authored coordination guidance, role-specific agent
  instructions, and immutable activation plus attempt facts. Give conflicts a
  deliberate precedence rather than relying on heading order or repetition.
- [ ] Framework instructions explain stable mechanics shared by every process,
  including canonical participant mentions as executable requests, user
  attention, task-scoped coordination tools, activation provenance, and the
  absence of implicit board effects after a successful response.
- [ ] Process coordination guidance describes how this process expects roles to
  cooperate, route work, record outcomes, and apply its approval gates. It does
  not restate framework syntax or generic tool mechanics.
- [ ] Agent instructions describe the responsibility and judgment of one role.
  They may specialize process behavior but do not redefine framework commands,
  mention parsing, permissions, or activation semantics.
- [ ] Framework instructions have one product-owned source and are composed by
  every supported runtime adapter. Example YAML and role files contain no
  copied framework boilerplate that can drift independently.
- [ ] Decide how framework-instruction changes are identified in attempt
  evidence and how queued work behaves across an application upgrade. Do not
  overload the process-definition fingerprint with product-owned text unless
  that is the deliberately chosen compatibility rule.
- [ ] Task or attempt inspection exposes enough instruction-source identity to
  explain what governed a run without dumping hidden runtime internals or
  duplicating the complete prompt throughout the timeline.
- [ ] Prompt-composition tests prove stable layer ordering, exact separation,
  framework instruction inclusion across roles and processes, process and role
  specialization, and safe handling of task/comment content as facts rather
  than instruction authority.
- [ ] A controlled consultation scenario proves that negative prose and plain
  display names create no activation, a deliberate canonical mention creates
  exactly one, agents do not mention themselves, and an already-pending request
  is not repeated merely to narrate status.

## Comments

- Live review after issue 20 exposed the missing layer when invariant mention
  semantics were added to the software-delivery process's coordination guidance.
  That workaround was removed: canonical mention behavior belongs to the
  framework regardless of project or process.
- The current Codex prompt already appends some invariant framework behavior in
  an unlabelled final paragraph. This issue turns that incidental text into an
  explicit instruction source and defines its relationship to process guidance,
  role instructions, activation reason, current task state, and attempt context.
- Run a focused grilling of precedence and upgrade/version behavior before
  marking this issue ready-for-agent. It is required before the assembled
  first-usable-workflow proof, but it is not the next ticket ahead of issue 36.
