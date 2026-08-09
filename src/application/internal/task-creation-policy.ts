export function taskCreationAllowed(columnId: string): boolean {
  return columnId !== "completion";
}
