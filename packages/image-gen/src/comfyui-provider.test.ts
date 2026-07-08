// First-ever coverage for ComfyUIProvider — v2.5 audit A1 (HIGH) + A6.
//
// The invariant under test: generate() talks to an external local daemon over
// three fetches (queue POST, history poll, image view). On a stalled,
// non-JSON, erroring, or lying ComfyUI it must resolve to a typed {ok:false}
// failure within a bounded time — it never hangs (every fetch carries an
// AbortSignal) and never lets a raw fetch TypeError / SyntaxError escape (A1).
// Image bytes are validated before they are trusted: content-type must be
// image/*, and the body is capped at maxImageBytes (A6).
//
// Mirrors the contract style of packages/ollama/src/client.ts + client.test.ts.

import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { ComfyUIProvider } from './comfyui-provider.js';

type MockHandler = (req: IncomingMessage, res: ServerResponse) => void;
type MockServer = { url: string; close: () => Promise<void> };

const openServers: MockServer[] = [];

/** Ephemeral-port mock ComfyUI with socket tracking so stalled connections can be torn down. */
async function startMock(handler: MockHandler): Promise<MockServer> {
  const sockets = new Set<Socket>();
  const server = createServer(handler);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  const mock: MockServer = {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
  openServers.push(mock);
  return mock;
}

afterEach(async () => {
  while (openServers.length) await openServers.pop()!.close();
});

/** Minimal PNG-shaped bytes: signature + IHDR with real width/height at offsets 16/20. */
function tinyPng(width: number, height: number, padding = 0): Buffer {
  const bytes = Buffer.alloc(24 + padding);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.writeUInt32BE(13, 8); // IHDR chunk length
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

/** Provider tuned for fast tests: 10ms polls, 500ms budget unless overridden. */
function makeProvider(url: string, extra?: { timeoutMs?: number; maxImageBytes?: number }) {
  return new ComfyUIProvider({ baseUrl: url, pollIntervalMs: 10, timeoutMs: 500, ...extra });
}

/** Handler implementing the happy queue→history flow with a pluggable /view. */
function comfyFlow(view: MockHandler, onWorkflow?: (workflow: Record<string, never>) => void): MockHandler {
  return (req, res) => {
    if (req.method === 'POST' && req.url === '/prompt') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (onWorkflow) onWorkflow(JSON.parse(body).prompt);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ prompt_id: 'p1' }));
      });
      return;
    }
    if (req.url?.startsWith('/history/p1')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          p1: { outputs: { '7': { images: [{ filename: 'x.png', subfolder: '', type: 'output' }] } } },
        }),
      );
      return;
    }
    if (req.url?.startsWith('/view')) {
      view(req, res);
      return;
    }
    res.writeHead(404);
    res.end();
  };
}

describe('ComfyUIProvider.generate — A1: typed failure envelope', () => {
  it('A1-happy: full queue→poll→view flow resolves ok:true with the image bytes', async () => {
    const png = tinyPng(8, 8);
    const mock = await startMock(
      comfyFlow((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(png);
      }),
    );

    const result = await makeProvider(mock.url).generate('a knight');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Buffer.from(result.image)).toEqual(png);
      expect(result.mimeType).toBe('image/png');
      // A6: dimensions describe the bytes we actually received (PNG IHDR),
      // not whatever the caller asked for.
      expect(result.width).toBe(8);
      expect(result.height).toBe(8);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it(
    'A1-stall: a stalled server resolves {ok:false, code:timeout} within a bounded time — never hangs',
    { timeout: 10_000 },
    async () => {
      // Accept the connection, never respond. Before the fix this hangs forever.
      const mock = await startMock(() => {});
      const start = Date.now();
      const result = await makeProvider(mock.url, { timeoutMs: 300 }).generate('p');
      const elapsed = Date.now() - start;

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('timeout');
      // Bounded: well under the 10s test budget, in the neighborhood of timeoutMs.
      expect(elapsed).toBeLessThan(5_000);
    },
  );

  it('A1-nonjson-queue: a 200 non-JSON body from POST /prompt resolves {ok:false, code:invalid_response} — never throws', async () => {
    const mock = await startMock((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>captive portal</html>');
    });

    const result = await makeProvider(mock.url).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('invalid_response');
      expect(result.error).toMatch(/non-JSON/i);
    }
  });

  it('A1-500-queue: an HTTP 500 from POST /prompt resolves {ok:false, code:http_error} — never throws', async () => {
    const mock = await startMock((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('internal error');
    });

    const result = await makeProvider(mock.url).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('http_error');
      expect(result.error).toContain('500');
    }
  });

  it('A1-refused: a connection refusal resolves {ok:false, code:network} with a recovery hint', async () => {
    const mock = await startMock(() => {});
    const url = mock.url;
    await mock.close(); // port now refuses connections

    const result = await makeProvider(url).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('network');
      expect(result.hint).toMatch(/ComfyUI/);
    }
  });

  it('A1-noid: a JSON queue response missing prompt_id resolves {ok:false, code:invalid_response}', async () => {
    const mock = await startMock((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ unexpected: true }));
    });

    const result = await makeProvider(mock.url).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_response');
  });

  it('A1-nonjson-history: a 200 non-JSON history poll resolves {ok:false, code:invalid_response} — never throws', async () => {
    const mock = await startMock((req, res) => {
      if (req.method === 'POST' && req.url === '/prompt') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ prompt_id: 'p1' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>proxy error page</html>');
    });

    const result = await makeProvider(mock.url).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid_response');
  });

  it('A1-poll-timeout: a generation that never completes resolves {ok:false, code:timeout} naming the budget', async () => {
    const mock = await startMock((req, res) => {
      if (req.method === 'POST' && req.url === '/prompt') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ prompt_id: 'p1' }));
        return;
      }
      // History responds but never contains outputs.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });

    const result = await makeProvider(mock.url, { timeoutMs: 200 }).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('timeout');
      expect(result.error).toContain('200');
    }
  });

  it('A1-view-500: an HTTP 500 on the image fetch resolves {ok:false, code:http_error}', async () => {
    const mock = await startMock(
      comfyFlow((_req, res) => {
        res.writeHead(500);
        res.end('boom');
      }),
    );

    const result = await makeProvider(mock.url).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('http_error');
  });
});

