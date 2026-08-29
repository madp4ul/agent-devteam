import type { Actor } from "../../application/task-contract.ts";

export const localUserActor = { kind: "user", id: "local-user" } satisfies Actor;
