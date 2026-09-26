import * as Crypto from 'expo-crypto';

/**
 * One `Idempotency-Key` per user intent (P5 gave checkout and payment initiation the header; this is the caller).
 *
 * The key must survive a retry of the same action, or it protects nothing: a checkout whose response was lost on a bad
 * connection is sent again by the user, and the server must recognise it as the same order. So the key is derived from
 * the action and its payload and kept until the action succeeds: the same cart submitted twice sends the same key,
 * a different cart a new one. Held in memory only (an app restart abandons the attempt), for at most 15 minutes.
 */
const KEY_LIFETIME_MS = 15 * 60 * 1000;

const keys = new Map<string, { key: string; createdAt: number }>();

function slot(scope: string, payload: unknown): string {
  return `${scope}:${stableStringify(payload)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function idempotencyKeyFor(scope: string, payload: unknown): string {
  const now = Date.now();
  for (const [name, entry] of keys) {
    if (now - entry.createdAt > KEY_LIFETIME_MS) keys.delete(name);
  }
  const id = slot(scope, payload);
  const existing = keys.get(id);
  if (existing) return existing.key;
  const key = `zl-${Crypto.randomUUID()}`;
  keys.set(id, { key, createdAt: now });
  return key;
}

/** Call once the action has succeeded, so the next identical action (a second order of the same cart) is a new one. */
export function releaseIdempotencyKey(scope: string, payload: unknown): void {
  keys.delete(slot(scope, payload));
}
