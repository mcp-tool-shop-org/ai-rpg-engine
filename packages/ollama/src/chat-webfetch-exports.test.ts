// Tests — public export surface for the SSRF URL checks (v2.6 audit F-7f6ca7bd).
//
// chat-webfetch.ts exposes two checks with very different guarantees:
//   - the syntax-only check (blocks IP-literal hosts, does NOT resolve DNS —
//     insufficient as a live gate on its own), and
//   - isAllowedUrlResolved (the complete gate: resolves DNS + re-checks every
//     address).
// Re-exporting the weak one from the package index under the unqualified,
// alphabetically-first name `isAllowedUrl` invited a future consumer to reach
// for it as "the" URL-safety check and silently reintroduce the SSRF gap
// F-f268b81a already closed. The public surface must name the syntax-only check
// self-descriptively and expose isAllowedUrlResolved as the boundary.

import { describe, it, expect } from 'vitest';
import * as ollama from './index.js';

describe('ollama public export surface — SSRF checks (F-7f6ca7bd)', () => {
  it('exposes the DNS-resolving gate as the boundary', () => {
    expect(typeof ollama.isAllowedUrlResolved).toBe('function');
  });

  it('exposes the syntax-only check under a self-documenting name', () => {
    expect(typeof ollama.isSyntacticallyAllowedUrl).toBe('function');
  });

  it('no longer exports the ambiguous `isAllowedUrl` name that invited misuse as a gate', () => {
    expect('isAllowedUrl' in ollama).toBe(false);
  });

  it('the syntax-only check still rejects blocked IP literals (behaviour preserved under the new name)', () => {
    expect(ollama.isSyntacticallyAllowedUrl('http://127.0.0.1/')).toBe(false);
    expect(ollama.isSyntacticallyAllowedUrl('https://example.com/')).toBe(true);
  });
});
