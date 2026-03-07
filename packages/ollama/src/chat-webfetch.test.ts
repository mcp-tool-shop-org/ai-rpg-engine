// Tests — webfetch adapter: URL validation, HTML processing, formatting

import { describe, it, expect } from 'vitest';
import { isAllowedUrl, formatWebfetchForPrompt } from './chat-webfetch.js';
import type { WebfetchResult } from './chat-webfetch.js';

// --- isAllowedUrl ---

describe('isAllowedUrl', () => {
  it('allows standard https URLs', () => {
    expect(isAllowedUrl('https://example.com')).toBe(true);
    expect(isAllowedUrl('https://docs.example.com/page')).toBe(true);
  });

  it('allows http URLs', () => {
    expect(isAllowedUrl('http://example.com')).toBe(true);
  });

  it('rejects localhost', () => {
    expect(isAllowedUrl('http://localhost:3000')).toBe(false);
    expect(isAllowedUrl('https://localhost')).toBe(false);
  });

  it('rejects 127.0.0.1', () => {
    expect(isAllowedUrl('http://127.0.0.1')).toBe(false);
    expect(isAllowedUrl('http://127.0.0.1:8080')).toBe(false);
  });

  it('rejects ::1 (IPv6 loopback)', () => {
    expect(isAllowedUrl('http://[::1]')).toBe(false);
  });

  it('rejects 0.0.0.0', () => {
    expect(isAllowedUrl('http://0.0.0.0')).toBe(false);
  });

  it('rejects private 10.x.x.x ranges', () => {
    expect(isAllowedUrl('http://10.0.0.1')).toBe(false);
    expect(isAllowedUrl('http://10.255.255.255')).toBe(false);
  });

  it('rejects private 192.168.x.x ranges', () => {
    expect(isAllowedUrl('http://192.168.1.1')).toBe(false);
    expect(isAllowedUrl('http://192.168.0.100')).toBe(false);
  });

  it('rejects private 172.16-31.x.x ranges', () => {
    expect(isAllowedUrl('http://172.16.0.1')).toBe(false);
    expect(isAllowedUrl('http://172.31.255.255')).toBe(false);
  });

  it('rejects .local and .internal domains', () => {
    expect(isAllowedUrl('http://myserver.local')).toBe(false);
    expect(isAllowedUrl('http://app.internal')).toBe(false);
  });

  it('rejects non-http protocols', () => {
    expect(isAllowedUrl('ftp://example.com')).toBe(false);
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects path traversal attempts', () => {
    // URL parser normalizes ../../ but we still catch it via href check
    expect(isAllowedUrl('http://example.com/path/..%2f..%2fetc/passwd')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAllowedUrl('not a url')).toBe(false);
    expect(isAllowedUrl('')).toBe(false);
  });
});

// --- formatWebfetchForPrompt ---

describe('formatWebfetchForPrompt', () => {
  it('formats successful result with external markers', () => {
    const result: WebfetchResult = {
      ok: true,
      url: 'https://example.com/article',
      title: 'Game Design Patterns',
      content: 'This article discusses faction-based game design.',
      truncatedTo: 47,
      fetchedAt: '2025-01-15T10:00:00Z',
    };
    const formatted = formatWebfetchForPrompt(result);
    expect(formatted).toContain('--- EXTERNAL REFERENCE (not project truth) ---');
    expect(formatted).toContain('Source: https://example.com/article');
    expect(formatted).toContain('Title: Game Design Patterns');
    expect(formatted).toContain('Fetched: 2025-01-15T10:00:00Z');
    expect(formatted).toContain('faction-based game design');
    expect(formatted).toContain('--- End External Reference ---');
  });

  it('formats failed result with error', () => {
    const result: WebfetchResult = {
      ok: false,
      url: 'https://example.com/gone',
      title: '',
      content: '',
      truncatedTo: 0,
      fetchedAt: '2025-01-15T10:00:00Z',
      error: 'HTTP 404: Not Found',
    };
    const formatted = formatWebfetchForPrompt(result);
    expect(formatted).toContain('[EXTERNAL — fetch failed]');
    expect(formatted).toContain('https://example.com/gone');
    expect(formatted).toContain('HTTP 404');
  });

  it('clearly separates external from project truth', () => {
    const result: WebfetchResult = {
      ok: true,
      url: 'https://example.com',
      title: 'Test',
      content: 'Content',
      truncatedTo: 7,
      fetchedAt: '2025-01-01T00:00:00Z',
    };
    const formatted = formatWebfetchForPrompt(result);
    // Must contain the "not project truth" marker
    expect(formatted).toMatch(/not project truth/i);
  });
});

// --- webfetch (structural tests — no real HTTP) ---

describe('webfetch — URL validation pre-check', () => {
  // Import lazily since webfetch makes real HTTP calls
  it('rejects disallowed URLs without network call', async () => {
    const { webfetch } = await import('./chat-webfetch.js');
    const result = await webfetch('http://localhost:3000/secret');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('rejects private IP without network call', async () => {
    const { webfetch } = await import('./chat-webfetch.js');
    const result = await webfetch('http://192.168.1.1/admin');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('rejects file: protocol without network call', async () => {
    const { webfetch } = await import('./chat-webfetch.js');
    const result = await webfetch('file:///etc/passwd');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not allowed');
  });
});
