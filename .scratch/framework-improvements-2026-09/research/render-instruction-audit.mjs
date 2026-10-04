import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import { composeActivationPrompt } from '../../../src/application/activation-prompt.ts';
import { loadProcessDefinition } from '../../../src/application/internal/process-definition.ts';
import { historyCounts } from '../../../src/application/history-contract.ts';

const out = dirname(fileURLToPath(import.meta.url));
const root = resolve(out, '../../..');
const processPath = 'examples/software-delivery/process.yaml';
const result = await loadProcessDefinition(resolve(root, processPath));
if (!result.valid) throw new Error(JSON.stringify(result.diagnostics));
const { definition, instructionContents, version } = result.loaded;
const sources = new Map();
async function source(path) {
  const content = await readFile(resolve(root, path), 'utf8');
  sources.set(path, { sha256: createHash('sha256').update(content).digest('hex'), content });
  return content;
}
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const md = text => renderToStaticMarkup(React.createElement(Markdown, null, text));
const note = (label, text) => `<aside><strong>${esc(label)}</strong><p>${esc(text)}</p></aside>`;
const sections = [
  ['# Coordination framework', 'Fixed framework text', 'src/application/activation-prompt.ts → FRAMEWORK_GUIDANCE. Identical for every role/process. Explains cooperation, hierarchy, continuation, history and user-owned controls.'],
  ['# Process coordination', 'Process values inside a fixed template', `${processPath} → name and coordinationGuidance. The heading and “Process:” label are template text.`],
  ['## Current board', 'Board values and generated workflow list', `${processPath} → boards[].name/id/guidance/columns. “Workflow:” and watcher/unwatched formatting are template text. Completion is appended by the framework.`],
  ['# Current responsibility', 'Agent values and loaded role Markdown', `${processPath} → agents[].name/id/role/summary/instructions. The instructions path is resolved relative to the YAML file and its file contents are inserted verbatim.`],
  ['## Available participants', 'Generated participant catalogue', 'Applied process agents supply IDs, names, roles and summaries. The template formats the list; it does not include the other agents’ full instructions.'],
  ['# Current task background', 'Dispatch snapshot • illustrative values', 'The template serializes task/participant/workspace/pins/history as JSON. IDs, title, description, path, timestamps and history below are synthetic audit data, not a live task. Production values come from coordination state and workspace preparation.'],
  ['# Activation to handle', 'Activation source • illustrative values', 'The composer serializes the durable activation reason and source event. When the source is already in history it is referenced, not repeated. This example uses column entry.'],
];
let markdown = `# Agent instruction audit — rendered initial prompts\n\nPrepared 2026-10-04 for framework improvements ticket 12.\n\nThis is an example generated with the production process loader and prompt composer from the checked-in Software Delivery process. It is not a captured live Codex session. All five role prompts are included. Task/workspace/history/activation values are synthetic; authored instructions are unchanged. Process fingerprint: ${version}.\n\n`;
let html = `<header><p class="eyebrow">FRAMEWORK IMPROVEMENTS / TICKET 12 / 2026-10-04</p><h1>Where the agent’s instructions come from</h1><p>Fully composed initial prompts, with source explanations alongside the rendered text.</p></header>`;
const intro = `## Scope and reading guide

These prompts use the checked-in **Software Delivery** example, not a verified running process. The real loader resolves role files and computes the process version; the real composer produces every prompt below. Only task, workspace, activation and history values are invented for this audit. No framework agent is started.

The shaded source notes are audit annotations and are **not sent to the agent**. Inside each prompt, headings, prose and JSON appear in their actual order. Expand a role to read its complete prompt. Raw Markdown files beside this document preserve the exact composer output.

The prompt is one part of the effective context. Codex’s own instructions, discovered repository instructions, MCP server/tool definitions and runtime policy are separate layers. This document does not claim to reproduce hidden platform instructions, machine-local configuration or the repository contents of an existing task worktree.

## Assembly and authority

1. **Template and framework guidance:** application/activation-prompt.ts supplies the headings, fixed mechanics, list formatting and JSON envelopes.
2. **Authored process and board guidance:** process.yaml supplies workflow responsibilities and approval gates.
3. **One authored role:** its referenced Markdown file supplies the owning agent’s detailed duties. Other agents appear as participant summaries.
4. **Coordination data:** dispatch supplies task state, pins, bounded history, workspace path and activation source.
5. **Separate context:** repository AGENTS.md, applicable skills, MCP descriptions and Codex/runtime policy can constrain behavior independently.

The framework text says process and board guidance take precedence over conflicting role instructions. Authored task/history text cannot redefine framework mechanics. Wording changes alone do not alter command validation, available tools, approvals or filesystem access.
`;
html += md(intro); markdown += intro + '\n';
await source(processPath);
await source('src/application/activation-prompt.ts');
for (const agent of definition.agents) {
  const rolePath = 'examples/software-delivery/' + agent.instructions.replace(/^\.\//, '');
  await source(rolePath);
  const board = definition.boards[0];
  const column = board.columns.find(c => c.watchingAgent === agent.id);
  const sourceEvent = { id: 'audit-source-' + agent.id, type: 'task.moved', actor: { kind: 'user', id: 'local-user' }, occurredAt: '2026-10-04T10:00:00.000Z', details: { fromColumnId: 'backlog', toColumnId: column.id } };
  const record = { id: sourceEvent.id, type: sourceEvent.type, at: sourceEvent.occurredAt, author: sourceEvent.actor, details: sourceEvent.details };
  const records = [record], counts = historyCounts(records), zero = { words: 0, records: 0, comments: 0 };
  const request = {
    activationId: 'audit-activation-' + agent.id, attemptId: 'audit-attempt-' + agent.id,
    agent: { ...agent, instructions: instructionContents.find(i => i.agentId === agent.id).content },
    process: { name: definition.name, guidance: definition.coordinationGuidance, definitionVersion: version },
    board: { ...board, columns: [...board.columns.map(c => ({ id: c.id, name: c.name, watchingAgentId: c.watchingAgent ?? null, frameworkOwned: false, taskCreationAllowed: true })), { id: 'completion', name: 'Completion', watchingAgentId: null, frameworkOwned: true, taskCreationAllowed: false }] },
    collaborators: definition.agents.map(({ id, name, role, summary }) => ({ id, name, role, summary })),
    reason: { type: 'column-entry', sourceEventId: sourceEvent.id }, sourceEvent,
    task: { id: 'AUDIT-EXAMPLE', title: 'Illustrative task for instruction review', description: 'Synthetic task background for reviewing instruction assembly. This is not a real implementation assignment.', boardId: board.id, columnId: column.id, revision: 1, relationships: [], comments: [], activity: [sourceEvent], activations: [] },
    workspace: { path: 'C:\\audit-example\\task-workspace', startingRef: 'main', commit: 'illustrative-commit' },
    activationContext: { kind: 'initial', description: 'Synthetic task background for reviewing instruction assembly. This is not a real implementation assignment.', comments: [], activity: [sourceEvent], sourceDelivery: 'current-context', history: { records, returned: counts, remaining: zero, total: counts, nextCursor: null, projection: 'history' }, fullHistory: { total: counts, included: counts, omitted: zero }, pinChanges: { pinned: [], unpinned: [] } },
    attempt: { number: 1, precedingOutcome: null, thread: 'fresh', continuationMessage: null },
  };
  const prompt = composeActivationPrompt(request);
  await writeFile(resolve(out, `initial-${agent.id}.md`), prompt + '\n');
  markdown += `\n## ${agent.name}\n\n`;
  html += `<details ${agent.id === 'implementation-agent' ? 'open' : ''}><summary>${esc(agent.name)} — complete initial prompt</summary><div class="role">`;
  for (let i = 0; i < sections.length; i++) {
    const [heading, label, explanation] = sections[i];
    const start = prompt.indexOf(heading), end = i + 1 < sections.length ? prompt.indexOf(sections[i + 1][0], start + heading.length) : prompt.length;
    if (start < 0 || end < start) throw new Error('Missing prompt section: ' + heading);
    const content = prompt.slice(start, end).trim();
    html += `<section class="annotated">${note(label, explanation + (heading === '# Current responsibility' ? ' Source file: ' + rolePath : ''))}<article>${md(content)}</article></section>`;
    markdown += `> **Source: ${label}.** ${explanation}\n\n${content}\n\n`;
  }
  html += '</div></details>';
}
const findings = `## First discussion candidates — no wording decisions yet

- **Consultations versus unconditional movement:** Architecture Designer says to answer later consultations without taking primary responsibility, then says “move the task to Implementation.” Code Reviewer says to leave consultations in Code Review. A designer could interpret the final move as mandatory even on a consultation. We should agree which activations require movement.
- **Approved scope:** Implementation Agent says “Implement only the approved task scope.” That may discourage useful incidental fixes or necessary plan adjustments. We should define which adjustments the agent may make independently and when it should consult.
- **Git ownership and merge duty:** Merge Agent is assigned integration, while repository Git ownership reserves staging, commits and pushes to the user unless explicitly authorized. A move to Ready to Merge may not itself settle which Git actions are authorized. We should clarify the intended integration authority.
- **Continuation requirements:** Framework guidance requires an activation, waiting relationship, explicit unwatched/Completion responsibility or user attention before finishing. This is also backed by stall-recovery behavior; relaxing the sentence alone would still allow automatic recovery activations.
- **Workflow versus skill:** The implementation role requires test-first work at an agreed seam; the implement skill says use TDD where possible. Skills also end with code review while the process separates independent Code Reviewer and Architecture Verifier roles. We should decide which workflow is intended for framework-run implementers.

These are review candidates, not findings approved for changes. Ticket 12 remains open until we review the groups together and publish agreed implementation follow-ups.

## Separate runtime and context layers

- **MCP:** src/mcp/stdio-server.ts provides server instructions, operation descriptions and input schemas independently of the prompt. docs/agent-mcp-reference.md documents that contract. Mutation authorization and validation live in the coordination application; editing descriptions does not change them.
- **Runtime:** src/runtime/codex-agent-runtime.ts sets approval_policy to on-request and approvals_reviewer to auto_review, requires the coordination MCP server, selects the task working directory, and supplies model/reasoning settings. It grants attachment projection directories when attachments exist. It does not explicitly set a base sandboxMode on the thread; inherited native configuration matters.
- **Reviewer allowances:** process.yaml agents[].allowances are optional native Auto-review guidance. src/runtime/codex-reviewer-allowances.ts composes and verifies their delivery. They are not inserted into the owning agent’s prompt and do not enlarge sandbox access. The checked-in reviewer template is a separate reviewer policy, not the task agent’s initial prompt.
- **Repository guidance:** AGENTS.md and its linked documents are separate repository instructions. Actual discovery depends on the task worktree and native runtime; this audit snapshots the primary checkout only. Skill files are conditional workflow instructions, not a block automatically concatenated into composeActivationPrompt.
- **Other prompt forms:** later distinct activations in a resumed conversation use compact JSON updates. Same-activation retries normally use an Attempt continuation block. Thread replacement and process rebase restore full composition. Attachments add a Conversation attachments section; supported current-message images also become native image inputs. This example has no attachments, pins, omitted history or relationships.
`;
html += md(findings); markdown += findings;
const paths = ['AGENTS.md', 'docs/agents/issue-tracker.md', 'docs/agents/domain.md', 'docs/agents/development-workflow.md', 'docs/architecture.md', 'docs/process-definition-reference.md', 'docs/agent-mcp-reference.md', 'src/mcp/stdio-server.ts', 'src/runtime/codex-agent-runtime.ts', 'src/runtime/codex-reviewer-allowances.ts', 'src/runtime/reviewer-policy/codex-0.160.0.md'];
for (const entry of await readdir(resolve(root, '.agents/skills'), { withFileTypes: true })) {
  if (entry.isDirectory()) paths.push(`.agents/skills/${entry.name}/SKILL.md`);
}
html += '<h2>Source inventory and exact source snapshots</h2><p>Expand a source to inspect it. These snapshots are supplementary evidence, not additional text appended to the prompts above.</p>';
for (const path of paths) {
  const content = await source(path);
  const code = /\.(?:ts|yaml)$/u.test(path);
  html += `<details><summary>${esc(path)}</summary><div class="appendix">${code ? `<pre><code>${esc(content)}</code></pre>` : md(content)}</div></details>`;
}
const css = `:root{color-scheme:dark light;--bg:#12151c;--panel:#1b202a;--ink:#e3e8f0;--muted:#aab5c8;--line:#303b4e;--accent:#b8cbed}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:44px 32px 80px}header{padding-bottom:24px;border-bottom:1px solid var(--line)}h1{font-size:36px;line-height:1.2}h2{font-size:25px;margin-top:36px}h3{font-size:21px}p{margin:12px 0}.eyebrow{font-size:12px;letter-spacing:1.6px;color:var(--muted)}details{margin:18px 0;border:1px solid var(--line);border-radius:9px}summary{cursor:pointer;padding:15px 20px;color:var(--accent)}summary:hover{background:var(--panel)}summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.annotated{display:grid;grid-template-columns:270px minmax(0,1fr);gap:30px;border-top:1px solid var(--line);padding:26px}aside{font-size:13px;color:var(--muted);border-left:3px solid var(--line);padding-left:14px}aside strong{color:var(--accent)}article>:first-child{margin-top:0}pre{padding:18px;background:var(--panel);border-radius:6px;overflow:auto;max-width:100%;font-size:13px;line-height:1.6}code{font-family:Consolas,monospace;overflow-wrap:anywhere}a{color:var(--accent)}.appendix{padding:12px 26px 26px;overflow-wrap:anywhere}@media(max-width:800px){main{padding:24px 18px}.annotated{display:block;padding:20px}aside{margin-bottom:24px}}@media(prefers-color-scheme:light){:root{--bg:#fafbfd;--panel:#edf1f7;--ink:#202d40;--muted:#52627a;--line:#d0d9e7;--accent:#345981}}`;
await writeFile(resolve(out, 'agent-instruction-audit.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent instruction audit — ticket 12</title><style>${css}</style><body><main>${html}</main></body></html>`);
await writeFile(resolve(out, 'agent-instruction-audit.md'), markdown);
await writeFile(resolve(out, 'agent-instruction-audit-sources.json'), JSON.stringify({ prepared: '2026-10-04', processPath, processVersion: version, scenario: 'synthetic initial column-entry, no attachments/pins/relationships', sources: [...sources].map(([path, { sha256 }]) => ({ path, sha256 })) }, null, 2) + '\n');
console.log(`Generated five exact prompts and annotated HTML/Markdown; ${sources.size} sources snapshotted.`);
