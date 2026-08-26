import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { Readable } from "node:stream";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";

import { conversationAttachmentPolicy } from "../../src/application/conversation-attachment-policy.ts";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { ControlledAgentRuntime, createHandoffFixture } from "../support/handoff-fixture.ts";

const execFileAsync = promisify(execFile);

async function startSettledAttachmentConversation(t: TestContext, cleanup = true) {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  if (cleanup) t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Inspect conversation evidence",
    description: "Keep uploaded evidence with its authored conversation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: `create-attachment-conversation-${crypto.randomUUID()}`,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Expected the attachment conversation task to be created.");
  const conversationId = created.task.activations[0]?.conversationId;
  assert.ok(conversationId);
  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  runtime.complete({ status: "completed", summary: "Ready for evidence.", threadId: "attachment-thread" });
  await application.waitForAutomationIdle();
  return { application, conversationId, created, fixture, runtime };
}

async function uploadConversationEvidence(
  application: CoordinationApplication,
  taskId: string,
  conversationId: string,
  fileName = "evidence.txt",
  content = "durable evidence",
) {
  const uploaded = await application.createConversationUpload({
    taskId,
    conversationId,
    fileName,
    mediaType: "text/plain",
    content: Readable.from([Buffer.from(content)]),
  });
  assert.equal(uploaded.accepted, true);
  if (!uploaded.accepted) throw new Error("Expected conversation evidence to upload.");
  return uploaded.upload;
}

test("an attachment-only follow-up binds a sanitized upload for runtime delivery", async (t) => {
  const { application, conversationId, created, runtime } = await startSettledAttachmentConversation(t);
  const upload = await uploadConversationEvidence(
    application,
    created.task.id,
    conversationId,
    "..\\evidence.xlsx",
    "durable spreadsheet evidence",
  );
  const continued = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "",
    attachmentIds: [upload.id],
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-with-attachment",
  });
  assert.equal(continued.accepted, true);
  if (!continued.accepted) return;
  assert.deepEqual(continued.message.attachments, [{
    id: upload.id,
    fileName: "evidence.xlsx",
    mediaType: "text/plain",
    sizeBytes: 28,
  }]);
  const request = await runtime.waitForRequest(2);
  assert.deepEqual((request.attachments ?? []).map(({ id, fileName, currentMessage }) => ({
    id,
    fileName,
    currentMessage,
  })), [{ id: upload.id, fileName: "evidence.xlsx", currentMessage: true }]);
  assert.match(request.attachments?.[0]?.path ?? "", /evidence\.xlsx$/);
  runtime.complete({ status: "completed", summary: "Evidence inspected.", threadId: "attachment-thread" });
  await application.waitForAutomationIdle();
});

test("replaying an attachment follow-up is idempotent and leaves unrelated pending uploads disposable", async (t) => {
  const { application, conversationId, created, runtime } = await startSettledAttachmentConversation(t);
  const selected = await uploadConversationEvidence(application, created.task.id, conversationId, "selected.txt");
  const first = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Inspect the selected evidence.",
    attachmentIds: [selected.id],
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "idempotent-attachment-follow-up",
  });
  assert.equal(first.accepted, true);
  const unrelated = await uploadConversationEvidence(application, created.task.id, conversationId, "unrelated.txt");
  assert.deepEqual(application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "A changed replay must not create another message.",
    attachmentIds: [unrelated.id],
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "idempotent-attachment-follow-up",
  }), first);
  assert.equal(application.removeConversationUpload({
    taskId: created.task.id,
    conversationId,
    uploadId: unrelated.id,
  }), true);
  await runtime.waitForRequest(2);
  runtime.complete({ status: "completed", summary: "Evidence inspected.", threadId: "attachment-thread" });
  await application.waitForAutomationIdle();
});

test("a bound attachment remains downloadable after restart", async (t) => {
  const { application, conversationId, created, fixture, runtime } = await startSettledAttachmentConversation(t, false);
  const upload = await uploadConversationEvidence(
    application,
    created.task.id,
    conversationId,
    "restart-evidence.txt",
    "durable restart evidence",
  );
  const continued = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Persist this evidence.",
    attachmentIds: [upload.id],
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "persist-attachment",
  });
  assert.equal(continued.accepted, true);
  await runtime.waitForRequest(2);
  runtime.complete({ status: "completed", summary: "Evidence persisted.", threadId: "attachment-thread" });
  await application.waitForAutomationIdle();
  await application.pauseAutomation();
  application.close();

  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => restarted.close());
  const conversation = await restarted.queryAgentConversation(created.task.id, conversationId);
  assert.equal(conversation.available, true);
  if (!conversation.available) return;
  const message = conversation.conversation.history.find((entry) => entry.kind === "message");
  assert.equal(message?.kind, "message");
  if (message?.kind !== "message") return;
  assert.deepEqual(message.message.attachments, continued.accepted ? continued.message.attachments : []);
  const downloaded = restarted.readConversationAttachment({
    taskId: created.task.id,
    conversationId,
    attachmentId: upload.id,
  });
  assert.equal(downloaded.available, true);
  if (!downloaded.available) return;
  const chunks: Buffer[] = [];
  for await (const chunk of downloaded.content) chunks.push(Buffer.from(chunk));
  assert.equal(Buffer.concat(chunks).toString("utf8"), "durable restart evidence");
});

