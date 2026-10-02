# Retain interruption-resume instructions in activity

Status: accepted

An activation's pending continuation message is cleared when an attempt claims
it and can be replaced in later interruption cycles. It cannot serve as durable
user-facing evidence of each resume.

The continue command therefore appends the exact normalized runtime instruction
text and interrupted-attempt identity to its existing immutable resume activity
in the same transaction. An empty string proves an instruction-free resume;
an absent field means historical instruction evidence is unavailable. Do not
infer old instruction text from the activation's current mutable delivery state.

Both browser surfaces render that event evidence. Conversation history associates
each resume with its activation and preceding attempt. Historical events use
the preceding suspension's retained attempt identity and journal sequence before
falling back to interrupted-attempt completion times. Dismissal that releases suspension
is not a conversation resume. No synthetic model response or authored follow-up
activation is created. The existing journal payload needs no schema migration.
