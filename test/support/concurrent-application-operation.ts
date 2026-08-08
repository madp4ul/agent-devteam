import type {
  AddTaskCommentCommand,
  CreateTaskRelationshipCommand,
  EditTaskCommand,
  MoveTaskCommand,
} from "../../src/application/coordination-contract.ts";

export const READY_COUNT_INDEX = 0;
export const RELEASE_INDEX = 1;
export const RELEASED = 1;

export type ConcurrentApplicationOperation =
  | { method: "moveTask"; command: MoveTaskCommand }
  | { method: "editTask"; command: EditTaskCommand }
  | { method: "addTaskComment"; command: AddTaskCommentCommand }
  | { method: "createTaskRelationship"; command: CreateTaskRelationshipCommand };
