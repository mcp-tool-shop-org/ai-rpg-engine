// ComfyUI provider — direct HTTP API calls to a local ComfyUI server
// Works with any ComfyUI installation (standalone or via comfy-headless).
// Default: http://localhost:8188
//
// Failure contract (v2.5 audit A1 + A6): generate() resolves to a typed
// GenerationOutcome and never throws or hangs on a flaky daemon. Every fetch
// carries an AbortSignal so a stalled socket cannot block forever, response
// bodies are parsed defensively (a 200 with an HTML body is a typed failure,
// not an escaping SyntaxError), and image bytes are validated before they are
// trusted: the content-type must be image/* and the body is capped at
// maxImageBytes. Mirrors the {ok:false} pattern of packages/ollama/src/client.ts.

import type {
  ImageProvider,
  GenerationOutcome,
  GenerationFailure,
  GenerationOptions,
} from './types.js';

export type ComfyUIProviderOptions = {
  /** ComfyUI server URL. Default: http://localhost:8188 */
  baseUrl?: string;
  /**
   * Checkpoint model name. Default: 'sd_xl_base_1.0.safetensors'.
   * There is NO auto-detection (an earlier version of this doc claimed there
   * was — v2.6 Stage C F-8d5c2ea9): if your ComfyUI install uses any other
   * checkpoint, set this explicitly or the queue request fails with HTTP 400.
   */
  checkpoint?: string;
  /** Sampler name. Default: 'euler'. */
  sampler?: string;
  /** Scheduler name. Default: 'normal'. */
  scheduler?: string;
  /** Polling interval in ms when waiting for results. Default: 1000. */
  pollIntervalMs?: number;
  /** Maximum wait time in ms — bounds every fetch AND the poll loop. Default: 120000 (2 min). */
  timeoutMs?: number;
  /** Maximum accepted image response size in bytes. Default: 64 MiB. */
  maxImageBytes?: number;
  /**
   * Called once per tolerated non-OK history poll (a transient 5xx / proxy
   * hiccup mid-generation), before the loop continues. Default: a one-line
   * stderr breadcrumb — without it a flaky daemon leaves NO signal across the
   * whole poll window, and a never-recovering daemon is indistinguishable from
   * a merely-slow generation at the final timeout (v2.6 audit F-5e41e3c3).
   * Mirrors packages/ollama/src/client.ts's onRetry hook. Pass a no-op to
   * silence, or your own hook to route it elsewhere.
   */
  onPollError?: (info: PollErrorInfo) => void;
};

/** Diagnostic breadcrumb payload for a tolerated non-OK history poll (F-5e41e3c3). */
export type PollErrorInfo = { status: number; attempt: number; url: string };

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_IMAGE_BYTES = 64 * 1024 * 1024;

function defaultOnPollError(info: PollErrorInfo): void {
  console.error(
    `[comfyui] history poll #${info.attempt} returned HTTP ${info.status} (${info.url}); tolerated, still within deadline`,
  );
}

/**
 * Derive a deterministic default seed from the generation inputs (FNV-1a,
 * 32-bit) when the caller supplies none — v2.5 audit PA-1.
 *
 * The engine is determinism-first: the AI layer already threads explicit seeds
 * (`chat-experiments.ts deriveSeeds()` — no `Math.random`), and the asset store
 * is content-addressed. A random default seed here broke both properties: the
 * same portrait request produced different bytes every run, and the effective
 * seed was discarded so nothing could ever be reproduced. Hashing the inputs
 * means same request → same seed → same image; pass an explicit `seed` to get
 * a different sample for otherwise-identical inputs.
 */
function deriveDefaultSeed(
  prompt: string,
  opts: GenerationOptions & ComfyUIProviderOptions,
): number {
  const key = [
    prompt,
    opts.negativePrompt ?? '',
    opts.width ?? 512,
    opts.height ?? 512,
    opts.steps ?? 20,
    opts.cfgScale ?? 7,
  ].join(' ');
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0;
}

/** Build a minimal txt2img workflow JSON for ComfyUI. */
function buildWorkflow(
  prompt: string,
  opts: GenerationOptions & ComfyUIProviderOptions,
  seed: number,
): Record<string, unknown> {
  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  const steps = opts.steps ?? 20;
  const cfg = opts.cfgScale ?? 7;
  const checkpoint = opts.checkpoint ?? 'sd_xl_base_1.0.safetensors';
  const sampler = opts.sampler ?? 'euler';
  const scheduler = opts.scheduler ?? 'normal';
  const negative = opts.negativePrompt ?? '';

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['1', 1] },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip: ['1', 1] },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        seed,
        steps,
        cfg,
        sampler_name: sampler,
        scheduler,
        denoise: 1.0,
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: 'ai-rpg-engine' },
    },
  };
}

