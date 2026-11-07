# Broader delivery and knowledge patterns

Research date: 2 November 2026. Read-only analysis; no live database access or project edits by this researcher.

## Evidence and limits

Primary evidence is the offline export in `../local-evidence/autonomous-process-assessment/historical`, extracted from the existing `coordination.sqlite3.pre-cache-cleanup-2026-11-01T15-00-37Z.sqlite3` copy. It contains 283 tasks, of which 251 were archived and 32 active. Comments, movements and task descriptions remain available; this is not a review of deleted archived transcripts. Current repository documents were read with `git show origin/main:<path>`, at local remote-tracking commit `b370c7d7fa353f7aabaaf3e971a9909a0da92caf`. The primary checkout is stale relative to that published tree: its apparent lack of AGENTS.md is not evidence the agents lack one. No fetch was performed.

References below identify JSON files plus immutable comment sequence or authored-message ID; dates are UTC. A comment's assertion about earlier execution is attributed evidence, not independently reproduced execution. Current documents must not be projected backward onto earlier tasks.

## 1. Knowledge exists; finding and applying it are separate failure points

The user already articulated the systemic concern on 17 October: processes need discoverable entry points and the rationale must survive delegation, not just abbreviated instructions. They specifically asked for AGENTS.md as the discovery route and for agents to recognize when work needs preparation. Sources: `../local-evidence/autonomous-process-assessment/historical/T-0001-messages.json`, messages `148accd9-a408-44c9-b378-8917ef86529a` (00:50:41) and `bf3c5b6e-f973-4405-84e8-7e7a946ce3e7` (01:22:00).

That structure now exists. At the inspected published commit:

- `AGENTS.md` links current review decisions, product vision, working expectations and workflows; it discusses original requirements, rationale, compaction, publication and receipt by other worktrees.
- `docs/process/workflows.md` is explicitly a discovery map keyed by work kind, with asset preparation, uncertainty/preparation, and review presentation routes.
- `docs/product/ui-design-patterns.md` describes interaction semantics, an existing-control inventory, source locations, the extracted shared API and a concrete consumer example.

Nevertheless, the user's 31 October message `a8e83afb-fd3f-4458-b983-ce72094011be` reports save/load pagination using buttons despite the existing Museum scrollbar, and asks for a proper discoverable control library. The UI document explicitly records this source. This is evidence of a real generalization/reuse problem and a subsequent concrete response; it does **not** prove the new UI inventory failed after it was installed.

**Implication:** do not recommend merely adding AGENTS.md or writing more task documents. Distinguish: (a) decision absent, (b) decision exists but was not retrieved, (c) decision retrieved but applied too narrowly, (d) acceptance threshold permits a known failure, (e) superseded guidance or branch distribution mismatch. Each incident should identify which failed. A task should briefly state its applicable shared pattern and why any intentional exception is justified. Verify that another consumer can actually find and use the resulting pattern.

## 2. The strongest demonstrated failure is sometimes judgment, not memory

T-0179 investigated why the asset pipeline repeatedly disappointed the user. Its implementation audit explicitly found that prior T-0167 implementer, reviewer and verifier had received the instructions and inspected saved images. The verifier had accepted recognizable rock motifs and sharper birch rendering as minor limitations; the user later rejected those traits. The audit identifies an insufficient acceptance threshold plus runtime transform/material-design failure, rather than missing references. Source: `../local-evidence/autonomous-process-assessment/historical/T-0179-comments.json`, seq **5101**, 24 October 14:28:59.

The corrective task then showed both the value and the limitation of review:

- Quality caught recurring pale diagonal landmarks in the actual delivered deep frame, not a hypothetical unlimited-world requirement (seq **5222**). Implementation retracted its stronger success claim (seq **5224**).
- The same variety criterion then required a shallow-material correction (seq **5275**, recording the accepted review finding).
- Design Verification later caught the same class of recognizable recurrence on cliff faces (seq **5283**), explicitly saying a disclosed finite library did not create an agreed exception.
- Focused correction and comparison finally closed the cliff finding while preserving the 16 unchanged images and their prior judgments (seq **5304**).

**Cause supported by this case:** a cross-cutting visual criterion was initially treated as several local issues and disclosed limitations. The team had the reference but did not consistently enforce the user's intended quality across all related surfaces.

**Potential remedy:** make the generalized rule concrete through accepted/rejected examples and a short affected-family inventory (here: deep, shallow and exposed cliff materials). Review the representative whole composition before scaling assets; after finding one failure, inspect analogous uses before another handoff. Preserve human aesthetic judgment without turning every asset into a separate user approval. This is stronger than more “read the full document” receipts.

## 3. Avoid diagnosing the entire pipeline as endless review churn

Across **260 Delivery tasks** in the historical copy, there are **1,944 task.moved events**. Using the configured normal ordering Design → Implementation → Code Quality → Code Review → Design Verification → Integration → Ready for Integration → Completion, **79 movements go backward**. Only **three tasks** return backward specifically to Design: T-0012 nine times, T-0071 four times, and T-0008 once. Backlog and unrecognized states are excluded from backward comparisons. These counts describe recorded movement, not the number of defects or wasted runs; useful review corrections are included.

