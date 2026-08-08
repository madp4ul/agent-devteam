import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ModelReasoningEffort } from "@openai/codex-sdk";
import {
  isNode,
  LineCounter,
  parseDocument,
  type Document,
  type ParsedNode,
} from "yaml";

import type { ProcessDiagnostic } from "../coordination-contract.ts";

export interface ProcessAgentDefinition {
  id: string;
  name: string;
  role: string;
  summary: string;
  instructions: string;
  model?: string;
  reasoningEffort?: ModelReasoningEffort;
}

export interface ProcessColumnDefinition {
  id: string;
  name: string;
  watchingAgent?: string;
}

export interface ProcessBoardDefinition {
  id: string;
  name: string;
  guidance: string;
  columns: ProcessColumnDefinition[];
}

export interface ProcessDefinition {
  schemaVersion: 1;
  name: string;
  defaultTaskWorkspaceStartingRef: string;
  coordinationGuidance: string;
  agents: ProcessAgentDefinition[];
  boards: ProcessBoardDefinition[];
}

export interface AgentInstructionContent {
  agentId: string;
  content: string;
}

export interface LoadedProcessDefinition {
  definition: ProcessDefinition;
  instructionContents: AgentInstructionContent[];
  version: string;
}

export type LoadedValidationResult =
  | { valid: true; loaded: LoadedProcessDefinition }
  | { valid: false; diagnostics: ProcessDiagnostic[] };

const schemaPath = fileURLToPath(
  new URL("../../../schemas/process-definition.schema.json", import.meta.url),
);

export async function loadProcessDefinition(path: string): Promise<LoadedValidationResult> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch {
    return {
      valid: false,
      diagnostics: [
        {
          file: path,
          line: 1,
          column: 1,
          invalidValue: path,
          rule: "the process definition must be a readable UTF-8 file",
          consequence:
            "The process cannot be validated, so automation and board mutation remain disabled.",
          correction: `Make the process definition readable at "${path}".`,
        },
      ],
    };
  }

  const lineCounter = new LineCounter();
  const document = parseDocument(source, { lineCounter, prettyErrors: false });
  if (document.errors.length > 0) {
    return {
      valid: false,
      diagnostics: document.errors.map((error) => {
        const location = lineCounter.linePos(error.pos[0]);
        return {
          file: path,
          line: location.line,
          column: location.col,
          invalidValue: source.slice(error.pos[0], error.pos[1]),
          rule: `YAML must be syntactically valid (${error.code})`,
          consequence:
            "The process definition cannot be understood, so automation and board mutation remain disabled.",
          correction: "Correct the YAML syntax at this location and validate again.",
        };
      }),
    };
  }

  const candidate = document.toJS({ maxAliasCount: 100 }) as unknown;
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  const validator = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validator(candidate)) {
    return {
      valid: false,
      diagnostics: (validator.errors ?? []).map((error) => {
        const propertyPath = jsonPointerToPath(error.instancePath);
        const pathWithKeyword =
          error.keyword === "required"
            ? [...propertyPath, String(error.params.missingProperty)]
            : error.keyword === "additionalProperties"
              ? [...propertyPath, String(error.params.additionalProperty)]
              : propertyPath;
        return {
          file: path,
          ...locateYamlValue(document, lineCounter, pathWithKeyword),
          invalidValue: valueAtPath(candidate, pathWithKeyword),
          rule: `process definition ${error.message ?? "violates the JSON Schema"}`,
          consequence:
            "The process definition cannot be applied, so automation and board mutation remain disabled.",
          correction: schemaCorrection(error.keyword, error.params),
        };
      }),
    };
  }

  const definition = candidate as ProcessDefinition;
  const semanticDiagnostics = validateIdentitiesAndWatchers(
    path,
    document,
    lineCounter,
    definition,
  );
  if (semanticDiagnostics.length > 0) {
    return { valid: false, diagnostics: semanticDiagnostics };
  }

  const instructionContents = await readAgentInstructions(
    path,
    document,
    lineCounter,
    definition,
    semanticDiagnostics,
  );
  if (semanticDiagnostics.length > 0) {
    return { valid: false, diagnostics: semanticDiagnostics };
  }

  const version = createHash("sha256")
    .update(canonicalJson(semanticFingerprintInput(definition, instructionContents)))
    .digest("hex");
  return { valid: true, loaded: { definition, instructionContents, version } };
}

