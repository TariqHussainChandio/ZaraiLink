import * as Crypto from 'expo-crypto';
import { useCallback, useState } from 'react';

function newKey(): string {
  return `zl-${Crypto.randomUUID()}`;
}

/**
 * The Idempotency-Key of one form entry (B4 verification F2). It is made when the form opens and kept through every
 * retry, even if the dealer changes a field after a lost response, until the server confirms the save; only then is it
 * renewed. A key derived from the fields would change with the note and record the same delivery twice; with this one
 * the server either replays the first answer or refuses the changed body (`idempotency_key_reused`).
 */
export function useEntryKey(): { key: string; renew: () => void } {
  const [key, setKey] = useState(newKey);
  const renew = useCallback(() => setKey(newKey()), []);
  return { key, renew };
}
