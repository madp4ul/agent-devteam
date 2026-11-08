import type { WorkspaceProgressView } from "../automation-contract.ts";

/** Bounded incremental reader for Git's forced-progress stderr protocol. */
export class GitProgressReader {
  #pending = "";
  readonly #report: (progress: WorkspaceProgressView) => void;

  constructor(report: (progress: WorkspaceProgressView) => void) { this.#report = report; }

  write(chunk: string): void {
    const lines = (this.#pending + chunk).split(/[\r\n]/u);
    this.#pending = (lines.pop() ?? "").slice(-4096);
    for (const line of lines) this.read(line);
  }

  finish(): void { this.read(this.#pending); this.#pending = ""; }

  private read(line: string): void {
    const match = /^([A-Za-z][A-Za-z ]{0,79}):\s+(\d+)%\s+\((\d+)\/(\d+)\)/u.exec(line.trim());
    if (match === null) return;
    const percent = Number(match[2]);
    const completed = Number(match[3]);
    const total = Number(match[4]);
    if (percent > 100 || total <= 0 || completed > total || !Number.isSafeInteger(total)) return;
    this.#report({ stage: match[1]!, completed, total, percent });
  }
}
