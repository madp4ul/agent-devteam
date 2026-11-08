import type { WorkspacePreparationView } from "../../application/automation-contract.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";

export function WorkspacePreparation({ preparation }: { preparation: WorkspacePreparationView }) {
  const label = preparation.stage === "creating" ? "Creating workspace" : "Verifying workspace";
  const progress = preparation.progress;
  return <div className="workspace-preparation">
    <span role="status">{label} · {preparation.agentId}</span>
    <span className="quiet"><ElapsedTime startedAt={preparation.startedAt} /> elapsed</span>
    <span>{progress?.stage ?? label}{progress?.total === undefined ? null :
      ` · ${progress.completed} / ${progress.total}${progress.percent === undefined ? "" : ` (${progress.percent}%)`}`}</span>
    <progress aria-label={`${label}: ${progress?.stage ?? "Progress unavailable"}`}
      max={progress?.total ?? 1} {...(progress?.total === undefined ? {} : { value: progress.completed })} />
  </div>;
}
