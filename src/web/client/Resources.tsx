import { OperationFeedback, useOperationFeedback } from "./OperationFeedback.tsx";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { ResourceClaimView, ResourceView } from "../../application/resource-contract.ts";
import type { Navigate, NavigationState } from "./navigation.ts";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";
import { archiveResource, readResource, readResources, saveResource } from "./resource-api.ts";
import { readBoard, type BrowserBoardState } from "./api.ts";
import { AutomationControls } from "./AutomationControls.tsx";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import { errorMessage, type Feedback } from "./feedback.ts";
import { Modal } from "./Modal.tsx";
import { PlusIcon } from "./PlusIcon.tsx";
import { TaskHeaderTitle } from "./TaskHeaderTitle.tsx";
import { TextPreview } from "./TextPreview.tsx";
import { usePageTitle } from "./page-title.ts";

export function ResourceRow({ navigate, includeArchived, onLoaded, onStrip, onStripScroll }: {
  navigate: Navigate;
  includeArchived: boolean;
  onLoaded?(): void;
  onStrip?(element: HTMLDivElement | null): void;
  onStripScroll?(position: number): void;
}): ReactNode {
  const [resources, setResources] = useState<ResourceView[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const refresh = useLatestRefresh(() => readResources(includeArchived), result => {
    setResources(result); setError(""); onLoaded?.();
  });
  const reportError = (error: unknown): void => { setError(String(error)); onLoaded?.(); };
  useEffect(() => { void refresh().catch(reportError); }, [refresh, includeArchived]);
  usePolling(refresh, 5000, reportError);
  return <section className="resource-overview" aria-labelledby="resources-heading">
    <header className="column-header">
      <div className="column-heading">
        <div><h2 id="resources-heading">Shared resources</h2></div>
        <span className="task-count" aria-label={`${resources.length} resources`}>{resources.length}</span>
        <button className="row-create" aria-label="Create resource" title="Create resource" onClick={() => setCreating(true)}><PlusIcon /></button>
      </div>
    </header>
    <div className="resource-overview-content">
      {error && <p role="alert">{error}</p>}
      <div className="resource-cards" ref={onStrip} onScroll={event => onStripScroll?.(event.currentTarget.scrollLeft)} tabIndex={0} aria-label="Shared resource cards">
        {resources.map(resource => <a className={`task-card resource-card${resource.archived ? " archived" : ""}`} key={resource.id} href={`/resources/${resource.id}`} onClick={event => {
          if (isPlainClick(event)) { event.preventDefault(); navigate(`/resources/${resource.id}`); }
        }}>
          <span className="task-id">{resource.id}</span><strong className="card-title">{resource.title}</strong>
          <div className="resource-card-signals">
            {resource.archived ? <span className="signal">Archived</span> : <span className={`signal${resource.owner ? " running" : ""}`}>{resource.owner ? `Held by ${resource.owner.taskId}` : "Available"}</span>}
            {resource.queue.length > 0 && <span className="signal waiting">{resource.queue.length} waiting</span>}
          </div>
        </a>)}
        {resources.length === 0 && <p className="resource-empty">No shared resources.</p>}
      </div>
    </div>
    {creating && <ResourceEditor onClose={() => setCreating(false)} onSaved={resource => navigate(`/resources/${resource.id}`)} />}
  </section>;
}

export function ResourcePage({ resourceId, navigate, notifications }: {
  resourceId: string;
  navigate: Navigate;
  notifications: DesktopNotificationControl;
}): ReactNode {
  const [resource, setResource] = useState<ResourceView>();
  const [board, setBoard] = useState<BrowserBoardState>();
  const feedback = useOperationFeedback(resourceId);
  const { setFeedback } = feedback;
  const refreshControls = useLatestRefresh(readBoard, setBoard);
  const reportControlsError = (error: unknown): void => setFeedback({ role: "alert", text: errorMessage(error) });
  useEffect(() => { void refreshControls().catch(reportControlsError); }, [refreshControls]);
  usePolling(refreshControls, board?.automation.state === "running" || board?.automation.state === "pausing" ? 1000 : 5000, reportControlsError);
  const processImpact = board?.startup.mode === "paused" ? board.startup.processImpact : undefined;
  const [editing, setEditing] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [archiveKey] = useState(() => crypto.randomUUID());
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const refresh = useLatestRefresh(() => readResource(resourceId), (next) => { setResource(next); setLoadFailed(false); });
  useEffect(() => { void refresh().catch(error => { setLoadFailed(true); reportControlsError(error); }); }, [refresh]);
  usePolling(refresh, 5000, error => { setLoadFailed(true); reportControlsError(error); });
  usePageTitle(resource ? `${resource.title} (${resource.id})` : "Shared resource");
  const back = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    const navigation = window.history.state as NavigationState | null;
    if (navigation?.returnToBoard) window.history.back();
    else navigate("/", navigation?.boardContext ? { boardContext: navigation.boardContext } : undefined);
  };
  return <div className="app-shell task-shell">
    <header className="topbar detail-topbar">
      <div className="task-header-context">
        <a href="/" className="back-link" onClick={back}>Back to board</a>
        {resource && <TaskHeaderTitle key={resource.id} title={resource.title} headingRef={headingRef} />}
      </div>
      <AutomationControls automation={board?.automation ?? { state: "blocked", attemptsMayStart: false }} activeRuns={board?.activeRuns ?? []}
        workspacePreparations={board?.workspacePreparations ?? []} notifications={notifications}
        canResume={(processImpact?.staleActivations.length ?? 0) === 0 &&
          (processImpact?.unavailableResumeAssignments.length ?? 0) === 0 &&
          (processImpact?.unavailableResourceAssignments?.length ?? 0) === 0}
        onChanged={refreshControls} onFeedback={setFeedback} />
    </header>
    <main className="task-detail resource-detail">
      <OperationFeedback {...feedback} />
      {resource ? <>
        <section className="task-overview">
          <div className="task-hero"><div className="task-heading">
            <p className="eyebrow">{resource.id}{resource.archived ? " · Archived" : ""}</p>
            <h1 ref={headingRef}>{resource.title}</h1>
          </div></div>
        </section>
        <div className="detail-primary-column resource-detail-panels">
          <section className="detail-panel task-description" aria-labelledby="resource-description-heading">
            <div className="detail-panel-heading">
              <h2 id="resource-description-heading">Description</h2>
              {!resource.archived && <div className="task-actions">
                <button className="secondary" onClick={() => setEditing(true)}>Edit resource</button>
                <details className="more-actions"><summary>More actions</summary>
                  <button className="secondary" disabled={pending} onClick={() => {
                    setPending(true);
                    void archiveResource(resource, archiveKey).then(setResource).catch(reportControlsError).finally(() => setPending(false));
                  }}>{pending ? "Archiving…" : "Archive resource"}</button>
                </details>
              </div>}
            </div>
            {resource.description ? <TextPreview id={`resource-description-${resource.id}`} text={resource.description}
              expanded={descriptionExpanded} onExpanded={setDescriptionExpanded} className="task-description-prose"
              markdownClassName="description" renderedLineLimit={15} /> : <p className="quiet">No description.</p>}
          </section>
          <section className="detail-panel resource-claims" aria-labelledby="resource-claims-heading">
            <h2 id="resource-claims-heading">Resource claims</h2>
            {resource.owner ? <div className="activity-current resource-current-holder">
              <ResourceClaimTask claim={resource.owner} navigate={navigate} />
              <span className="signal claimed">Claimed</span>
            </div> : <p className="quiet">{resource.archived ? "This resource is archived." : "Available · no current holder."}</p>}
            <div className="activation-queue resource-claim-queue">
              <h3>Waiting queue</h3>
              {resource.queue.length === 0 ? <p className="quiet">No pending claims.</p> : <ol>{resource.queue.map(claim => <li key={claim.id}>
                <ResourceClaimTask claim={claim} navigate={navigate} />
              </li>)}</ol>}
            </div>
          </section>
        </div>
        {editing && <ResourceEditor resource={resource} onClose={() => setEditing(false)} onSaved={saved => { setResource(saved); setEditing(false); }} />}
      </> : !loadFailed && <p>Loading resource…</p>}
    </main>
  </div>;
}

