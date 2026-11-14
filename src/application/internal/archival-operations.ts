import { createHash } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import type { ArchivalOperation, ArchivalTarget, StartArchivalOperationResult } from "../archival-operation-contract.ts";
import type { ArchiveTaskCommand, ArchiveTaskResult } from "../task-contract.ts";
import type { TaskArchiveStore } from "./task-archive-store.ts";
import type { ArchivalOperationStore } from "./archival-operation-store.ts";

export class ArchivalOperations {
  #queue: Array<{ operation: ArchivalOperation; command: Omit<ArchiveTaskCommand, "taskId"> }> = [];
  #pump: Promise<void> | undefined;
  #stopping = false;
  readonly #store: ArchivalOperationStore;
  readonly #tasks: TaskArchiveStore;
  readonly #archive: (command: ArchiveTaskCommand, eligibility: "any-idle-task" | "completed-only") => Promise<ArchiveTaskResult>;

  constructor(store: ArchivalOperationStore, tasks: TaskArchiveStore, archive: (command: ArchiveTaskCommand, eligibility: "any-idle-task" | "completed-only") => Promise<ArchiveTaskResult>) {
    this.#store = store;
    this.#tasks = tasks;
    this.#archive = archive;
    for (const operation of this.#store.list(true)) this.#interrupt(operation);
  }

  start(target: ArchivalTarget, command: Omit<ArchiveTaskCommand, "taskId">): StartArchivalOperationResult {
    const id = command.idempotencyKey;
    const requestHash = createHash("sha256").update(JSON.stringify([target, command.actor, command.discardWorkspaceChanges === true,
      command.archivalPreviewToken ?? null])).digest("hex");
    const prior = this.#store.read(id);
    if (prior) return prior.requestHash === requestHash ? { accepted: true, operation: prior.operation } : { accepted: false, reason: "idempotency-conflict" };
    if (this.#stopping) return { accepted: false, reason: "shutdown-in-progress" };
    const active = this.#store.active(target);
    if (active) {
      if (active.requestHash !== requestHash) {
        return { accepted: false, reason: "archive-in-progress" };
      }
      this.#store.rememberDuplicate(id, requestHash, active.operation.id);
      return { accepted: true, operation: active.operation };
    }
    const label = this.#store.targetLabel(target);
    if (!label) return { accepted: false, reason: "not-found" };
    const tasks = target.kind === "task" ? [{ id: target.taskId, title: this.#tasks.taskTitle(target.taskId) ?? target.taskId }]
      : this.#tasks.completedTasks(target.boardId);
    const operation: ArchivalOperation = { id, target, label, state: "queued", updatedAt: new Date().toISOString(),
      tasks: tasks.map(({ id: taskId, title }) => ({ taskId, title, state: "queued" })) };
    this.#store.create(operation, requestHash);
    this.#queue.push({ operation, command });
    this.#wake();
    return { accepted: true, operation };
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    for (const { operation } of this.#queue.splice(0)) this.#interrupt(operation);
    await this.#pump;
  }

  get busy(): boolean { return this.#pump !== undefined; }

  #wake(): void {
    if (this.#pump !== undefined || this.#stopping) return;
    this.#pump = this.#run().catch((error: unknown) => {
      console.error("Could not persist archival progress", error);
    }).finally(() => {
      this.#pump = undefined;
      if (this.#queue.length > 0) this.#wake();
    });
  }

  #interrupt(operation: ArchivalOperation): void {
    operation.state = "interrupted";
    for (const task of operation.tasks) {
      if (task.state !== "running" && task.state !== "queued") continue;
      const result = task.state === "running" ? this.#tasks.readArchiveCommand(task.taskId, `${operation.id}:${task.taskId}`) : undefined;
      if (result?.accepted) task.state = "archived";
      else if (result) { task.state = "failed"; task.failure = { ...result }; }
      else { task.state = "interrupted"; task.failure = { reason: "interrupted" }; }
    }
    this.#store.update(operation, operation.tasks);
  }

  async #run(): Promise<void> {
    while (this.#queue.length > 0) {
      await setImmediate();
      const next = this.#queue.shift();
      if (!next) return;
      try { await this.#process(next.operation, next.command); }
      catch (error) {
        try { this.#interrupt(next.operation); }
        catch (recoveryError) { console.error("Could not reconcile archival progress", recoveryError); }
        console.error("Could not persist archival progress", error);
      }
    }
  }

  async #process(operation: ArchivalOperation, command: Omit<ArchiveTaskCommand, "taskId">): Promise<void> {
    operation.state = "running";
    for (const task of operation.tasks) {
      if (this.#stopping) break;
      task.state = "running";
      this.#store.update(operation, [task]);
      await setImmediate();
      if (this.#stopping) break;
      try {
        const result = await this.#archive({ ...command, taskId: task.taskId, idempotencyKey: `${operation.id}:${task.taskId}` },
          operation.target.kind === "task" ? "any-idle-task" : "completed-only");
        task.state = result.accepted ? "archived" : "failed";
        if (!result.accepted) task.failure = { ...result };
      } catch (error) {
        const receipt = this.#tasks.readArchiveCommand(task.taskId, `${operation.id}:${task.taskId}`);
        task.state = receipt?.accepted ? "archived" : "failed";
        if (!receipt?.accepted) task.failure = receipt ? { ...receipt }
          : { reason: "unexpected-archive-error", diagnostic: error instanceof Error ? error.message : String(error) };
      }
      this.#store.update(operation, [task]);
    }
    if (this.#stopping && operation.tasks.some((task) => task.state === "queued" || task.state === "running")) this.#interrupt(operation);
    else { operation.state = "completed"; this.#store.update(operation); }
  }
}
