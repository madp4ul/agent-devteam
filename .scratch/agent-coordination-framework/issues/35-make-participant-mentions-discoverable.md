# 35 — Make Participant Mentions Discoverable

**What to build:** Help a user address the intended agent or the user from the
comment composer without memorizing exact participant IDs, while preserving the
comment and activation semantics established by issue 20.

**Blocked by:** 20 — Consult Agents and Notify the User

**Status:** open

- [ ] Compare a lightweight `@` autocomplete with an explicit participant
  selector, including whether the first useful interaction should retain
  multiple mentions or deliberately allow only one addressed agent. Prefer the
  smallest interaction that makes common consultation reliable.
- [ ] If autocomplete is selected, opening suggestions at a valid mention token
  boundary lists applied agents by display name with enough summary context to
  distinguish their responsibilities and includes the special user recipient.
- [ ] Selecting a suggestion inserts the exact canonical token accepted by the
  existing mention parser. Filtering, keyboard navigation, pointer selection,
  dismissal, focus behavior, and screen-reader labeling are usable without
  preventing ordinary comment text entry.
- [ ] An `@` inside an email address, code fragment, or ordinary prose does not
  unexpectedly address a participant. Unknown or removed participant IDs remain
  understandable and do not silently target someone else.
- [ ] Suggestions use the current applied participant directory and refresh
  after process-definition changes; display-name changes do not alter stable
  mention identity.
- [ ] Rendered comments visually distinguish canonical participant mentions
  from surrounding prose. The treatment exposes the participant's display name
  and whether that source mention queued an agent activation or requested user
  attention, without turning every consequence into another full-size comment.
- [ ] Plain display names and email-like text remain ordinary prose, so users
  can distinguish discussion *about* an agent from an explicit request *to* it.
- [ ] Choosing or editing a suggestion creates no activation by itself.
  Submission remains one atomic comment command with the same deduplication,
  textual ordering, user-attention, and idempotency behavior as issue 20.
- [ ] Focused interaction or browser tests cover discovery, insertion, keyboard
  and pointer use, cancellation, multiple/one-recipient behavior as decided,
  email-like text, unknown identities, and the resulting submitted activation.

## Comments

- Live review after issue 20 found exact agent IDs difficult to remember. `@`
  autocomplete is the leading candidate because it fits the existing composer
  and multi-participant comment model, but an explicit single-recipient control
  may be cheaper or clearer. Run a focused interaction decision or prototype
  before marking this issue ready-for-agent.
- The same review found negative prose such as “no implementation defect
  requires return to `@implementation-agent`” visually indistinguishable from a
  deliberate request even though it queued that agent. Highlighting must make
  the executable token and its consequence obvious; framework instructions from
  issue 38 separately prevent agents from emitting such accidental requests.
- This ticket improves mention entry only. Timeline freshness after submission
  belongs to issue 32.
