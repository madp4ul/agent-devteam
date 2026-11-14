import { useEffect, useRef, useState } from "react";
import type { TaskArchivalPreview } from "../../application/browser-transport-contract.ts";
import { ApiError, openArchivalWorktree, readTaskArchivalPreview } from "./api.ts";
import { archivalRequestIdentity, archiveTaskWithProgress, forgetArchivalRequest } from "./archival-operations.tsx";
import { errorMessage } from "./feedback.ts";
import { Modal } from "./Modal.tsx";
import { WorkspaceGitSummary } from "./TaskWorkspacePanel.tsx";

export function ArchivalReviewDialog({ taskId, onClose, onArchived }: {
  taskId: string; onClose: () => void; onArchived: () => void;
}) {
  const [preview, setPreview] = useState<TaskArchivalPreview>();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const requestId = useRef<string | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void readTaskArchivalPreview(taskId).then((value) => { if (current) setPreview(value); })
      .catch((error) => { if (current) setMessage(errorMessage(error)); });
    return () => { current = false; };
  }, [taskId]);
  const proceed = async () => {
    if (!preview?.token) return;
    const scope = `task:${taskId}:reviewed`;
    setPending(true);
    try {
      await archiveTaskWithProgress(taskId, requestId.current ??= archivalRequestIdentity(scope), true, preview.token);
      forgetArchivalRequest(scope);
      onArchived(); onClose();
    } catch (error) {
      setMessage(errorMessage(error));
      if (!(error instanceof ApiError) || error.status >= 500) return;
      requestId.current = undefined;
      forgetArchivalRequest(scope);
      setPreview(undefined);
      try { setPreview(await readTaskArchivalPreview(taskId)); }
      catch (refreshError) { setMessage(`${errorMessage(error)} ${errorMessage(refreshError)}`); }
    } finally { setPending(false); }
  };
  return <Modal labelledBy="archival-review-title" className="archival-review" onClose={() => { if (!pending) onClose(); }}>
    <h2 id="archival-review-title">Review workspace deletion</h2>
    <p>Proceed permanently deletes the task workspace and every nested worktree below, including staged,
      unstaged, untracked and ignored files, and archives the task and its transcripts. Branches are retained.
      Deleted files cannot be rolled back.</p>
    <p className="quiet">Inspect or preserve evidence before proceeding. Remote comparisons use local tracking refs;
      no fetch is performed. Stop external writers before deletion.</p>
    {message ? <p role="alert">{message}</p> : null}
    {preview === undefined ? <p role="status">{message === undefined ? "Inspecting workspace contents…" : "Preview unavailable. Abort and retry after inspecting the workspace."}</p> : preview.worktrees.map((entry) =>
      <section className="archival-worktree" key={entry.path} aria-label={`${entry.parent ? "Task" : "Nested"} workspace ${entry.path}`}>
        <h3>{entry.parent ? "Task workspace" : "Nested worktree"}</h3><code className="archival-path">{entry.path}</code>
        {entry.diagnostic ? <p role="alert">Inspection unavailable: {entry.diagnostic}</p> : <>
          <WorkspaceGitSummary startingCommit="" state={entry.state} unavailable={false} />
          <p>{entry.ignoredFiles} ignored/generated files will also be deleted.</p>
          <p>{entry.durableHead ? "HEAD is reachable from a named ref." : "No durable named ref contains HEAD; deleting this checkout may lose these commits."}</p>
          <p>{entry.upstream.kind === "none" ? "No upstream: unpushed commits cannot be determined."
            : entry.upstream.kind === "unknown" ? "Upstream comparison unavailable; remote safety is unknown."
            : `${entry.upstream.ahead} unpushed commits; ${entry.upstream.behind} behind ${entry.upstream.name} (local tracking information).`}</p>
        </>}
          <div className="workspace-actions">
            {(["folder", "vscode"] as const).map((target) => <button key={target} className="secondary" disabled={pending || !entry.canOpen}
              onClick={() => { void openArchivalWorktree(taskId, entry.path, target)
                .then(() => setMessage(`Open request sent for ${entry.path}.`)).catch((error) => setMessage(errorMessage(error))); }}>
              {target === "folder" ? "Open in File Explorer" : "Open in Visual Studio Code"}
            </button>)}
          </div>
      </section>)}
    {preview?.token === null ? <p role="alert">Review the inspection errors above. Open the affected workspace to correct them, then request a fresh preview.</p> : null}
    <div className="form-actions">
      <button className="secondary" disabled={pending} onClick={onClose}>Abort</button>
      <button className="destructive" disabled={pending || !preview?.token} onClick={() => void proceed()}>{pending ? "Archiving…" : "Proceed"}</button>
    </div>
  </Modal>;
}
