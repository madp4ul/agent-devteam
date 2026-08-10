import { randomUUID } from "node:crypto";

export interface AgentToolScope {
  taskId: string;
  agentId: string;
  attemptId?: string;
}

export class AgentToolScopeRegistry {
  readonly #scopes = new Map<string, AgentToolScope>();

  issue(scope: AgentToolScope): string {
    const token = randomUUID();
    this.#scopes.set(token, scope);
    return token;
  }

  resolve(token: string): AgentToolScope | undefined {
    return this.#scopes.get(token);
  }

  revoke(token: string): void {
    this.#scopes.delete(token);
  }
}
