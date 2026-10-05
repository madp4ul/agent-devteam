import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AgentRunRequest, ReviewerPolicyConfiguration } from "../application/runtime-contract.ts";
import { inspectNativeReviewerPolicy } from "./native-reviewer-policy-inspector.ts";

export interface NativeReviewerPolicyState {
  version: string;
  config: Record<string, unknown>;
  requirements: unknown;
  templates: string[];
}

export interface ReviewerAllowancePreparation {
  configuration: ReviewerPolicyConfiguration;
  config?: { auto_review: { extra_policy: string; experimental_policy_template?: string } };
}

/** Optional native integration: unsupported policy composition leaves baseline execution intact. */
export class CodexReviewerAllowances {
  readonly #inspect: (request: AgentRunRequest, signal?: AbortSignal) => Promise<NativeReviewerPolicyState>;

  constructor(inspect = inspectNativeReviewerPolicy) {
    this.#inspect = inspect;
  }

  async prepare(request: AgentRunRequest, signal?: AbortSignal): Promise<ReviewerAllowancePreparation> {
    try {
      const state = await this.#inspect(request, signal);
      if (state.version !== "0.160.0") return unavailable("Codex version has not been verified for additional reviewer policy.");
      // Managed policy takes precedence. Do not sidestep it through a different policy field.
      if (state.requirements != null) return unavailable("Managed requirements prevent verified additional-policy composition.");
      if ((state.config.model_provider != null && state.config.model_provider !== "openai") || state.config.model_catalog_json != null) {
        return unavailable("Reviewer selection has not been verified for this model provider or catalog.");
      }
      const autoReview = state.config.auto_review;
      if (autoReview != null && (typeof autoReview !== "object" || Array.isArray(autoReview))) {
        return unavailable("Additional reviewer policy configuration has an unsupported shape.");
      }
      const inherited = (autoReview ?? {}) as Record<string, unknown>;
      if (inherited.extra_policy != null && typeof inherited.extra_policy !== "string") {
        return unavailable("Inherited additional reviewer guidance cannot be preserved.");
      }
      if (inherited.experimental_policy_template != null && typeof inherited.experimental_policy_template !== "string") {
        return unavailable("Inherited reviewer template cannot be inspected.");
      }
      const template = (await readFile(new URL("./reviewer-policy/codex-0.160.0.md", import.meta.url), "utf8"))
        .replaceAll("\r\n", "\n");
      const withoutSlot = template.replace("\n{{ extra_policy }}\n", "");
      if (hash(withoutSlot) !== "f47fbb2bdba5e7528bfae7f5e2844a7d45a3a922fa74b718f22b22917376cfcf") {
        return unavailable("Bundled reviewer compatibility template failed verification.");
      }
      const templates = typeof inherited.experimental_policy_template === "string"
        ? [inherited.experimental_policy_template] : state.templates;
      if (templates.length === 0) return unavailable("No verified reviewer template is available.");
      const normalized = templates.map((value) => value.replaceAll("\r\n", "\n"));
      // Restrict the repair to the exact complete policy verified by the native probe.
      // Unknown or changed policies remain untouched, even when they appear to contain a slot.
      if (normalized.some((value) => value !== template && value !== withoutSlot)) {
        return unavailable("Reviewer template changed; additional-policy delivery needs verification.");
      }
      const guidance = (request.agent.allowances?.length ?? 0) === 0 ? undefined : [
        "## User-authorized process agent allowances",
        `Applied process version: ${request.process.definitionVersion}`,
        `Agent: ${request.agent.id}`,
        "The user authorizes the following work within its stated scope. Apply the existing reviewer policy and independent restrictions.",
        JSON.stringify(request.agent.allowances ?? []),
      ].join("\n");
      const project = request.projectAllowances;
      const projectGuidance = !project?.text.trim() ? undefined : [
        "## User-authorized project launch allowances",
        `Source: --additional-allowances; launch ${project.launchId}`,
        `Project repository: ${JSON.stringify(project.projectRepositoryPath)}`,
        "The user authorizes the following work within its stated scope. Apply the existing reviewer policy and independent restrictions.",
        JSON.stringify(project.text),
      ].join("\n");
      const extraPolicy = [inherited.extra_policy, guidance, projectGuidance]
        .filter((value) => value !== undefined && value !== "").join("\n\n");
      const repair = normalized.some((value) => value === withoutSlot);
      return {
        configuration: { status: "active", policyHash: hash(extraPolicy), templateHash: hash(template),
          preparedPolicy: { nativeVersion: state.version, workspacePath: request.workspace.path,
            inheritedExtraPolicy: (inherited.extra_policy as string | undefined) ?? "", extraPolicy } },
        config: { auto_review: { extra_policy: extraPolicy,
          ...(repair ? { experimental_policy_template: template } : {}) } },
      };
    } catch {
      if (signal?.aborted) throw signal.reason ?? new Error("Agent run interrupted");
      return unavailable("Native additional reviewer policy could not be verified; using baseline approval behavior.");
    }
  }
}

function unavailable(reason: string): ReviewerAllowancePreparation {
  return { configuration: { status: "unavailable", reason } };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