function fail(
  code: GenerationFailure['code'],
  error: string,
  hint?: string,
): GenerationFailure {
  return hint ? { ok: false, code, error, hint } : { ok: false, code, error };
}

/** Trim server-provided bodies before they land in error messages. */
function excerpt(text: string, max = 200): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Read PNG dimensions from the IHDR header, if the bytes are a PNG. */
function sniffPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24) return null;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Accumulate a response body without ever buffering more than `cap` bytes.
 *
 * The streaming branch caps incrementally, cancelling the moment the running
 * total crosses `cap`. When `res.body` is null there is genuinely nothing to
 * read: undici only nulls the body for responses that carry NO bytes at all
 * (204/304 and the other null-body statuses — a 200 with a real body always
 * exposes a stream; empirically verified against undici's fetch), so we return
 * empty WITHOUT calling `res.arrayBuffer()`. Previously this branch fell back
 * to `arrayBuffer()`, which reads the WHOLE body before checking its size — a
 * real hole in the "never buffer more than cap" contract (v2.6 audit
 * F-7ad6e99e). Removing that fallback makes the contract hold unconditionally:
 * there is now no path anywhere in this function that reads a whole body before
 * the cap can reject it. Exported for tests.
 */
export async function readBodyCapped(res: Response, cap: number): Promise<Uint8Array | 'too-large'> {
  const body = res.body;
  if (!body) {
    // Null body ⇒ zero bytes ⇒ nothing to buffer, nothing to cap.
    return new Uint8Array(0);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      return 'too-large';
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export class ComfyUIProvider implements ImageProvider {
  readonly name = 'comfyui';
  private readonly baseUrl: string;
  private readonly opts: ComfyUIProviderOptions;

  constructor(opts?: ComfyUIProviderOptions) {
    this.opts = opts ?? {};
    this.baseUrl = (opts?.baseUrl ?? 'http://localhost:8188').replace(/\/$/, '');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private offlineHint(): string {
    return `Is ComfyUI running at ${this.baseUrl}? Start it (or fix baseUrl), then retry.`;
  }

  /**
   * Generate an image via the queue → history-poll → view flow.
   *
   * Never throws and never hangs: every fetch is bounded by `timeoutMs`, and
   * every failure mode (offline daemon, stalled socket, non-JSON body, HTTP
   * error, non-image or oversized response) resolves to a typed `{ok: false}`
   * failure with a stable code.
   */
  async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationOutcome> {
    const timeout = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      return await this.generateInner(prompt, timeout, opts);
    } catch (err) {
      // Belt-and-braces: generateInner handles expected failures as typed
      // returns; anything that still throws (abort/timeout DOMException, DNS
      // or connection-refused TypeError) folds into the same contract here.
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        return fail('timeout', `ComfyUI request timed out after ${timeout}ms`, this.offlineHint());
      }
      const message = err instanceof Error ? err.message : String(err);
      return fail('network', `ComfyUI request failed: ${message}`, this.offlineHint());
    }
  }

  private async generateInner(
    prompt: string,
    timeout: number,
    opts?: GenerationOptions,
  ): Promise<GenerationOutcome> {
    const mergedOpts = { ...this.opts, ...opts };
    // Resolve the effective seed exactly once (PA-1): the value sent to
    // KSampler and the value reported in the result must be the same number,
    // or the portrait can never be reproduced.
    const seed = mergedOpts.seed ?? deriveDefaultSeed(prompt, mergedOpts);
    const workflow = buildWorkflow(prompt, mergedOpts, seed);
    const start = Date.now();

    // 1. Queue the prompt — bounded + non-JSON-safe (A1).
    const queueRes = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!queueRes.ok) {
      const text = await queueRes.text().catch(() => '(no body)');
      return fail('http_error', `ComfyUI queue failed (HTTP ${queueRes.status}): ${excerpt(text)}`);
    }

    let queueJson: { prompt_id?: unknown };
    try {
      queueJson = (await queueRes.json()) as { prompt_id?: unknown };
    } catch {
      return fail(
        'invalid_response',
        'ComfyUI returned a non-JSON response from POST /prompt (HTTP 200)',
        `Something other than ComfyUI may be answering at ${this.baseUrl} (proxy, captive portal, wrong port).`,
      );
    }
    const promptId = queueJson.prompt_id;
    if (typeof promptId !== 'string' || promptId.length === 0) {
      return fail('invalid_response', 'ComfyUI queue response did not include a prompt_id');
    }

    // 2. Poll for completion — each poll bounded; the loop bounded by the deadline.
    const pollInterval = this.opts.pollIntervalMs ?? 1000;
    const onPollError = this.opts.onPollError ?? defaultOnPollError;
    const deadline = Date.now() + timeout;

    let outputImages: { filename: string; subfolder: string; type: string }[] = [];
    let pollAttempt = 0;

    while (Date.now() < deadline) {
      await sleep(pollInterval);

      // Bound this fetch by whatever remains of the ORIGINAL deadline, not a
      // fresh `timeout` window (v2.6 audit F-b576db51): re-granting the full
      // budget to a poll that starts late in the loop let a single stalled
      // response nearly double the documented timeoutMs bound (opts.timeoutMs
      // "bounds every fetch AND the poll loop" — see the doc comment above).
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      pollAttempt++;
      const historyUrl = `${this.baseUrl}/history/${promptId}`;
      const historyRes = await fetch(historyUrl, {
        signal: AbortSignal.timeout(remaining),
      });
      if (!historyRes.ok) {
        // Transient poll errors are tolerated (bounded by the deadline) but no
        // longer silently swallowed — surface a breadcrumb so a flaky-but-
        // recovering daemon and a flaky-then-failed one leave a diagnosable
        // trail instead of a single opaque timeout (v2.6 audit F-5e41e3c3).
        onPollError({ status: historyRes.status, attempt: pollAttempt, url: historyUrl });
        continue;
      }

      let history: Record<string, HistoryEntry>;
      try {
        history = (await historyRes.json()) as Record<string, HistoryEntry>;
      } catch {
        // A 200 with a non-JSON body means we are not talking to ComfyUI;
        // retrying inside the deadline cannot fix that. Fail fast + typed.
        return fail(
          'invalid_response',
          'ComfyUI returned a non-JSON response from the history poll (HTTP 200)',
          `Something other than ComfyUI may be answering at ${this.baseUrl} (proxy, captive portal, wrong port).`,
        );
      }
      const entry = history[promptId];
      if (!entry?.outputs) continue;

      // Find the SaveImage output node
      for (const nodeOutput of Object.values(entry.outputs)) {
        if (nodeOutput.images && nodeOutput.images.length > 0) {
          outputImages = nodeOutput.images;
          break;
        }
      }

      if (outputImages.length > 0) break;
    }

    if (outputImages.length === 0) {
      return fail(
        'timeout',
        `ComfyUI generation timed out after ${timeout}ms`,
        'Long generations can exceed the default budget — raise timeoutMs if the server is healthy.',
      );
    }

    // 3. Fetch the generated image — bounded + validated before trusting it (A6).
    const img = outputImages[0];
    const viewUrl = `${this.baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`;
    const imageRes = await fetch(viewUrl, { signal: AbortSignal.timeout(timeout) });

    if (!imageRes.ok) {
      return fail('http_error', `ComfyUI image fetch failed (HTTP ${imageRes.status})`);
    }

    const contentType = imageRes.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return fail(
        'not_an_image',
        `ComfyUI /view returned "${contentType || '(no content-type)'}" instead of an image`,
      );
    }

    const maxBytes = this.opts.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
    const declaredLength = Number(imageRes.headers.get('content-length') ?? '');
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return fail(
        'image_too_large',
        `ComfyUI image is ${declaredLength} bytes — over the ${maxBytes}-byte cap (maxImageBytes)`,
      );
    }
    const imageBuffer = await readBodyCapped(imageRes, maxBytes);
    if (imageBuffer === 'too-large') {
      return fail(
        'image_too_large',
        `ComfyUI image exceeded the ${maxBytes}-byte cap (maxImageBytes)`,
      );
    }

    // Prefer real dimensions from the PNG header over the requested size —
    // stored metadata should describe the bytes we actually received (A6).
    const sniffed = sniffPngSize(imageBuffer);
    const width = sniffed?.width ?? opts?.width ?? 512;
    const height = sniffed?.height ?? opts?.height ?? 512;

    return {
      ok: true,
      image: imageBuffer,
      mimeType: contentType,
      width,
      height,
      prompt,
      negativePrompt: opts?.negativePrompt,
      // The seed actually used — never the (possibly absent) caller value (PA-1).
      seed,
      model: this.opts.checkpoint ?? 'default',
      durationMs: Date.now() - start,
    };
  }
}

type HistoryEntry = {
  outputs: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
