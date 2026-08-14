# 61 — Remove Mojibake Characters from the UI

**What to build:** Intended punctuation renders correctly throughout the user
interface instead of appearing as stray encoding artifacts such as `Â·`.

**Blocked by:** None

**Status:** open

- [ ] Find every user-visible instance of the unintended `Â` character and any
  related mojibake in source strings, persisted projections, and rendered UI.
- [ ] Correct the underlying text or encoding boundary rather than hiding one
  observed character with CSS.
- [ ] Ensure intended separators such as the middle dot render consistently in
  task history, attempt labels, transcript metadata, and other affected views.
- [ ] Decide whether existing persisted text needs a compatibility repair or
  whether the defect is limited to presentation/source encoding.
- [ ] Add regression coverage at the narrowest boundary that caused the
  corruption and verify representative UI surfaces visually.

## Comments

- Captured from real-project use after `Â·` appeared unintentionally in several
  places in the UI.

