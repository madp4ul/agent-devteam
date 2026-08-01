# Define Automation Observability and Recovery

Type: wayfinder:prototype
Status: open
Blocked by: 05, 06, 07
Parent: ../map.md

## Question

What task activity history, activation and attempt statuses, failure
diagnostics, and Retry and Dismiss controls should the user see at
board and task levels so they can understand and recover automation without
conflating framework events with authored comments? How should the task page
present Interrupting, User interrupted, Task automation suspension, optional
continuation messages, and Continue? Where should each attempt's Codex thread
reference appear, and how should a capability-dependent Open in Codex action
behave when supported navigation is or is not available? How should the user
pause and resume automation for the entire process, and how should the interface
show the transition to a state in which no agent is still changing any board?

## Comments

- The user needs to inspect each agent run's conversation and tool activity to
  assess whether agents work efficiently and whether the process definition
  needs refinement. Viewing or taking over the live thread in the Codex app is
  not required. Reuse Codex as the transcript viewer when supported and
  worthwhile, but provide another inspectable transcript interface when it is
  not; weigh the quality difference against implementation effort.
- Do not attempt to reproduce the Codex app's rich transcript in full. Find the
  smallest useful presentation above raw text: make messages readable and show
  enough tool activity and live progress to diagnose agent behavior, while
  avoiding bespoke interactive controls and minor visual refinements whose
  implementation cost does not improve process evaluation.
- The user wants a process-wide automation suspension covering all boards so
  they can work with stable board state while knowing no agent is changing it.
  The eventual design must distinguish the request to pause from the confirmed
  state in which every active run has actually stopped.
