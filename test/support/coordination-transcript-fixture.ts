export type CoordinationCallEvidence = {
  id?: string;
  type: "mcp_tool_call";
  server: string;
  tool: string;
  status?: string;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
};

export function coordinationCall(options: {
  id?: string;
  tool: string;
  status?: string;
  requestedFacts?: unknown;
  authoritativeFacts?: unknown;
  result?: unknown;
  error?: unknown;
  server?: string;
}): CoordinationCallEvidence {
  return {
    ...(options.id === undefined ? {} : { id: options.id }),
    type: "mcp_tool_call",
    server: options.server ?? "coordination",
    tool: options.tool,
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.requestedFacts === undefined ? {} : { arguments: options.requestedFacts }),
    ...(options.authoritativeFacts === undefined
      ? options.result === undefined ? {} : { result: options.result }
      : { result: coordinationResult(options.authoritativeFacts) }),
    ...(options.error === undefined ? {} : { error: options.error }),
  };
}

export function coordinationResult(facts: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(facts) }] };
}

export function transcriptRun(attemptId: string, taskId: string): { attemptId: string; taskId: string } {
  return { attemptId, taskId };
}
