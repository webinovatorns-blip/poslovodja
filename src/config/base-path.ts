/**
 * Build-time application mount path.
 *
 * Next.js automatically prefixes Link and router navigation with `basePath`,
 * but server redirects and manually constructed URLs still need the prefix.
 */
export function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "/") return "";

  const normalized = `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
  const segments = normalized.slice(1).split("/");
  if (
    !segments.every(
      (segment) =>
        segment !== "." && segment !== ".." && /^[A-Za-z0-9._~-]+$/.test(segment),
    )
  ) {
    throw new Error("NEXT_PUBLIC_BASE_PATH must be a valid URL path prefix");
  }

  return normalized;
}

export const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

/** Pure form used by tests and by the build-time-configured wrapper below. */
export function addBasePath(path: string, basePath: string): string {
  if (!path.startsWith("/")) {
    throw new Error("Application paths must start with a slash");
  }
  if (
    !basePath ||
    path === basePath ||
    path.startsWith(`${basePath}/`) ||
    path.startsWith(`${basePath}?`)
  ) {
    return path;
  }
  return `${basePath}${path}`;
}

/** Prefixes an internal absolute path for a raw HTTP/server redirect. */
export function withBasePath(path: string): string {
  return addBasePath(path, appBasePath);
}
