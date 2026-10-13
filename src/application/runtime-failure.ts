import type { RuntimeFailureEvidence } from "./runtime-contract.ts";

export type TransientFailureKind = "connection-lost" | "service-unavailable" | "budget-exhausted";
export interface TransientRuntimeFailure { kind: TransientFailureKind; diagnostic: string; dueAt: string; code?: string }

const connectionCodes = new Set(["econnreset", "econnrefused", "etimedout", "connection_lost", "connection_reset", "reconnect_exhausted", "reconnect_attempts_exhausted", "network_error"]);
const serviceCodes = new Set(["service_unavailable", "server_overloaded", "internal_server_error", "bad_gateway", "gateway_timeout"]);
const budgetCodes = new Set(["usage_limit_reached", "usage_limit_exceeded", "message_limit_exceeded", "message_budget_exhausted", "codex_message_budget_exhausted"]);

/** Conservative deterministic policy; ambiguous/authentication/billing evidence stays ordinary. */
export function classifyRuntimeFailure(summary: string, evidence: RuntimeFailureEvidence | undefined, now: Date): TransientRuntimeFailure | undefined {
  const code = evidence?.code?.toLowerCase();
  if (evidence?.statusCode === 401 || evidence?.statusCode === 403 || /permission denied|unauthori[sz]ed|authentication|invalid api key|billing|payment required|insufficient[_ ](?:quota|credits)|credit balance|account suspended/iu.test(`${code ?? ""} ${summary}`.replaceAll("_", " "))) return undefined;
  const kind = code !== undefined && connectionCodes.has(code) ? "connection-lost"
    : code !== undefined && budgetCodes.has(code) ? "budget-exhausted"
    : (code !== undefined && serviceCodes.has(code)) || [502, 503, 504].includes(evidence?.statusCode ?? 0) ? "service-unavailable"
    : /(?:hit|reached|exhausted).{0,35}(?:usage|message).{0,30}(?:limit|budget)|message budget (?:exhausted|exceeded)|codex usage limit|usage limit (?:reached|exceeded)/iu.test(summary) ? "budget-exhausted"
    : /connection (?:lost|reset|closed|terminated)|econnreset|econnrefused|etimedout|network (?:error|timeout)|(?:exhausted|failed).{0,15}reconnect|reconnect(?:ion)? attempts? (?:exhausted|failed)|stream (?:disconnected|ended before turn\.completed)|websocket.{0,20}(?:closed|disconnected)/iu.test(summary) ? "connection-lost"
    : /temporarily unavailable|temporary service|service unavailable|server overloaded|bad gateway|gateway timeout|(?:http|status).{0,8}(?:502|503|504)/iu.test(summary) ? "service-unavailable" : undefined;
  if (kind === undefined) return undefined;
  const explicit = evidence?.retryAt === undefined || !/(?:Z|[+-]\d\d:\d\d)$/u.test(evidence.retryAt) ? Number.NaN : Date.parse(evidence.retryAt);
  const relative = evidence?.retryAfterSeconds === undefined || evidence.retryAfterSeconds <= 0 || evidence.retryAfterSeconds > 31_536_000 ? Number.NaN : now.getTime() + evidence.retryAfterSeconds * 1000;
  const due = Number.isFinite(explicit) && explicit > now.getTime() ? explicit
    : Number.isFinite(relative) && relative > now.getTime() ? relative : now.getTime() + 60_000;
  return { kind, diagnostic: summary.slice(0, 2048), dueAt: new Date(due).toISOString(), ...(code === undefined ? {} : { code }) };
}

/** Adapt only explicit scalar envelope facts, never infer a reset from an ambiguous local time. */
export function runtimeFailureEvidence(value: unknown): RuntimeFailureEvidence | undefined {
  const queue: unknown[] = [value];
  const records: Record<string, unknown>[] = [];
  for (let i = 0; i < queue.length && i < 8; i++) {
    const item = queue[i];
    if (typeof item !== "object" || item === null || records.includes(item as Record<string, unknown>)) continue;
    const record = item as Record<string, unknown>; records.push(record);
    queue.push(...[record.error, record.data, record.cause, record.response].filter((child) => typeof child === "object" && child !== null));
  }
  const field = (...names: string[]): unknown => {
    for (const record of records) for (const name of names) if (record[name] !== undefined) return record[name];
    return undefined;
  };
  const code = field("code", "error_code");
  const status = field("statusCode", "status_code", "status");
  const reset = field("retryAt", "resetAt", "retry_at", "reset_at", "resets_at", "next_reset_at");
  let retryAt: string | undefined;
  if (typeof reset === "number" && Number.isFinite(reset)) {
    const date = new Date(reset < 100_000_000_000 ? reset * 1000 : reset);
    if (Number.isFinite(date.getTime())) retryAt = date.toISOString();
  } else if (typeof reset === "string" && /(?:Z|[+-]\d\d:\d\d)$/u.test(reset) && Number.isFinite(Date.parse(reset))) retryAt = new Date(reset).toISOString();
  const after = field("retryAfterSeconds", "retry_after_seconds", "retry_after");
  const seconds = typeof after === "number" || typeof after === "string" ? Number(after) : Number.NaN;
  const evidence: RuntimeFailureEvidence = {
    ...(typeof code === "string" ? { code: code.slice(0, 128) } : {}),
    ...(typeof status === "number" && Number.isSafeInteger(status) ? { statusCode: status } : {}),
    ...(retryAt === undefined ? {} : { retryAt }),
    ...(Number.isFinite(seconds) && seconds > 0 && seconds <= 31_536_000 ? { retryAfterSeconds: seconds } : {}),
  };
  return Object.keys(evidence).length === 0 ? undefined : evidence;
}
