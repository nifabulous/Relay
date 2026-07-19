/**
 * Map a frontend curriculum module id to the backend progress-service id.
 * Labs are numeric backend ids ("lab-3" -> "3"); capstone and non-lab ids
 * pass through unchanged.
 */
export function toBackendModuleId(labId: string): string {
  return labId.startsWith("lab-") ? labId.slice(4) : labId;
}
