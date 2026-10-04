# Codex reviewer compatibility template

`codex-0.160.0.md` is the unmodified public template from
https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/prompts/templates/guardian/policy_template.md.
Copyright OpenAI; distributed under the accompanying Apache 2.0 `LICENSE`.

The adapter compares the complete current template against this public text,
allowing only the known missing `extra_policy` slot. It forwards public text
only for that exact repair. Unknown templates fall back to baseline approval
behavior; this is not a permanently pinned replacement for evolving policy.
Retire the repair when the supplied template includes the slot.