test("conversation attachments are unavailable outside their owning conversation", async (t) => {
  const { application, conversationId, created } = await startSettledAttachmentConversation(t);
  const upload = await uploadConversationEvidence(application, created.task.id, conversationId);
  await application.pauseAutomation();
  const otherTask = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Separate conversation",
    description: "Must not see another conversation's attachment.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-other-attachment-conversation",
  });
  assert.equal(otherTask.accepted, true);
  if (!otherTask.accepted) return;
  const otherConversationId = otherTask.task.activations[0]?.conversationId;
  assert.ok(otherConversationId);
  assert.deepEqual(application.readConversationAttachment({
    taskId: otherTask.task.id,
    conversationId: otherConversationId,
    attachmentId: upload.id,
  }), { available: false, reason: "not-found" });
});

test("a conversation rejects uploads beyond its attachment-count limit", async (t) => {
  const { application, conversationId, created } = await startSettledAttachmentConversation(t);
  const uploads = [];
  for (let index = 0; index < conversationAttachmentPolicy.maximumAttachments; index += 1) {
    uploads.push(await application.createConversationUpload({
      taskId: created.task.id,
      conversationId,
      fileName: `pending-${index + 1}.txt`,
      mediaType: "text/plain",
      content: Readable.from([]),
    }));
  }
  assert.equal(uploads.every(({ accepted }) => accepted), true);
  assert.deepEqual(await application.createConversationUpload({
    taskId: created.task.id,
    conversationId,
    fileName: "over-limit.txt",
    mediaType: "text/plain",
    content: Readable.from([]),
  }), { accepted: false, reason: "attachment-limit-exceeded" });
});

test("a conversation rejects a streamed upload beyond its total-byte limit", async (t) => {
  const { application, conversationId, created } = await startSettledAttachmentConversation(t);
  const chunk = Buffer.alloc(1024 * 1024);
  async function* oversizedEvidence() {
    for (
      let bytes = 0;
      bytes < conversationAttachmentPolicy.maximumTotalBytes;
      bytes += chunk.byteLength
    ) {
      yield chunk;
    }
    yield Buffer.from("x");
  }
  assert.deepEqual(await application.createConversationUpload({
    taskId: created.task.id,
    conversationId,
    fileName: "oversized-evidence.bin",
    mediaType: "application/octet-stream",
    content: Readable.from(oversizedEvidence()),
  }), { accepted: false, reason: "file-too-large" });
});

test("archiving a task removes its immutable conversation attachments", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Archive attached evidence",
    description: "Remove conversation attachments with archived detail.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-attachment-archive-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const conversationId = created.task.activations[0]?.conversationId;
  assert.ok(conversationId);

  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  runtime.complete({ status: "completed", summary: "Ready for archival evidence.", threadId: "attachment-archive-thread" });
  await application.waitForAutomationIdle();
  const uploaded = await application.createConversationUpload({
    taskId: created.task.id,
    conversationId,
    fileName: "archive-evidence.txt",
    mediaType: "text/plain",
    content: Readable.from([Buffer.from("immutable archive evidence")]),
  });
  assert.equal(uploaded.accepted, true);
  if (!uploaded.accepted) return;
  const continued = application.continueAgentConversation({
    taskId: created.task.id,
    conversationId,
    body: "Bind this evidence before archival.",
    attachmentIds: [uploaded.upload.id],
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "bind-attachment-before-archive",
  });
  assert.equal(continued.accepted, true);
  await runtime.waitForRequest(2);
  runtime.complete({ status: "completed", summary: "Evidence bound.", threadId: "attachment-archive-thread" });
  await application.waitForAutomationIdle();

  const beforeCompletion = application.queryTaskInspectionForUser(created.task.id);
  assert.equal(beforeCompletion.available, true);
  if (!beforeCompletion.available) return;
  assert.ok(beforeCompletion.task.workspace);
  await execFileAsync("git", ["-C", beforeCompletion.task.workspace.path, "switch", "-c", "durable/attachment-archive"]);
  const completed = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "completion",
    expectedRevision: beforeCompletion.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-attachment-archive-task",
  });
  assert.equal(completed.accepted, true);
  const archived = await application.archiveTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "archive-attached-evidence",
  });
  assert.equal(archived.accepted, true);
  assert.deepEqual(application.readConversationAttachment({
    taskId: created.task.id,
    conversationId,
    attachmentId: uploaded.upload.id,
  }), { available: false, reason: "not-found" });
});
