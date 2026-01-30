const UUID_PLACEHOLDER = "{uuid}";

/**
 * Replace {uuid} in a template path with the actual value.
 * @example resolvePath("session/{uuid}/meta", { uuid: "abc" }) => "session/abc/meta"
 */
export function resolvePath(template: string, params: Record<string, string>): string {
  const uuid = params.uuid;
  if (uuid === undefined) return template;
  return template.replace(UUID_PLACEHOLDER, uuid);
}

/**
 * Extract params from a resolved path by matching against a template.
 * Returns null if the resolved path doesn't match the template.
 * @example parsePath("session/{uuid}/meta", "session/abc/meta") => { uuid: "abc" }
 */
export function parsePath(template: string, resolved: string): Record<string, string> | null {
  if (!template.includes(UUID_PLACEHOLDER)) {
    return resolved === template ? {} : null;
  }

  const [prefix, suffix] = template.split(UUID_PLACEHOLDER);
  if (prefix === undefined || suffix === undefined) return null;

  if (!resolved.startsWith(prefix) || !resolved.endsWith(suffix)) {
    return null;
  }

  const uuidLength = resolved.length - prefix.length - suffix.length;
  if (uuidLength <= 0) return null;

  const uuid = resolved.slice(prefix.length, prefix.length + uuidLength);

  if (uuid.includes("/")) return null;

  return { uuid };
}

export function hasParams(template: string): boolean {
  return template.includes("{");
}
