# 17 — Compact routine timeline activity while preserving notable outcomes

**Type:** grilling
**Status:** open
**Blocked by:** None.
**Next step:** Define timeline prominence semantics and trustworthy classification signals before choosing a UI.

## Problem and product direction

Automated processes can generate long stretches of routine agent communication
between the entries a user most wants to inspect. An implementation agent, code
reviewer, and technical-design reviewer may all report in sequence. A review
that found nothing currently occupies roughly the same timeline space as a
review that found an actionable issue, making important outcomes harder to spot.

Distinguish routine activity from content that merits greater visual attention.
Routine entries could use a minimal representation, potentially under a
user-selected timeline filter or density mode. Notable entries should retain the
current readable representation and remain easy to scan and navigate.

Examples of notable content include an explicit user mention and a code-review
finding. A simple status report such as “completed X and Y; no problems found”
is an example of routine content. These examples express intent; they do not yet
define a reliable classification algorithm.

If the framework cannot infer prominence robustly, agents could explicitly
declare whether their authored result contains something requiring unusual
attention, potentially through an MCP contract. That alternative must be
discussed rather than assumed.

## Design completion criteria

- [ ] Inventory the current timeline record types, grouping, filters, authored
  outcomes, comments, attention reasons, mentions, and structured provenance
  available for classification.
- [ ] Define a presentation concept distinct from the framework's formal
  unresolved user-attention state; visual prominence must not implicitly create,
  resolve, or acknowledge a `Needs attention` reason.
- [ ] Agree vocabulary and categories—such as routine, notable, or explicitly
  actionable—and define their visual and behavioral consequences.
- [ ] Decide whether compaction is the default, an additional filter/density
  mode, a per-entry disclosure, or a combination, and how it composes with the
  existing `Visible to agents` filter.
- [ ] Determine reliable signals for user mentions, review findings, failures,
  permission blocks, requested decisions, no-findings reports, ordinary status
  summaries, movements, and nested attempt content.
- [ ] Compare rule-based inference, role-specific structured outcomes, and
  explicit agent-authored prominence metadata. Avoid relying on brittle prose
  parsing or treating every message from a particular role identically.
- [ ] If agents can declare prominence, define MCP fields, allowed values,
  guidance, defaults, validation, provenance, and whether users can correct the
  classification without rewriting authored content.
- [ ] Preserve full durable history and access to every compacted entry. Filtering
  or compaction must not erase audit evidence or break causal/source links,
  movement navigation, live-refresh anchoring, or conversation access.
- [ ] Define accessible compact representations, counts/grouping if any,
  keyboard expansion, search/navigation behavior, and dark/light visual
  hierarchy for desktop and narrow layouts.
- [ ] Test the design with realistic implementation-review-design-review chains
  containing no findings, findings, mixed routine updates, and explicit user
  requests before publishing implementation tickets.

## Questions to grill

Is a review finding merely visually notable, or should some findings also create
formal user attention? Should routine entries collapse individually or as a run
of activity between landmarks? Who is authoritative when an agent marks a
message routine but it mentions the user or reports a failure? Does prominence
belong to an authored comment/outcome, an attempt, or a reusable event type?

## Related work

Build on the narrative timeline and grouped-attempt model implemented by
[`agent-coordination-framework` issue 37](../../agent-coordination-framework/issues/37-structure-task-history-by-cause-and-attempt.md).
Coordinate the available timeline toolbar space and hidden-record navigation
with issue 16's proposed movement map.

## Comments

- 2026-09-23: Added from user dictation. Automatic classification and explicit
  agent-supplied importance are both open design options, not requirements yet.
