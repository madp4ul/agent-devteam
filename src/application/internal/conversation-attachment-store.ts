import { randomUUID } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type {
  ConversationAttachmentView,
  CreateConversationUploadCommand,
  CreateConversationUploadResult,
  PendingConversationUploadView,
  ReadConversationAttachmentCommand,
  ReadConversationAttachmentResult,
} from "../conversation-contract.ts";
import type { AgentRunAttachment } from "../runtime-contract.ts";
import { conversationAttachmentPolicy } from "../conversation-attachment-policy.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";

const PENDING_UPLOAD_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1_000;
const PENDING_UPLOAD_CLEANUP_INTERVAL_MILLISECONDS = 60 * 1_000;

interface AttachmentRow {
  id: string;
  task_id: string;
  conversation_id: string;
  message_id: string;
  file_name: string;
  media_type: string;
  size_bytes: number;
  position: number;
}

interface PendingUploadRow {
  id: string;
  task_id: string;
  conversation_id: string;
  file_name: string;
  media_type: string;
  size_bytes: number;
}

export class ConversationAttachmentStore {
  readonly #database: DatabaseSync;
  readonly #root: string;
  readonly #ephemeral: boolean;
  readonly #pendingCleanupTimer: NodeJS.Timeout;
  #uploadQueue: Promise<void> = Promise.resolve();

