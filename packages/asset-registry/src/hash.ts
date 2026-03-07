// Content-addressed hashing — SHA-256 hex digest

import { createHash } from 'node:crypto';

/** Compute SHA-256 hex digest of a Uint8Array. */
export function hashBytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Validate that a string looks like a SHA-256 hex digest. */
export function isValidHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash);
}