describe('ComfyUIProvider.generate — A6: image body validation', () => {
  it('A6-content-type: a non-image content-type on /view resolves {ok:false, code:not_an_image}', async () => {
    const mock = await startMock(
      comfyFlow((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html>login page</html>');
      }),
    );

    const result = await makeProvider(mock.url).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_an_image');
  });

  it('A6-cap-declared: a Content-Length over maxImageBytes resolves {ok:false, code:image_too_large}', async () => {
    const big = tinyPng(8, 8, 4096);
    const mock = await startMock(
      comfyFlow((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(big.length) });
        res.end(big);
      }),
    );

    const result = await makeProvider(mock.url, { maxImageBytes: 1024 }).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('image_too_large');
  });

  it('A6-cap-chunked: an over-cap chunked body (no Content-Length) is also rejected', async () => {
    const mock = await startMock(
      comfyFlow((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' }); // no length → chunked
        res.write(tinyPng(8, 8));
        res.write(Buffer.alloc(4096));
        res.end();
      }),
    );

    const result = await makeProvider(mock.url, { maxImageBytes: 1024 }).generate('p');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('image_too_large');
  });
});

// v2.5 audit PA-1 (MED): the provider generated a random default seed inside
// buildWorkflow but returned `seed: opts?.seed` — the effective seed was
// discarded AND the reported seed was undefined whenever one was actually used.
// The invariant under test: the seed in the result is ALWAYS the seed sent to
// KSampler, and the no-seed default is deterministic (same inputs → same seed)
// so any portrait can be reproduced.
describe('ComfyUIProvider.generate — PA-1: seed reproducibility', () => {
  /** Extract the KSampler seed from a captured workflow. */
  function kSamplerSeed(workflow: Record<string, never>): unknown {
    const nodes = workflow as Record<string, { class_type?: string; inputs?: { seed?: unknown } }>;
    for (const node of Object.values(nodes)) {
      if (node.class_type === 'KSampler') return node.inputs?.seed;
    }
    return undefined;
  }

  function seedCapturingMock(): Promise<MockServer> & { sent: unknown[] } {
    const sent: unknown[] = [];
    const promise = startMock(
      comfyFlow(
        (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(tinyPng(8, 8));
        },
        (workflow) => sent.push(kSamplerSeed(workflow)),
      ),
    ) as Promise<MockServer> & { sent: unknown[] };
    promise.sent = sent;
    return promise;
  }

  it('PA1-explicit: a caller-supplied seed is sent to KSampler and reported back verbatim', async () => {
    const mockPromise = seedCapturingMock();
    const mock = await mockPromise;

    const result = await makeProvider(mock.url).generate('a knight', { seed: 1234 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.seed).toBe(1234);
    expect(mockPromise.sent).toEqual([1234]);
  });

  it('PA1-default: with no seed, a concrete seed is used, reported (never undefined), and matches what was sent', async () => {
    const mockPromise = seedCapturingMock();
    const mock = await mockPromise;

    const result = await makeProvider(mock.url).generate('a knight');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.seed).toBe('number');
      expect(Number.isFinite(result.seed)).toBe(true);
      // The reported seed is the one that actually reached KSampler.
      expect(mockPromise.sent).toEqual([result.seed]);
    }
  });

  it('PA1-reproducible: the derived default seed is deterministic — same inputs, same seed', async () => {
    const mockPromise = seedCapturingMock();
    const mock = await mockPromise;
    const provider = makeProvider(mock.url);

    const first = await provider.generate('a knight', { width: 256, height: 256 });
    const second = await provider.generate('a knight', { width: 256, height: 256 });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.seed).toBe(second.seed);
      expect(mockPromise.sent).toEqual([first.seed, first.seed]);
    }
  });

  it('PA1-distinct: different prompts derive different default seeds', async () => {
    const mockPromise = seedCapturingMock();
    const mock = await mockPromise;
    const provider = makeProvider(mock.url);

    const knight = await provider.generate('a knight');
    const oracle = await provider.generate('an oracle');
    expect(knight.ok && oracle.ok).toBe(true);
    if (knight.ok && oracle.ok) expect(knight.seed).not.toBe(oracle.seed);
  });
});

describe('ComfyUIProvider.isAvailable', () => {
  it('is true against a live server and false once it is down', async () => {
    const mock = await startMock((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    expect(await new ComfyUIProvider({ baseUrl: mock.url }).isAvailable()).toBe(true);

    const url = mock.url;
    await mock.close();
    expect(await new ComfyUIProvider({ baseUrl: url }).isAvailable()).toBe(false);
  });
});