  constructor(database: CoordinationDatabase, databasePath: string) {
    this.#database = database.connection;
    this.#ephemeral = databasePath === ":memory:";
    this.#root = this.#ephemeral
      ? mkdtempSync(join(tmpdir(), "coordination-conversation-attachments-"))
      : join(dirname(resolve(databasePath)), "conversation-attachments");
    mkdirSync(this.#root, { recursive: true });
    this.recoverStagedTaskDeletions();
    this.cleanupPendingUploads();
    this.cleanupUnreferencedContent();
    this.validateReferencedContent();
    this.cleanupArchivedTaskContent();
    rmSync(join(this.#root, "runtime"), { recursive: true, force: true });
    this.#pendingCleanupTimer = setInterval(
      () => this.cleanupExpiredPendingUploads(),
      PENDING_UPLOAD_CLEANUP_INTERVAL_MILLISECONDS,
    );
    this.#pendingCleanupTimer.unref();
  }

  async createPending(command: CreateConversationUploadCommand): Promise<CreateConversationUploadResult> {
    let release!: () => void;
    const preceding = this.#uploadQueue;
    this.#uploadQueue = new Promise<void>((resolveQueue) => { release = resolveQueue; });
    await preceding;
    try {
      return await this.createPendingExclusively(command);
    } finally {
      release();
    }
  }

  private async createPendingExclusively(command: CreateConversationUploadCommand): Promise<CreateConversationUploadResult> {
    this.cleanupExpiredPendingUploads();
    const conversation = this.#database.prepare(
      `SELECT task.archived_at
       FROM agent_conversations conversation
       JOIN tasks task ON task.id = conversation.task_id
       WHERE conversation.id = ? AND conversation.task_id = ?`,
    ).get(command.conversationId, command.taskId) as { archived_at: string | null } | undefined;
    if (conversation === undefined) return { accepted: false, reason: "not-found" };
    if (conversation.archived_at !== null) return { accepted: false, reason: "task-archived" };
    const pending = this.#database.prepare(
      "SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS size_bytes FROM pending_conversation_uploads WHERE task_id = ? AND conversation_id = ?",
    ).get(command.taskId, command.conversationId) as { count: number; size_bytes: number };
    if (pending.count >= conversationAttachmentPolicy.maximumAttachments) return { accepted: false, reason: "attachment-limit-exceeded" };

    const id = randomUUID();
    const fileName = safeBaseName(command.fileName);
    const directory = join(this.#root, "pending");
    const path = join(directory, id);
    mkdirSync(directory, { recursive: true });
    let handle;
    let sizeBytes = 0;
    try {
      handle = await open(path, "wx");
      for await (const value of command.content) {
        const chunk = Buffer.from(value);
        sizeBytes += chunk.byteLength;
        if (sizeBytes > conversationAttachmentPolicy.maximumTotalBytes) {
          await handle.close();
          handle = undefined;
          rmSync(path, { force: true });
          return { accepted: false, reason: "file-too-large" };
        }
        await handle.write(chunk);
      }
      await handle.close();
      handle = undefined;
      if (pending.size_bytes + sizeBytes > conversationAttachmentPolicy.maximumTotalBytes) {
        rmSync(path, { force: true });
        return { accepted: false, reason: "attachment-limit-exceeded" };
      }
      this.#database.prepare(
        `INSERT INTO pending_conversation_uploads
          (id, task_id, conversation_id, file_name, media_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, command.taskId, command.conversationId, fileName, command.mediaType, sizeBytes, new Date().toISOString());
      return {
        accepted: true,
        upload: { id, conversationId: command.conversationId, fileName, mediaType: command.mediaType, sizeBytes },
      };
    } catch {
      if (handle !== undefined) await handle.close().catch(() => undefined);
      rmSync(path, { force: true });
      return { accepted: false, reason: "storage-failed" };
    }
  }

  removePending(taskId: string, conversationId: string, uploadId: string): boolean {
    const removed = this.#database.prepare(
      "DELETE FROM pending_conversation_uploads WHERE id = ? AND task_id = ? AND conversation_id = ?",
    ).run(uploadId, taskId, conversationId);
    if (removed.changes !== 1) return false;
    rmSync(join(this.#root, "pending", uploadId), { force: true });
    return true;
  }

  bindPending(
    taskId: string,
    conversationId: string,
    messageId: string,
    uploadIds: string[],
  ):
    | { accepted: true; attachments: ConversationAttachmentView[] }
    | { accepted: false; reason: "invalid-attachments" | "attachment-limit-exceeded" } {
    const validation = this.validatePending(taskId, conversationId, uploadIds);
    if (!validation.accepted) return validation;
    const uploads = validation.uploads;
    const durableDirectory = join(this.#root, "content", taskId, conversationId);
    mkdirSync(durableDirectory, { recursive: true });
    for (const [position, row] of uploads.entries()) {
      const pendingPath = join(this.#root, "pending", row.id);
      const durablePath = join(durableDirectory, row.id);
      if (!existsSync(pendingPath)) return { accepted: false, reason: "invalid-attachments" };
      try {
        mkdirSync(dirname(durablePath), { recursive: true });
        // Keep the original immutable by copying into its final conversation-owned location.
        copyFileSync(pendingPath, durablePath, 1);
      } catch {
        return { accepted: false, reason: "invalid-attachments" };
      }
      this.#database.prepare(
        `INSERT INTO conversation_attachments
          (id, task_id, conversation_id, message_id, file_name, media_type, size_bytes, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(row.id, taskId, conversationId, messageId, row.file_name, row.media_type, row.size_bytes, position);
      this.#database.prepare("DELETE FROM pending_conversation_uploads WHERE id = ?").run(row.id);
    }
    return { accepted: true, attachments: uploads.map(attachmentView) };
  }

  validatePending(
    taskId: string,
    conversationId: string,
    uploadIds: string[],
  ):
    | { accepted: true; uploads: PendingUploadRow[] }
    | { accepted: false; reason: "invalid-attachments" | "attachment-limit-exceeded" } {
    this.cleanupExpiredPendingUploads();
    if (uploadIds.length > conversationAttachmentPolicy.maximumAttachments || new Set(uploadIds).size !== uploadIds.length) {
      return { accepted: false, reason: "attachment-limit-exceeded" };
    }
    const rows = uploadIds.map((id) => this.#database.prepare(
      `SELECT id, task_id, conversation_id, file_name, media_type, size_bytes
       FROM pending_conversation_uploads
       WHERE id = ? AND task_id = ? AND conversation_id = ?`,
    ).get(id, taskId, conversationId) as PendingUploadRow | undefined);
    if (rows.some((row) => row === undefined)) return { accepted: false, reason: "invalid-attachments" };
    const uploads = rows as PendingUploadRow[];
    if (uploads.reduce((sum, row) => sum + row.size_bytes, 0) > conversationAttachmentPolicy.maximumTotalBytes) {
      return { accepted: false, reason: "attachment-limit-exceeded" };
    }
    return { accepted: true, uploads };
  }

  readMessageAttachments(messageId: string): ConversationAttachmentView[] {
    return (this.#database.prepare(
      `SELECT id, task_id, conversation_id, message_id, file_name, media_type, size_bytes, position
       FROM conversation_attachments WHERE message_id = ? ORDER BY position`,
    ).all(messageId) as unknown as AttachmentRow[]).map(attachmentView);
  }

