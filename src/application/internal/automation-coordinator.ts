import { runtimeFailureEvidence } from "../runtime-failure.ts";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type {
  ActiveRunView,
  ActivationView,
  AutomationClock,
  AutomationView,
  InterruptTaskResult,
  PauseAutomationResult,
  ResumeAutomationResult,
  WorkspacePreparationView,
} from "../automation-contract.ts";
import type { ProcessBoardView, StartupView } from "../process-contract.ts";
import type {
  AgentRunAgent,
  AgentRunOutcome,
  AgentRunRequest,
  AttemptTranscriptAccess,
  RuntimeStartupDiagnostic,
  RuntimeDispatchOptions,
  ProjectAllowanceSource,
} from "../runtime-contract.ts";
import type { Actor } from "../task-contract.ts";
import { GitTaskWorkspaceError, GitTaskWorkspaceManager } from "./git-task-workspace.ts";
import type { ProcessStateStore } from "./process-state-store.ts";
import type { ActiveAttemptModule } from "./active-attempt-module.ts";
import { TranscriptWriteBatch } from "./transcript-write-batch.ts";
import type { ActivityMenuStore } from "./activity-menu-store.ts";
import type { ActivationResolutionModule } from "./activation-resolution-module.ts";
import type {
  ActivationSchedulingModule,
  ClaimedActivation,
} from "./activation-scheduling-module.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { ConversationContextDeliveryModule } from "./conversation-context-delivery-module.ts";
import type { ConversationAttachmentStore } from "./conversation-attachment-store.ts";
import type { ProcessModelPricingDefinition } from "./process-definition.ts";

export interface AutomationProcessContext {
  name: string;
  guidance: string;
  definitionVersion: string;
  modelPricing: ProcessModelPricingDefinition[];
  boards: ProcessBoardView[];
  collaborators: Array<Pick<AgentRunAgent, "id" | "name" | "role" | "summary">>;
}

export interface AutomationCoordinatorOptions {
  activityMenus?: ActivityMenuStore;
  processStore: ProcessStateStore;
  taskProjections: TaskProjectionStore;
  activationScheduling: ActivationSchedulingModule;
  activeAttempts: ActiveAttemptModule;
  activationResolutions: ActivationResolutionModule;
  conversationContextDelivery: ConversationContextDeliveryModule;
  conversationAttachments: ConversationAttachmentStore;
  startup: StartupView;
  runtimeDispatch?: RuntimeDispatchOptions;
  startingRef?: string;
  processContext?: AutomationProcessContext;
  runtimeDiagnostic?(diagnostic: RuntimeStartupDiagnostic): void;
  clock?: AutomationClock;
  transcriptAccess?: AttemptTranscriptAccess;
}

interface ActiveRunControl {
  attemptId: string;
  conversationId: string | null;
  activationId: string;
  controller: AbortController;
  state: ActiveRunView["status"];
  termination?: ActiveRunView["termination"];
  retryTermination?: () => void;
  stopRequested?: boolean;
  stopIdempotencyKey?: string;
  executionStartedAt?: string;
  interruptedBy?: Actor & { kind: "user" };
  interruptIdempotencyKey?: string;
  confirmed: Promise<void>;
  confirm(): void;
  fail(error: unknown): void;
}

class WorkspacePreparationFailure extends Error {}