function semanticFingerprintInput(
  definition: ProcessDefinition,
  instructionContents: AgentInstructionContent[],
): unknown {
  const instructionByAgent = new Map(
    instructionContents.map((instruction) => [instruction.agentId, instruction.content]),
  );
  return {
    ...definition,
    agents: definition.agents.map(({ instructions: _authoredPath, ...agent }) => ({
      ...agent,
      instructionContent: instructionByAgent.get(agent.id),
    })),
  };
}

function validateIdentitiesAndWatchers(
  path: string,
  document: Document.Parsed,
  lineCounter: LineCounter,
  definition: ProcessDefinition,
): ProcessDiagnostic[] {
  const diagnostics: ProcessDiagnostic[] = [];
  const declaredAgentIds = new Set(definition.agents.map((agent) => agent.id));
  collectDuplicateAgentDiagnostics(path, document, lineCounter, definition, diagnostics);

  const declaredBoardIds = new Set<string>();
  definition.boards.forEach((board, boardIndex) => {
    if (declaredBoardIds.has(board.id)) {
      diagnostics.push({
        file: path,
        ...locateYamlValue(document, lineCounter, ["boards", boardIndex, "id"]),
        invalidValue: board.id,
        rule: "board IDs must be unique and stable within a process",
        consequence: `Board "${board.id}" cannot be identified unambiguously, so the process cannot be applied safely.`,
        correction: `Give this board a unique stable ID; keep "${board.id}" on only one board.`,
      });
    } else {
      declaredBoardIds.add(board.id);
    }
    collectColumnDiagnostics(
      path,
      document,
      lineCounter,
      boardIndex,
      board,
      declaredAgentIds,
      diagnostics,
    );
  });
  return diagnostics;
}

function collectDuplicateAgentDiagnostics(
  path: string,
  document: Document.Parsed,
  lineCounter: LineCounter,
  definition: ProcessDefinition,
  diagnostics: ProcessDiagnostic[],
): void {
  const seenAgentIds = new Set<string>();
  definition.agents.forEach((agent, agentIndex) => {
    if (seenAgentIds.has(agent.id)) {
      diagnostics.push({
        file: path,
        ...locateYamlValue(document, lineCounter, ["agents", agentIndex, "id"]),
        invalidValue: agent.id,
        rule: "agent IDs must be unique and stable within a process",
        consequence: `Agent "${agent.id}" cannot be identified unambiguously, so watchers cannot resolve responsibility safely.`,
        correction: `Give this agent a unique stable ID; keep "${agent.id}" on only one agent.`,
      });
    } else {
      seenAgentIds.add(agent.id);
    }
  });
}