function ResourceClaimTask({ claim, navigate }: { claim: ResourceClaimView; navigate: Navigate }): ReactNode {
  return <div className="resource-claim-entry">
    <DetailLink href={`/tasks/${encodeURIComponent(claim.taskId)}`} navigate={navigate}>{claim.taskTitle}</DetailLink>
    <span className="relationship-context">{claim.taskId} · Requested by {claim.requestingAgentName}</span>
  </div>;
}

export function TaskResourcesPanel({ claims, navigate }: { claims: ResourceClaimView[]; navigate: Navigate }): ReactNode {
  if (claims.length === 0) return null;
  return <section className="detail-panel task-resources" aria-labelledby="task-resources-heading">
    <h2 id="task-resources-heading">Shared resources</h2>
    <ul className="relationship-list">{claims.map(claim => <li className="relationship-row resource-relationship-row" key={claim.id}>
      <div>
        <span className="relationship-title"><DetailLink href={`/resources/${encodeURIComponent(claim.resourceId)}`} navigate={navigate}>{claim.resourceTitle}</DetailLink></span>
      </div>
      <span className={`signal ${claim.status === "held" ? "claimed" : "waiting"}`}>{claim.status === "held" ? "Claimed" : "Waiting on"}</span>
      <span className="relationship-context">{claim.resourceId} · Requested by {claim.requestingAgentName}</span>
    </li>)}</ul>
  </section>;
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}

function DetailLink({ href, navigate, children }: { href: string; navigate: Navigate; children: ReactNode }): ReactNode {
  return <a href={href} onClick={event => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    const context = (window.history.state as NavigationState | null)?.boardContext;
    navigate(href, context ? { boardContext: context } : undefined);
  }}>{children}</a>;
}
function ResourceEditor({ resource, onClose, onSaved }: { resource?: ResourceView; onClose(): void; onSaved(resource: ResourceView): void }): ReactNode {
  const [title, setTitle] = useState(resource?.title ?? "");
  const [description, setDescription] = useState(resource?.description ?? "");
  // Keep the revision captured when editing began, so polling cannot overwrite a concurrent edit.
  const [original] = useState(resource);
  const retry = useRef({ payload: "", key: crypto.randomUUID() });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return <Modal labelledBy="resource-editor-heading" className="resource-editor" onClose={onClose}>
    <h2 id="resource-editor-heading">{resource ? "Edit resource" : "New resource"}</h2>
    <form onSubmit={event => {
      event.preventDefault(); setPending(true); setError("");
      const payload = JSON.stringify({ title, description });
      if (retry.current.payload !== payload) retry.current = { payload, key: crypto.randomUUID() };
      void saveResource({ title, description }, original, retry.current.key).then(onSaved).catch(error => setError(String(error))).finally(() => setPending(false));
    }}>
      <label>Resource title<input required value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Resource description<textarea rows={5} value={description} onChange={event => setDescription(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="resource-actions"><button disabled={pending || !title.trim()} type="submit">{resource ? "Save resource" : "Create resource"}</button><button type="button" className="secondary" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>;
}