export class AutomationCoordinator {
  readonly #activityMenus: ActivityMenuStore | undefined;
  readonly #processStore: ProcessStateStore;
  readonly #taskProjections: TaskProjectionStore;
  readonly #activationScheduling: ActivationSchedulingModule;
  readonly #activeAttempts: ActiveAttemptModule;
  readonly #transcriptWrites: TranscriptWriteBatch;
  readonly #activationResolutions: ActivationResolutionModule;
  readonly #conversationContextDelivery: ConversationContextDeliveryModule;
  readonly #conversationAttachments: ConversationAttachmentStore;
  readonly #startup: StartupView;
  readonly #runtimeDispatch:
    | {
        agentRuntime: RuntimeDispatchOptions["agentRuntime"];
        workspaceManager: GitTaskWorkspaceManager;
        projectAllowances?: ProjectAllowanceSource;
      }
    | undefined;
  readonly #startingRef: string | undefined;
  readonly #processContext: AutomationProcessContext | undefined;
  readonly #runtimeDiagnostic: ((diagnostic: RuntimeStartupDiagnostic) => void) | undefined;
  readonly #clock: AutomationClock;
  readonly #transcriptAccess: AttemptTranscriptAccess | undefined;
  #automation: AutomationView;
  #automationWork: Promise<void> = Promise.resolve();
  #automationPumpRunning = false;
  #automationKickPending = false;
  #wakeAutomationPump: (() => void) | undefined;
  #closed = false;
  readonly #activeRuns = new Map<string, ActiveRunControl>();
  readonly #preparations = new Map<string, WorkspacePreparationView>();
  readonly #shutdownObservers = new Set<() => void>();

  constructor(options: AutomationCoordinatorOptions) {
    this.#activityMenus = options.activityMenus;
    this.#activationResolutions = options.activationResolutions;
    this.#processStore = options.processStore;
    this.#taskProjections = options.taskProjections;
    this.#activationScheduling = options.activationScheduling;
    this.#activeAttempts = options.activeAttempts;
    this.#transcriptWrites = new TranscriptWriteBatch(options.activeAttempts);
    this.#conversationContextDelivery = options.conversationContextDelivery;
    this.#conversationAttachments = options.conversationAttachments;
    this.#startup = options.startup;
    this.#automation = options.startup.automation;
    this.#runtimeDispatch =
      options.runtimeDispatch === undefined
        ? undefined
        : {
            agentRuntime: options.runtimeDispatch.agentRuntime,
            ...(options.runtimeDispatch.additionalAllowances?.trim()
              ? { projectAllowances: {
                  source: "launch-argument" as const,
                  launchId: randomUUID(),
                  projectRepositoryPath: resolve(options.runtimeDispatch.projectRepositoryPath),
                  text: options.runtimeDispatch.additionalAllowances,
                } }
              : {}),
            workspaceManager: new GitTaskWorkspaceManager(
              options.runtimeDispatch.projectRepositoryPath,
              options.runtimeDispatch.taskWorkspaceRoot,
            ),
          };
    this.#startingRef = options.startingRef;
    this.#processContext = options.processContext;
    this.#runtimeDiagnostic = options.runtimeDiagnostic;
    this.#clock = options.clock ?? systemAutomationClock;
    this.#transcriptAccess = options.transcriptAccess;
  }

  query(): AutomationView {
    return this.#automation;
  }

