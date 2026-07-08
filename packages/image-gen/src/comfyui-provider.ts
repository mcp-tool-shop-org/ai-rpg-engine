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
  /** Checkpoint model name. Default: auto-detected from ComfyUI. */
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
};

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_IMAGE_BYTES = 64 * 1024 * 1024;

/** Build a minimal txt2img workflow JSON for ComfyUI. */
function buildWorkflow(
  prompt: string,
  opts: GenerationOptions & ComfyUIProviderOptions,
): Record<string, unknown> {
  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 32);
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

/** Accumulate a response body without ever buffering more than `cap` bytes. */
async function readBodyCapped(res: Response, cap: number): Promise<Uint8Array | 'too-large'> {
  const body = res.body;
  if (!body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > cap ? 'too-large' : buf;
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
    const workflow = buildWorkflow(prompt, mergedOpts);
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
    const deadline = Date.now() + timeout;

    let outputImages: { filename: string; subfolder: string; type: string }[] = [];

    while (Date.now() < deadline) {
      await sleep(pollInterval);

      const historyRes = await fetch(`${this.baseUrl}/history/${promptId}`, {
        signal: AbortSignal.timeout(timeout),
      });
      if (!historyRes.ok) continue; // transient poll errors are tolerated, bounded by the deadline

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
      seed: opts?.seed,
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
