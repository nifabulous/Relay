const SAFE_RELEASE_PATTERN = /^[A-Za-z0-9._:@/-]+$/;

/** Keep the runtime SDK and build-time source-map upload on one release name. */
export function resolveSentryRelease(value: string | undefined, fallback?: string): string | undefined {
  const release = (value?.trim() || fallback?.trim()) ?? "";
  if (!release || release.length > 128 || !SAFE_RELEASE_PATTERN.test(release)) return undefined;
  return release;
}