  queryActiveRuns(): ActiveRunView[] {
    return this.#activeAttempts.readActiveRuns().filter((run) => this.#activeRuns.has(run.taskId)).map((run) => ({
      ...run,
      activationId: this.#activeRuns.get(run.taskId)!.activationId,
      conversationId: this.#activeRuns.get(run.taskId)!.conversationId,
      status: this.#activeRuns.get(run.taskId)?.state ?? "running",
      startedAt: this.#activeRuns.get(run.taskId)?.executionStartedAt ?? run.startedAt,
      executionStarted: this.#activeRuns.get(run.taskId)?.executionStartedAt !== undefined,
      ...(this.#activeRuns.get(run.taskId)?.termination === undefined ? {} : { termination: this.#activeRuns.get(run.taskId)!.termination! }),
      interruptionRequested: this.#activeRuns.get(run.taskId)?.interruptedBy !== undefined,
      stopRequested: this.#activeRuns.get(run.taskId)?.stopRequested === true,
    }));
  }

  queryWorkspacePreparations(): WorkspacePreparationView[] {
    return [...this.#preparations.values()].map((preparation) => ({ ...preparation, ...(preparation.progress === undefined ? {} : { progress: { ...preparation.progress } }) }));
  }

  queryPreparationCapacityWait(task: { id: string; activations: ActivationView[]; suspended: boolean; hasWorkspace: boolean }): boolean {
    const head = task.activations.find((activation) => activation.status !== "completed" && activation.status !== "dismissed");
    return !this.#preparations.has(task.id) && this.#automation.state === "running" && !task.suspended &&
      head?.status === "queued" && !head.stale &&
      (head.recovery === null || (head.recovery.state === "scheduled" && Date.parse(head.recovery.dueAt) <= this.#clock.now().getTime())) &&
      !this.queryPreparationCapacity()[task.hasWorkspace ? "verification" : "creation"];
  }

  queryPreparationCapacity(): { creation: boolean; verification: boolean } {
    return {
      creation: [...this.#preparations.values()].filter(({ stage }) => stage === "creating").length < 2,
      verification: [...this.#preparations.values()].filter(({ stage }) => stage === "verifying").length < 2,
    };
  }

  async resume(beforeStart?: () => void): Promise<ResumeAutomationResult> {
    if (this.#startup.mode === "configuration-error") {
      return {
        accepted: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    if (this.#runtimeDispatch === undefined && this.#processStore.hasWatchedColumns()) {
      return { accepted: false, reason: "runtime-unavailable" };
    }
    if (this.#automation.state === "running") {
      this.kick();
      return { accepted: true, automation: this.#automation };
    }
    beforeStart?.();
    this.#processStore.resumeAutomation();
    this.#automation = { state: "running", attemptsMayStart: true };
    if (this.#automationPumpRunning) {
      this.kick();
      return { accepted: true, automation: this.#automation };
    }
    if (this.#runtimeDispatch !== undefined) {
      let markFirstDispatchStarted: (() => void) | undefined;
      const firstDispatchStarted = new Promise<void>((resolve) => {
        markFirstDispatchStarted = resolve;
      });
      this.#automationPumpRunning = true;
      this.#automationWork = this.trackPumpSettlement(this.runQueuedUntilSettled(() => markFirstDispatchStarted?.()));
      try {
        await Promise.race([firstDispatchStarted, this.#automationWork]);
      } catch (error) {
        this.#processStore.pauseAutomation();
        this.#automation = { state: "paused", attemptsMayStart: false };
        this.#automationWork = Promise.resolve();
        return {
          accepted: false,
          reason: "runtime-start-failed",
          diagnostic: error instanceof Error ? error.message : "Agent runtime dispatch failed",
        };
      }
    }
    return { accepted: true, automation: this.#automation };
  }

  async waitForIdle(): Promise<void> {
    await this.#automationWork;
  }

  async prepareShutdown(): Promise<import("../automation-contract.ts").ShutdownReadiness> {
    this.pause();
    while (true) {
      const blockedRuns = this.queryActiveRuns().filter((run) => run.status === "termination-blocked");
      if (blockedRuns.length > 0) return { ready: false, blockedRuns };
      const changed = Promise.withResolvers<void>();
      this.#shutdownObservers.add(changed.resolve);
      try {
        if (await Promise.race([this.#automationWork.then(() => true), changed.promise.then(() => false)])) return { ready: true };
      } finally { this.#shutdownObservers.delete(changed.resolve); }
    }
  }

  retryTermination(taskId: string, attemptId: string): import("../automation-contract.ts").TerminationRetryResult {
    const active = this.#activeRuns.get(taskId);
    if (!active || active.attemptId !== attemptId || !active.retryTermination || active.termination?.retryAvailable === false) return { accepted: false, reason: "not-recoverable" };
    if (active.state === "termination-blocked") {
      active.state = "cleaning-up";
      delete active.termination;
      active.retryTermination();
    }
    return { accepted: true };
  }

  pause(): PauseAutomationResult {
    this.#processStore.pauseAutomation();
    this.#automation = this.#activeRuns.size === 0 && this.#preparations.size === 0
      ? { state: "paused", attemptsMayStart: false }
      : { state: "pausing", attemptsMayStart: false };
    const wake = this.#wakeAutomationPump;
    this.#wakeAutomationPump = undefined;
    wake?.();
    return { accepted: true, automation: this.#automation };
  }

  interruptTask(
    taskId: string,
    actor: Actor & { kind: "user" },
    idempotencyKey: string,
    activationId?: string,
    stopRequested = false,
  ): InterruptTaskResult {
    const active = this.#activeRuns.get(taskId);
    if (active === undefined || (activationId !== undefined && active.activationId !== activationId)) return { accepted: false, reason: "not-running" };
    if (stopRequested) {
      active.stopRequested = true;
      active.stopIdempotencyKey ??= `stop-activation:${idempotencyKey}`;
    }
    if (active.interruptedBy !== undefined) {
      return { accepted: true, state: "interrupting", confirmed: active.confirmed };
    }
    if (active.state !== "cleaning-up" && active.state !== "termination-blocked") active.state = "interrupting";
    active.interruptedBy = actor;
    active.interruptIdempotencyKey = idempotencyKey;
    active.controller.abort();
    return { accepted: true, state: "interrupting", confirmed: active.confirmed };
  }

  kick(): void {
    if (this.#closed) return;
    if (this.#automation.state !== "running" || this.#runtimeDispatch === undefined) return;
    if (this.#automationPumpRunning) {
      this.#automationKickPending = true;
      const wake = this.#wakeAutomationPump;
      this.#wakeAutomationPump = undefined;
      wake?.();
      return;
    }
    this.#automationPumpRunning = true;
    this.#automationWork = this.trackPumpSettlement(this.runQueuedUntilSettled(() => {}));
    void this.#automationWork.catch(() => {
      if (this.#closed) return;
      this.#processStore.pauseAutomation();
      this.#automation = { state: "paused", attemptsMayStart: false };
    });
  }

  close(): void {
    this.#closed = true;
    this.#transcriptWrites.close();
    this.#automation = { state: "paused", attemptsMayStart: false };
    this.#wakeAutomationPump?.();
    this.#wakeAutomationPump = undefined;
    for (const run of this.#activeRuns.values()) run.controller.abort();
  }

  private trackPumpSettlement(work: Promise<void>): Promise<void> {
    return work.then(() => {
      this.#automationPumpRunning = false;
      // A command can arrive after the loop's final check but before this promise
      // settles. Release ownership before honoring that wakeup; kick checks intent.
      if (this.#automationKickPending) this.kick();
    }, (error: unknown) => {
      this.#automationPumpRunning = false;
      // Fatal errors must reach the pause handler without starting replacement work.
      throw error;
    });
  }

  private async runQueuedUntilSettled(onFirstDispatch: () => void): Promise<void> {
    let firstDispatch = onFirstDispatch;
    do {
      this.#automationKickPending = false;
      await this.runQueuedActivations(firstDispatch);
      firstDispatch = () => {};
    } while (this.#automationKickPending && this.#automation.state === "running");
  }

  private async runQueuedActivations(onFirstDispatch: () => void): Promise<void> {
    if (this.#runtimeDispatch === undefined) return;
    let first = true;
    let firstError: unknown;
    let preparationFailure: WorkspacePreparationFailure | undefined;
    const inFlightCompletions = new Set<Promise<void>>();
    while (!this.#closed) {
      const now = this.#clock.now();
      const claim = this.#automation.state !== "running" ? undefined : this.#activationScheduling.claimNextRunnable(
        now,
        (taskId) => this.#runtimeDispatch!.workspaceManager.pathFor(taskId),
        this.#runtimeDispatch.projectAllowances,
        this.queryPreparationCapacity(),
      );
      if (claim !== undefined) {
        const dispatch = this.dispatch(claim, () => {
          if (!first) return;
          first = false;
          onFirstDispatch();
        });
        const tracked = dispatch.then(({ completion }) => completion)
          .catch((error: unknown) => {
            if (error instanceof WorkspacePreparationFailure) preparationFailure ??= error;
            else firstError ??= error;
          })
          .finally(() => inFlightCompletions.delete(tracked));
        inFlightCompletions.add(tracked);
        continue;
      }
      const dueAt = this.#automation.state !== "running" ? undefined : [this.#activationScheduling.readNextRetryDueAt(now),
        this.#activationScheduling.readNextGraceDueAt(now)]
        .filter((value): value is string => value !== undefined).sort()[0];
      if (inFlightCompletions.size === 0 && dueAt === undefined) {
        if (firstError !== undefined) throw firstError;
        if (first && preparationFailure !== undefined) throw preparationFailure;
        return;
      }
      if (first && inFlightCompletions.size === 0 && dueAt !== undefined) { first = false; onFirstDispatch(); }
      let wake: (() => void) | undefined;
      const nextKick = new Promise<void>((resolve) => {
        wake = resolve;
        this.#wakeAutomationPump = resolve;
      });
      const waiting = new AbortController();
      try {
        await Promise.race([...inFlightCompletions, nextKick,
          ...(dueAt === undefined ? [] : [this.#clock.waitUntil(dueAt, waiting.signal)])]);
      } finally {
        waiting.abort();
      }
      if (this.#wakeAutomationPump === wake) this.#wakeAutomationPump = undefined;
      if (firstError !== undefined) {
        await Promise.all(inFlightCompletions);
        throw firstError;
      }
    }
    await Promise.all(inFlightCompletions);
    if (firstError !== undefined) throw firstError;
  }

  private async dispatch(
    claim: ClaimedActivation,
    onDispatchStarted: () => void,
  ): Promise<{ completion: Promise<void> }> {
    const runtimeDispatch = this.#runtimeDispatch;
    if (runtimeDispatch === undefined) return { completion: Promise.resolve() };
    const precedingAttempt = claim.activation.attempts.at(-1);
    const resumeThreadId = precedingAttempt?.threadId ?? claim.resumeThreadId;
    let workspace;
    const preparationId = randomUUID();
    this.#activityMenus?.startPreparation({ id: preparationId, taskId: claim.task.id,
      taskTitle: claim.task.title, agentId: claim.agent.id, startedAt: this.#clock.now().toISOString() });
    this.#preparations.set(claim.task.id, {
      taskTitle: claim.task.title,
      taskId: claim.task.id, activationId: claim.activation.id, agentId: claim.agent.id, conversationId: claim.activation.conversationId,
      stage: claim.workspace === undefined ? "creating" : "verifying", startedAt: this.#clock.now().toISOString(),
    });
    try {
      workspace = await runtimeDispatch.workspaceManager.provision(
        claim.task.id,
        this.#taskProjections.readTaskStartingRef(claim.task.id) ?? this.#startingRef ?? "",
        claim.workspace,
        (progress) => {
          const preparation = this.#preparations.get(claim.task.id);
          if (!this.#closed && preparation !== undefined) preparation.progress = { ...progress };
        },
      );
      if (!this.#closed) this.#activityMenus?.finishPreparation(preparationId, "prepared", "Workspace ready.", this.#clock.now().toISOString());
    } catch (error) {
      if (this.#closed) return { completion: Promise.resolve() };
      this.#activityMenus?.finishPreparation(preparationId, "failed", completeDiagnostic(error), this.#clock.now().toISOString());
      const failure = this.#activationScheduling.failUnstartedClaim(
        claim,
        error instanceof GitTaskWorkspaceError ? error.boundary : "workspace-preparation",
        completeDiagnostic(error),
      );
      this.#runtimeDiagnostic?.(failure);
      throw new WorkspacePreparationFailure(failure.diagnostic, { cause: error });
    } finally {
      this.#preparations.delete(claim.task.id);
      this.kick();
      if (this.#automation.state === "pausing" && this.#activeRuns.size === 0 && this.#preparations.size === 0) {
        this.#automation = { state: "paused", attemptsMayStart: false };
      }
    }
    if (this.#closed) return { completion: Promise.resolve() };
    if (this.#automation.state !== "running") {
      this.#activationScheduling.releaseUnstartedClaim(claim, workspace);
      return { completion: Promise.resolve() };
    }
    const attempt = this.#activationScheduling.startPreparedAttempt(claim, workspace, this.#clock.now());
    if (attempt === undefined) return { completion: Promise.resolve() };
    const controller = new AbortController();
    let confirmInterruption = () => {};
    let failInterruption = (_error: unknown) => {};
    const confirmed = new Promise<void>((resolve, reject) => {
      confirmInterruption = resolve;
      failInterruption = reject;
    });
    const activeRun: ActiveRunControl = {
      attemptId: attempt.id,
      conversationId: claim.activation.conversationId,
      activationId: claim.activation.id,
      controller,
      state: "starting",
      confirmed,
      confirm: confirmInterruption,
      fail: failInterruption,
    };
    this.#activeRuns.set(claim.task.id, activeRun);
    const currentTask = this.#taskProjections.readTask(claim.task.id);
    if (currentTask === undefined) throw new Error("Runnable task disappeared before dispatch");
    const process = this.#processContext;
    if (process === undefined) throw new Error("Runnable activation has no process context");
    const board = process.boards.find((candidate) => candidate.id === currentTask.boardId);
    if (board === undefined) throw new Error("Runnable task has no applied board context");
    const activationContext = this.#conversationContextDelivery.composeAndRecordActivationContext(
      claim.activation.id,
      currentTask,
    );
    let attachments: AgentRunRequest["attachments"] = [];
    let attachmentPreparationError: unknown;
    try {
      attachments = this.#conversationAttachments.prepareRuntimeAttachments(
        claim.activation.conversationId,
        claim.activation.reason.sourceEventId,
        attempt.id,
      );
    } catch (error) {
      attachmentPreparationError = error;
    }
    const pricing = claim.agent.model === undefined
      ? undefined
      : process.modelPricing.find(({ model }) => model === claim.agent.model);
    onDispatchStarted();
    let outcomePromise: Promise<AgentRunOutcome>;
    try {
      if (attachmentPreparationError !== undefined) throw attachmentPreparationError;
      outcomePromise = runtimeDispatch.agentRuntime.run(
        {
          activationId: claim.activation.id,
          attemptId: attempt.id,
          agent: claim.agent,
          ...(claim.projectAllowances === undefined ? {} : { projectAllowances: claim.projectAllowances }),
          process: {
            name: process.name,
            guidance: process.guidance,
            definitionVersion: process.definitionVersion,
          },
          board,
          collaborators: process.collaborators,
          reason: claim.activation.reason,
          sourceEvent: claim.sourceEvent,
          task: currentTask,
          workspace,
          activationContext,
          attachments,
          ...(resumeThreadId === null || resumeThreadId === undefined ? {} : { resumeThreadId }),
          attempt: {
            number: attempt.number,
            precedingOutcome: precedingAttempt?.outcome ?? null,
            thread: resumeThreadId === null || resumeThreadId === undefined ? "fresh" : "resumed",
            continuationMessage: claim.continuationMessage,
            ...(claim.fullCompositionReason === undefined
              ? {}
              : { fullCompositionReason: claim.fullCompositionReason }),
          },
        },
        {
          terminationChanged: (state, retry) => {
            activeRun.retryTermination = retry;
            activeRun.state = state.state === "blocked" ? "termination-blocked" : "cleaning-up";
            if (state.state === "blocked") activeRun.termination = { diagnostic: state.diagnostic, retryAvailable: state.retryAvailable };
            else delete activeRun.termination;
            for (const observer of this.#shutdownObservers) observer();
          },
          transcriptItemUpdated: (ordinal, item) => this.#activeAttempts.recordTranscriptItem(attempt.id, ordinal, item),
          persistTranscriptItem: (ordinal, item) => this.#transcriptWrites.enqueue(attempt.id, ordinal, item),
          reviewerPolicyConfigured: (configuration) => {
            this.#activeAttempts.recordReviewerPolicyConfigured(attempt.id, configuration);
          },
          started: (threadId) => {
            activeRun.executionStartedAt ??= this.#clock.now().toISOString();
            if (activeRun.state === "starting") activeRun.state = "running";
            if (threadId !== undefined) {
              this.#activeAttempts.recordThreadStarted(attempt.id, threadId);
            }
          },
        },
        controller.signal,
      );
    } catch (error) {
      outcomePromise = Promise.reject(error);
    }
    const completion = (async () => {
      try {
        let outcome: AgentRunOutcome;
        try {
          outcome = await outcomePromise;
        } catch (error) {
          outcome = {
            status: "failed",
            summary: error instanceof Error ? error.message : "Agent runtime dispatch failed",
            ...(runtimeFailureEvidence(error) === undefined ? {} : { failure: runtimeFailureEvidence(error)! }),
          };
        }
        if (this.#closed) {
          if (activeRun.interruptedBy !== undefined) {
            throw new Error("Application closed before interruption could be durably confirmed");
          }
          activeRun.confirm();
          return;
        }
        const transcript = this.#transcriptAccess === undefined
          ? undefined
          : await this.#transcriptAccess.read(attempt.id) ?? undefined;
        const usage = this.#transcriptAccess?.readUsage === undefined
          ? undefined
          : await this.#transcriptAccess.readUsage(attempt.id) ?? undefined;
        const contextWindowUsage = this.#transcriptAccess?.readContextWindowUsage === undefined
          ? undefined
          : await this.#transcriptAccess.readContextWindowUsage(attempt.id) ?? undefined;
        if (activeRun.interruptedBy !== undefined) {
          if (
            activeRun.interruptedBy === undefined ||
            activeRun.interruptIdempotencyKey === undefined
          ) {
            throw new Error("Interrupting attempt has incomplete initiating command context");
          }
          this.#activeAttempts.interrupt({
            attemptId: attempt.id,
            now: this.#clock.now(),
            actor: activeRun.interruptedBy,
            idempotencyKey: activeRun.interruptIdempotencyKey,
            ...(transcript === undefined ? {} : { transcript }),
            ...(usage === undefined ? {} : { usage }),
            ...(contextWindowUsage === undefined ? {} : { contextWindowUsage }),
            ...(pricing === undefined ? {} : { pricing }),
            ...(resumeThreadId === null || resumeThreadId === undefined
              ? {}
              : { resumedThreadId: resumeThreadId }),
          });
        } else {
          this.#activeAttempts.settle({
            attemptId: attempt.id,
            outcome,
            now: this.#clock.now(),
            ...(transcript === undefined ? {} : { transcript }),
            ...(usage === undefined ? {} : { usage }),
            ...(contextWindowUsage === undefined ? {} : { contextWindowUsage }),
            ...(pricing === undefined ? {} : { pricing }),
            ...(resumeThreadId === null || resumeThreadId === undefined
              ? {}
              : { resumedThreadId: resumeThreadId }),
          });
        }
        if (activeRun.stopRequested && activeRun.interruptedBy !== undefined) {
          const dismissed = this.#activationResolutions.dismissActivation({
            activationId: claim.activation.id, actor: activeRun.interruptedBy,
            idempotencyKey: activeRun.stopIdempotencyKey!,
          });
          if (!dismissed.accepted) throw new Error(`Interrupted activation could not be stopped: ${dismissed.reason}`);
        }
        this.#transcriptAccess?.release?.(attempt.id);
        activeRun.confirm();
      } catch (error) {
        if (activeRun.interruptedBy !== undefined) activeRun.fail(error);
        else activeRun.confirm();
        throw error;
      } finally {
        this.#conversationAttachments.releaseRuntimeAttachments(attempt.id);
        this.#activeRuns.delete(claim.task.id);
        if (this.#automation.state === "pausing" && this.#activeRuns.size === 0 && this.#preparations.size === 0) {
          this.#automation = { state: "paused", attemptsMayStart: false };
        }
      }
    })();
    return { completion };
  }
}

const systemAutomationClock: AutomationClock = {
  now: () => new Date(),
  waitUntil: async (instant, signal) => {
    const delay = Math.max(0, Date.parse(instant) - Date.now());
    await new Promise<void>((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, delay);
      if (signal?.aborted) finish();
      else signal?.addEventListener("abort", finish, { once: true });
    });
  },
};

function completeDiagnostic(error: unknown): string {
  if (!(error instanceof Error)) return "Task workspace startup failed";
  const causes: string[] = [error.message];
  let cause = error.cause;
  while (cause instanceof Error) {
    if (!causes.includes(cause.message)) causes.push(cause.message);
    cause = cause.cause;
  }
  return causes.join(": ");
}
