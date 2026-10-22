import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Run from the repository root. This exercises the real component without a live project.
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
let failures = 0;
try {
  const { AgentActivityPanel } = await server.ssrLoadModule('/src/web/client/AgentActivityPanel.tsx');
  for (const [automationState, taskIds] of [
    ['paused', []], ['paused', ['T-0002']], ['running', ['T-0002']], ['blocked', ['T-0002']],
  ]) {
    const state = {
      taskId: 'T-0001', automation: { state: automationState, attemptsMayStart: automationState === 'running' },
      collaborators: [], activeRun: null,
      inspection: { currentActivation: null, run: { status: 'queued' }, automationSuspended: false,
        waitingOn: { taskIds }, unresolvedAttention: [] },
      activations: [{ id: 'queued-1', targetAgentId: 'implementer', status: 'queued', stale: false,
        recovery: null, startupFailure: null, reason: { type: 'column-entry' } }],
    };
    const html = renderToStaticMarkup(React.createElement(AgentActivityPanel, {
      state, onChanged: async () => {}, onFeedback: () => {},
    }));
    const headline = html.match(/<strong>(.*?)<\/strong>/)?.[1];
    console.log(JSON.stringify({ automationState, taskIds, headline,
      hiddenPause: /<details.*Process automation is paused/.test(html) }));
    try {
      assert.doesNotMatch(html, /Waiting on T-0002/,
        'An unresolved relationship must not be listed as a queued activation blocker');
    } catch (error) {
      failures++;
      console.error(`FAIL: ${error.message}`);
    }
  }
} finally {
  await server.close();
}
process.exitCode = failures ? 1 : 0;