function collectColumnDiagnostics(
  path: string,
  document: Document.Parsed,
  lineCounter: LineCounter,
  boardIndex: number,
  board: ProcessBoardDefinition,
  declaredAgentIds: Set<string>,
  diagnostics: ProcessDiagnostic[],
): void {
  const declaredColumnIds = new Set<string>();
  board.columns.forEach((column, columnIndex) => {
    if (declaredColumnIds.has(column.id)) {
      diagnostics.push({
        file: path,
        ...locateYamlValue(document, lineCounter, [
          "boards",
          boardIndex,
          "columns",
          columnIndex,
          "id",
        ]),
        invalidValue: column.id,
        rule: "column IDs must be unique and stable within their board",
        consequence: `Column "${column.id}" cannot be identified unambiguously on board "${board.id}".`,
        correction: `Give this column a unique stable ID within board "${board.id}".`,
      });
    } else {
      declaredColumnIds.add(column.id);
    }
    if (
      column.watchingAgent !== undefined &&
      !declaredAgentIds.has(column.watchingAgent)
    ) {
      diagnostics.push({
        file: path,
        ...locateYamlValue(document, lineCounter, [
          "boards",
          boardIndex,
          "columns",
          columnIndex,
          "watchingAgent",
        ]),
        invalidValue: column.watchingAgent,
        rule: "watchingAgent must reference a declared agent ID",
        consequence: `Column "${column.id}" has no resolvable watching agent, so startup cannot safely determine responsibility.`,
        correction: `Declare agent "${column.watchingAgent}" or change watchingAgent to an existing agent ID.`,
      });
    }
  });
}

async function readAgentInstructions(
  path: string,
  document: Document.Parsed,
  lineCounter: LineCounter,
  definition: ProcessDefinition,
  diagnostics: ProcessDiagnostic[],
): Promise<AgentInstructionContent[]> {
  const instructionContents: AgentInstructionContent[] = [];
  for (let agentIndex = 0; agentIndex < definition.agents.length; agentIndex += 1) {
    const agent = definition.agents[agentIndex];
    if (agent === undefined) continue;
    const instructionPath = resolve(dirname(path), agent.instructions);
    try {
      const content = await readFile(instructionPath, "utf8");
      instructionContents.push({
        agentId: agent.id,
        content: content.replaceAll("\r\n", "\n"),
      });
    } catch {
      diagnostics.push({
        file: path,
        ...locateYamlValue(document, lineCounter, ["agents", agentIndex, "instructions"]),
        invalidValue: agent.instructions,
        rule: "instructions must reference a readable UTF-8 Markdown file",
        consequence: `Agent "${agent.id}" would start without its required long-form instructions.`,
        correction: `Create the file at "${instructionPath}" or correct the instructions path.`,
      });
    }
  }
  return instructionContents;
}

function jsonPointerToPath(pointer: string): Array<string | number> {
  if (pointer === "") return [];
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .map((segment) => (/^(0|[1-9][0-9]*)$/.test(segment) ? Number(segment) : segment));
}

function locateYamlValue(
  document: Document.Parsed,
  lineCounter: LineCounter,
  path: Array<string | number>,
): { line: number; column: number } {
  let node = document.getIn(path, true) as ParsedNode | null | undefined;
  if (!isNode(node) && path.length > 0) {
    node = document.getIn(path.slice(0, -1), true) as ParsedNode | null | undefined;
  }
  if (isNode(node) && node.range !== undefined) {
    const location = lineCounter.linePos(node.range[0]);
    return { line: location.line, column: location.col };
  }
  return { line: 1, column: 1 };
}

function valueAtPath(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const segment of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function schemaCorrection(keyword: string, params: Record<string, unknown>): string {
  if (keyword === "required") {
    return `Add the required "${String(params.missingProperty)}" property.`;
  }
  if (keyword === "additionalProperties") {
    return `Remove the unsupported "${String(params.additionalProperty)}" property.`;
  }
  if (keyword === "pattern") {
    return "Use a lowercase stable ID beginning with a letter and containing only letters, digits, and single hyphens.";
  }
  if (keyword === "minLength") return "Provide a non-empty value.";
  if (keyword === "enum") return "Use one of: minimal, low, medium, high, or xhigh.";
  if (keyword === "minItems") return "Add at least one item.";
  if (keyword === "const") {
    return `Use the schema-supported value ${JSON.stringify(params.allowedValue)}.`;
  }
  if (keyword === "not") {
    return 'Choose a stable ID other than the framework-reserved "completion" ID.';
  }
  return "Change this value to match the process-definition JSON Schema.";
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