T-0012 is an extreme early outlier: 330 comments and 114 currently retained pinned comments totaling approximately 10,110 whitespace-separated words. T-0071 has seven backward movements, including four Design returns. This concentration supports targeted investigation of uncertainty-heavy physics/representation work, rather than deleting independent review or assuming every feature repeatedly restarts design. Source: all `../local-evidence/autonomous-process-assessment/historical/T-*-activity.json` joined to `../local-evidence/autonomous-process-assessment/historical/tasks.json`; pin count from `../local-evidence/autonomous-process-assessment/historical/T-0012-comments.json`.

The T-0179 sequence above is a positive counterexample: independent reviews found actual defects, required proportionate corrections, and reused unchanged evidence. A process that simply minimizes returns would hide these failures.

**Potential remedy:** assess investigation loops by their unresolved decision, scope changes and new information, not just stage count. Before repeating a failed experiment, state what hypothesis changed and what outcome ends or redirects the investigation. Do not mistake additional evidence production for product progress.

## 4. Later art work still shows local repair outgrowing the original composition decision

T-0283 was created after three rejected native parallax passes. Its brief expressly rejects miniature landscape stickers and requires connected authored layers planned against actual geography, with representative joined compositions before expansion. It also separates the child's art responsibility from the parent's interactive study matrix. Source: `../local-evidence/autonomous-process-assessment/historical/tasks.json`, T-0283 description.

Later retained continuation records still describe a difficult sequence of local caps, pointed peaks, unsupported boundaries and rejected source variants. Seq **8871** (1 November 13:19:59) reports three new unadopted raws; a locally improved broad crest creates a 44 m discontinuity, while valid wide views expose a detached/clipped hill. Seq **8872** explicitly redirects to “PLANNING FIRST” for continuous western geography instead of another narrow patch or coordinate-compliance loop. Source: `../local-evidence/autonomous-process-assessment/historical/T-0283-comments.json`.

This is not evidence that the whole project lacked planning—the task itself required it. It demonstrates how execution can drift toward satisfying local constraints despite an adequate high-level brief. The retained acknowledgment and explicit continuation are useful counterevidence against total loss of ownership.

**Potential remedy:** use an actual integrated representative slice as the decision artifact. Define the visual/domain envelope before generating the batch and revisit that decision when local fixes repeatedly shift the same failure elsewhere. A successful local metric must not substitute for the whole-frame judgment it was supposed to support. The snapshot predates this task's eventual completion, so no final outcome claim is made here.

## 5. Maintainability participation improved, but the role can drift toward serial evidence clearance

The user demanded at least one completed maintainability assessment between checkpoints on 25 October, because several checkpoints had passed without one. Source: `../local-evidence/autonomous-process-assessment/historical/T-0001-comments.json`, seq **5497**. Product relayed the requirement and specifically asked for ease/cost of change rather than just correctness or file size (`../local-evidence/autonomous-process-assessment/historical/T-0003-comments.json`, seq **5499**).

The ensuing substantive assessment identified repeated producer-readiness classification and proposed a small shared projection before further producer-semantic extensions (seq **5505**, creating T-0191). This is exactly the kind of generalized architectural learning sought by the user.

Later r22 assessments are very carefully bounded and honest about attributed execution. They cover source changes, material joins, and final identity/persistence boundaries; they also repeatedly state no new maintainability defect or justified refactor. Examples: seq **8085** (all seven roots source-covered), **8110** (final identity/raw/persistence boundary). Integrator and Product then each issue lengthy receipt/disposition comments: **8096**, **8114**, **8116**.

**Interpretation, not a proven waste calculation:** the assessor risks becoming another correctness/evidence sign-off gate around each combined revision rather than spending enough attention on change-cost patterns. The records explicitly avoid unchanged reruns, and some boundaries are real; therefore these comments do not justify removing the role or its reviews. A useful improvement would preserve one meaningful cross-cutting assessment per interval and trigger additional reviews only when a material change invalidates a named conclusion. Track which findings actually reduce future change cost, alongside coverage.

## 6. Memory cleanup helped; snapshot counts must not be mistaken for ongoing universal failure

The historical copy has 20 tasks exceeding either three pins or 500 whitespace-separated pinned words, but **19 are archived** and many predate the later rule. Of **32 active tasks**, only T-0002 exceeds the pin-count cap, with four pins and approximately 252 words. T-0001 has one pin/96 words; T-0004 two/132. These figures show current task memory was substantially consolidated by this snapshot. They do not erase earlier oversized-memory incidents, and they cannot establish whether agents retrieved the replacement documents.

The knowledge burden also moved into extensive task-specific design/implementation/evidence records. Existing discovery maps are a good response. Their maintenance and semantic organization matter more than the raw number of files. A short current decision should identify scope, reason, examples, owner, superseded decisions and a relevant source/API; historical receipts should remain reachable without dominating default context.

## Cross-cutting recommendation

Test a small learning loop on one repeated family, such as UI controls or asset composition:

1. Select a real repeated complaint and preserve its original source and rejected example.
2. Determine whether knowledge, retrieval, application, quality judgment, or continuation failed.
3. Record one generalized decision at an existing natural discovery point, with scope and rationale.
4. Apply it to two related consumers, preserving justified differences.
5. Have an independent reviewer test the generalized rule against the user's actual criterion, not merely check that the document was read.
6. At the next checkpoint, assess recurrence, user corrections and actual delivered quality before considering the process change effective.

This is a proposal for a bounded pilot, not authorization to change the running process. It uses the current docs and roles rather than multiplying stages or forcing the user to approve every small step.