  read(command: ReadConversationAttachmentCommand): ReadConversationAttachmentResult {
    const row = this.#database.prepare(
      `SELECT id, task_id, conversation_id, message_id, file_name, media_type, size_bytes, position
       FROM conversation_attachments
       WHERE id = ? AND task_id = ? AND conversation_id = ?`,
    ).get(command.attachmentId, command.taskId, command.conversationId) as AttachmentRow | undefined;
    if (row === undefined) return { available: false, reason: "not-found" };
    const path = join(this.#root, "content", row.task_id, row.conversation_id, row.id);
    if (!existsSync(path)) return { available: false, reason: "not-found" };
    return { available: true, attachment: attachmentView(row), content: createReadStream(path) };
  }

  prepareRuntimeAttachments(
    conversationId: string | null,
    sourceMessageId: string,
    attemptId: string,
  ): AgentRunAttachment[] {
    if (conversationId === null) return [];
    const rows = this.#database.prepare(
      `SELECT attachment.id, attachment.task_id, attachment.conversation_id, attachment.message_id,
              attachment.file_name, attachment.media_type, attachment.size_bytes, attachment.position
       FROM conversation_attachments attachment
       JOIN agent_conversation_messages message ON message.id = attachment.message_id
       WHERE attachment.conversation_id = ?
       ORDER BY message.occurred_at, message.id, attachment.position`,
    ).all(conversationId) as unknown as AttachmentRow[];
    if (rows.length === 0) return [];
    const directory = join(this.#root, "runtime", attemptId);
    mkdirSync(directory, { recursive: true });
    return rows.map((row, index) => {
      const fileName = `${String(index + 1).padStart(2, "0")}-${row.id}-${safeRuntimeName(row.file_name)}`;
      const path = join(directory, fileName);
      copyFileSync(join(this.#root, "content", row.task_id, row.conversation_id, row.id), path, 1);
      return {
        ...attachmentView(row),
        messageId: row.message_id,
        path,
        currentMessage: row.message_id === sourceMessageId,
      };
    });
  }

  releaseRuntimeAttachments(attemptId: string): void {
    rmSync(join(this.#root, "runtime", attemptId), { recursive: true, force: true });
  }

  finalizePending(uploadIds: string[]): void {
    for (const uploadId of uploadIds) rmSync(join(this.#root, "pending", uploadId), { force: true });
  }

  discardDurableCopies(taskId: string, conversationId: string, attachmentIds: string[]): void {
    for (const attachmentId of attachmentIds) {
      rmSync(join(this.#root, "content", taskId, conversationId, attachmentId), { force: true });
    }
  }

  deleteTaskContent(taskId: string): void {
    rmSync(join(this.#root, "content", taskId), { recursive: true, force: true });
  }

  stageTaskContentDeletion(taskId: string): { commit(): void; rollback(): void } {
    const source = join(this.#root, "content", taskId);
    const staged = join(this.#root, "deleting", taskId);
    if (!existsSync(source)) return { commit() {}, rollback() {} };
    mkdirSync(dirname(staged), { recursive: true });
    rmSync(staged, { recursive: true, force: true });
    renameSync(source, staged);
    return {
      commit: () => rmSync(staged, { recursive: true, force: true }),
      rollback: () => {
        if (!existsSync(staged)) return;
        mkdirSync(dirname(source), { recursive: true });
        renameSync(staged, source);
      },
    };
  }

  close(): void {
    clearInterval(this.#pendingCleanupTimer);
    if (this.#ephemeral) rmSync(this.#root, { recursive: true, force: true });
  }

  private cleanupPendingUploads(): void {
    this.#database.prepare("DELETE FROM pending_conversation_uploads").run();
    rmSync(join(this.#root, "pending"), { recursive: true, force: true });
  }

  private cleanupExpiredPendingUploads(): void {
    const expiresBefore = new Date(Date.now() - PENDING_UPLOAD_LIFETIME_MILLISECONDS).toISOString();
    const expired = this.#database.prepare(
      "SELECT id FROM pending_conversation_uploads WHERE created_at < ?",
    ).all(expiresBefore) as Array<{ id: string }>;
    this.#database.prepare("DELETE FROM pending_conversation_uploads WHERE created_at < ?").run(expiresBefore);
    for (const { id } of expired) rmSync(join(this.#root, "pending", id), { force: true });
  }

  private recoverStagedTaskDeletions(): void {
    const deletingRoot = join(this.#root, "deleting");
    if (!existsSync(deletingRoot)) return;
    for (const task of readdirSync(deletingRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const archived = this.#database.prepare("SELECT archived_at FROM tasks WHERE id = ?").get(task.name) as { archived_at: string | null } | undefined;
      const staged = join(deletingRoot, task.name);
      if (archived?.archived_at !== null && archived !== undefined) {
        rmSync(staged, { recursive: true, force: true });
        continue;
      }
      const source = join(this.#root, "content", task.name);
      if (!existsSync(source)) {
        mkdirSync(dirname(source), { recursive: true });
        renameSync(staged, source);
      } else {
        rmSync(staged, { recursive: true, force: true });
      }
    }
  }

  private cleanupUnreferencedContent(): void {
    const contentRoot = join(this.#root, "content");
    if (!existsSync(contentRoot)) return;
    const referenced = new Set((this.#database.prepare("SELECT id FROM conversation_attachments").all() as Array<{ id: string }>).map(({ id }) => id));
    for (const task of readdirSync(contentRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const taskPath = join(contentRoot, task.name);
      for (const conversation of readdirSync(taskPath, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
        const conversationPath = join(taskPath, conversation.name);
        for (const attachment of readdirSync(conversationPath, { withFileTypes: true }).filter((entry) => entry.isFile())) {
          if (!referenced.has(attachment.name)) rmSync(join(conversationPath, attachment.name), { force: true });
        }
      }
    }
  }

  private cleanupArchivedTaskContent(): void {
    const archivedTaskIds = this.#database.prepare("SELECT id FROM tasks WHERE archived_at IS NOT NULL").all() as Array<{ id: string }>;
    for (const { id } of archivedTaskIds) this.deleteTaskContent(id);
  }

  private validateReferencedContent(): void {
    const rows = this.#database.prepare(
      "SELECT id, task_id, conversation_id FROM conversation_attachments",
    ).all() as Array<{ id: string; task_id: string; conversation_id: string }>;
    const missing = rows.find((row) => !existsSync(join(this.#root, "content", row.task_id, row.conversation_id, row.id)));
    if (missing !== undefined) throw new Error(`Conversation attachment content is missing for ${missing.id}`);
  }
}

function attachmentView(row: Pick<PendingUploadRow, "id" | "file_name" | "media_type" | "size_bytes">): ConversationAttachmentView {
  return { id: row.id, fileName: row.file_name, mediaType: row.media_type, sizeBytes: row.size_bytes };
}

function safeBaseName(value: string): string {
  const normalized = basename(value.replaceAll("\\", "/")).trim();
  return normalized.length === 0 || normalized === "." || normalized === ".." ? "attachment" : normalized;
}

function safeRuntimeName(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  if (sanitized.length <= 120) return sanitized;
  const extension = extname(sanitized).slice(0, 20);
  return `${sanitized.slice(0, 120 - extension.length)}${extension}`;
}
