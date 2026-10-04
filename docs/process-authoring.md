# Writing process definitions

This guide describes how to write process guidance and agent responsibilities.
Use the [process-definition reference](process-definition-reference.md) for YAML
fields and validation, and the [agent MCP reference](agent-mcp-reference.md) for
tool contracts. The aim is to give capable agents enough understanding to make
good decisions together, with clear goals and boundaries.

## Describe responsibilities and outcomes

Explain what each role owns, what a useful result looks like, and what matters
to the people or agents receiving that result. Describe the work in the language
of the process rather than as a sequence of tool calls.

For example, write "Create the missing delivery children and assign yourself as
their resume agent." The framework and tools explain how to identify the caller,
select the destination, and submit the operation. Agent instructions do not need
to repeat IDs, argument names, aliases, or invocation examples.

Include technical detail when it expresses an actual project requirement, such
as the integration branch or the requirement to inspect changes before publishing
them. Prefer the requirement over a command recipe. YAML still needs concrete
identities and configuration values; prose instructions usually do not.

## Build on the supplied framework context

Agents receive framework guidance, coordination tool descriptions, and information
about other participants. Read the current [framework guidance](../src/application/activation-prompt.ts)
before authoring a process so the process adds information rather than restating
the environment.

Process guidance should explain the chosen workflow, responsibilities, quality
expectations, and user decisions. Leave general explanations of relationships,
activations, mentions, history, pins, and conversation continuity to the framework
and tool descriptions.

A useful distinction is between explaining a capability and choosing how this
process should use it. Explaining how pins are delivered repeats the framework.
Encouraging agents to keep useful plans and decisions available to later
participants expresses a process preference.

## Trust agent judgment within clear boundaries

Treat agents as capable collaborators. Give them the purpose of their work, the
relevant environment, their own responsibility, and an understanding of the other
roles they can cooperate with. Trust them to choose how to use that environment
to achieve the best result.

Describe the ideal normal path as orientation. Avoid trying to enumerate every
possible situation with a mandatory response, destination, or action. Agents
should be able to seek assistance, adapt their approach, and choose a sensible
route when circumstances differ from the normal path.

Be explicit about boundaries that matter: required outcomes, scope, ownership,
user approval, and the authority to take consequential actions. Within those
boundaries, leave room for judgment about tactics, verification, collaboration,
documentation, and which earlier conclusions need reconsideration. Apply this
principle throughout the process, not just to selected features such as pinning.

Prefer guidance such as "Revisit the reviews whose conclusions your changes
invalidate, and explain the route you choose" over a decision tree covering each
kind of revision. Ask for more detailed rules when a real recurring problem or a
necessary constraint warrants them, rather than trying to anticipate everything.

## Choose roles and stages for the process's needs

Roles identify useful responsibilities and collaborators. Stages make meaningful
progress, ownership, or user decisions visible. Choose them for the work being
coordinated, rather than assuming each activity needs a separate role or column.

For example, planning and following delivery through to its outcome can belong
to one role when continuity helps. A separate assessor can be useful when an
independent perspective is important. Neither arrangement is a universal template;
the process's goals should explain the choice.

Keep enough structure for agents to understand the normal workflow and cooperate
freely, without making routine collaboration depend on an exhaustive routing plan.

## Write allowances as targeted authorization guidance

Use allowances for user-approved capabilities that are reasonably expected to
encounter approval review, especially actions that have already been blocked
despite their intended authorization. Add them on demand as that need becomes
clear, rather than copying every role duty into an allowance list.

Describe the authorized functionality, its scope, and its purpose. For example:
"Synchronize the assigned task branch with the integration branch and publish
the task branch to the project's remote for review." Prefer this level of detail
over enumerating commands and flags. Mention shared repository metadata, remote
access, or an external output location when that helps explain the approved scope.

Additional capabilities need user agreement before they become standing
authorization. Do not broadly add permissions for hypothetical interruptions or
actions that have no expected need for approval review. The
[allowance reference](process-definition-reference.md#optional-reviewer-allowances)
explains delivery and runtime limits; the process need not repeat those mechanics.

## Review an authored process

Before handing it back, check whether:

- Responsibilities, useful outcomes, and meaningful boundaries are clear.
- Each instruction adds process-specific information beyond supplied framework context.
- Agents understand their collaborators and can use judgment across the whole workflow.
- The normal path offers orientation without prescribing every exception.
- Roles and stages serve the process, and allowances reflect agreed needs.

Validate the definition using the reference's validation procedure. Validation
checks the configuration contract; the review above checks the quality of the
guidance.
