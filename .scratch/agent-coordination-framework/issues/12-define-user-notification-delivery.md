# Define User Notification and Attention Delivery

Type: wayfinder:grilling
Status: resolved
Blocked by: 05, 06
Parent: ../map.md

## Question

How should the local framework notify the user outside the board interface when
a new attention reason appears, and how should delivery or acknowledgement of
that notification relate to the board's Needs attention state?

## Answer

Desktop notifications are a required convenience in the first usable version,
while the board's Needs attention state remains the authoritative record. They
are disabled by default. The framework explains the feature and requests
operating-system permission only after the user explicitly enables it; it does
not show an unsolicited startup permission prompt.

Create one desktop notification for every newly created attention reason unless
the user is actively viewing the affected task. Merely having the board or
application open does not suppress it. Enabling notifications or restarting the
application does not replay notifications for reasons that already exist.

Each notification identifies the process or board, task ID and title, and the
attention-reason type, such as a user mention or an agent run needing recovery.
Do not expose comment text, failure diagnostics, or other task content that may
appear on a lock screen.

Selecting a notification navigates directly to the affected task and highlights
the attention reason. Selecting or dismissing the operating-system notification
does not acknowledge or resolve that reason. It remains in Needs attention until
the user performs the existing explicit action appropriate to its cause.

Delivery is best-effort and non-durable. If operating-system notifications are
disabled, unavailable, or fail, the framework does not retry, queue delivery for
later, or create another attention reason. The first version also has no
notification history, read or unread state, snoozing, quiet hours, or separate
notification center; the board already provides durable grouping and resolution.
