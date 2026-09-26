/**
 * Security fix H2 (docs/process/standardization-plan.md §1.2): every upload function used to
 * derive the stored file extension from the client-supplied filename
 * (`file.fileName?.split('.').pop()`) — a name the caller fully controls and that need not match
 * the actual bytes. The extension is derived from the picker's own reported MIME type instead.
 * Storage buckets also enforce `allowed_mime_types` server-side (see the P3 storage-bucket-limits
 * migration) — this is the client-side half of the same fix, not a substitute for it.
 *
 * This is a table of exactly the types those buckets accept, not the `mime-types` package: that package
 * imports Node's `path`, which does not exist in React Native, so the whole app failed to bundle on a device
 * while every Jest test (which runs on Node) passed. A type outside the table gets `fallback`, which the
 * bucket then rejects if it is not an allowed type.
 */
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function extensionFromMimeType(mimeType: string | undefined, fallback = 'jpg'): string {
  if (!mimeType) return fallback;
  return EXTENSIONS[mimeType.toLowerCase().split(';')[0]?.trim() ?? ''] ?? fallback;
}
