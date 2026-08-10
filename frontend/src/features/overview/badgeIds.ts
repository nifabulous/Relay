/**
 * Map a frontend curriculum module id to the backend progress-service id.
 * The backend now uses the same current curriculum IDs; legacy aliases are
 * normalized server-side for previously saved progress.
 */
export function toBackendModuleId(labId: string): string {
  return labId;
}

/**
 * Keep the frontend/backend contract one module to one ID. Fees & FX is a
 * single current curriculum module even though it replaced two legacy tools.
 */
export function toBackendModuleIds(labId: string): string[] {
  return [toBackendModuleId(labId)];
}
