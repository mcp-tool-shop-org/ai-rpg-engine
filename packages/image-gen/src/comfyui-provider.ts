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
   * EmptyLatentImage `batch_size`. Default 1. Raise only when a provider
   * consumer opts into latent batching; generatePortrait still stores one image.
   */
  latentBatchSize?: number;
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
/** Cap for non-image HTTP bodies (queue error, queue JSON, history poll). */
const ERROR_BODY_CAP = 64 * 1024;

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
  const init = opts.initImage;
  let initSig = '';
  if (init && init.length > 0) {
    let h = init.length;
    for (let i = 0; i < init.length; i += Math.max(1, Math.floor(init.length / 32))) {
      h = (h * 33 + init[i]) >>> 0;
    }
    initSig = `${init.length}:${h}`;
  }
  const mask = opts.mask;
  let maskSig = '';
  if (mask && mask.length > 0) {
    let h = mask.length;
    for (let i = 0; i < mask.length; i += Math.max(1, Math.floor(mask.length / 32))) {
      h = (h * 33 + mask[i]) >>> 0;
    }
    maskSig = `${mask.length}:${h}`;
  }
  const control = opts.controlImage;
  let controlSig = '';
  if (control && control.length > 0) {
    let h = control.length;
    for (let i = 0; i < control.length; i += Math.max(1, Math.floor(control.length / 32))) {
      h = (h * 33 + control[i]) >>> 0;
    }
    controlSig = `${control.length}:${h}`;
  }
  // F-fcf4f488: order-sensitive (a chained LoraLoader graph, not a set) —
  // mirrors the buildWorkflow chain order below.
  const loraSig = opts.loras && opts.loras.length > 0
    ? opts.loras.map((l) => `${l.name}:${l.weight ?? ''}`).join(',')
    : '';
  const key = [
    prompt,
    opts.negativePrompt ?? '',
    opts.width ?? 512,
    opts.height ?? 512,
    opts.steps ?? 20,
    opts.cfgScale ?? 7,
    opts.denoise ?? '',
    initSig,
    maskSig,
    opts.controlnet ?? '',
    opts.ipadapter ?? '',
    controlSig,
    loraSig,
  ].join(' ');
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash >>> 0;
}

function controlMode(
  opts: GenerationOptions & ComfyUIProviderOptions,
): 'ipadapter' | 'controlnet' | null {
  const ip = opts.ipadapter;
  const ipOn = ip === true || (typeof ip === 'number' && Number.isFinite(ip) && ip !== 0);
  if (ipOn || opts.controlnet === 'ipadapter') return 'ipadapter';
  if (opts.controlnet === 'openpose' || opts.controlnet === 'canny' || opts.controlnet === 'depth') {
    return 'controlnet';
  }
  return null;
}

function ipAdapterWeight(opts: GenerationOptions): number {
  const ip = opts.ipadapter;
  if (typeof ip === 'number' && Number.isFinite(ip)) return Math.min(1, Math.max(0, ip));
  return 1;
}

/**
 * Build a txt2img (EmptyLatentImage), img2img (LoadImage + VAEEncode), or
 * inpaint (LoadImageMask + VAEEncodeForInpaint) workflow (F-f4a0a8ec).
 * When `controlImage` + `controlnet`/`ipadapter` are set, inserts
 * ControlNetLoader+ControlNetApply or IPAdapterApply (F-94ff23c8).
 */
function buildWorkflow(
  prompt: string,
  opts: GenerationOptions & ComfyUIProviderOptions,
  seed: number,
  initImageName?: string,
  maskImageName?: string,
  controlImageName?: string,
): Record<string, unknown> {
  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  const steps = opts.steps ?? 20;
  const cfg = opts.cfgScale ?? 7;
  const checkpoint = opts.checkpoint ?? 'sd_xl_base_1.0.safetensors';
  const sampler = opts.sampler ?? 'euler';
  const scheduler = opts.scheduler ?? 'normal';
  const negative = opts.negativePrompt ?? '';
  const rawBatch = opts.latentBatchSize;
  const batchSize =
    typeof rawBatch === 'number' && Number.isFinite(rawBatch) && rawBatch >= 1
      ? Math.floor(rawBatch)
      : 1;
  const rawDenoise = opts.denoise;
  const denoise =
    typeof rawDenoise === 'number' && Number.isFinite(rawDenoise)
      ? Math.min(1, Math.max(0, rawDenoise))
      : (initImageName ? 0.7 : 1.0);

  const inpaint = Boolean(initImageName && maskImageName);
  const latentNode: Record<string, unknown> = inpaint
    ? {
        '4': {
          class_type: 'LoadImage',
          inputs: { image: initImageName },
        },
        '9': {
          class_type: 'LoadImageMask',
          inputs: { image: maskImageName, channel: 'alpha' },
        },
        '8': {
          class_type: 'VAEEncodeForInpaint',
          inputs: { pixels: ['4', 0], vae: ['1', 2], mask: ['9', 0], grow_mask_by: 6 },
        },
      }
    : initImageName
      ? {
          '4': {
            class_type: 'LoadImage',
            inputs: { image: initImageName },
          },
          '8': {
            class_type: 'VAEEncode',
            inputs: { pixels: ['4', 0], vae: ['1', 2] },
          },
        }
      : {
          '4': {
            class_type: 'EmptyLatentImage',
            inputs: { width, height, batch_size: batchSize },
          },
        };

  const workflow: Record<string, unknown> = {
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
    ...latentNode,
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: initImageName ? ['8', 0] : ['4', 0],
        seed,
        steps,
        cfg,
        sampler_name: sampler,
        scheduler,
        denoise,
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

  // F-fcf4f488: optional LoRA stack, chained between the checkpoint and
  // KSampler's model input (node ids 20+ so they never collide with the
  // ControlNet/IPAdapter block's 10-15 below). `modelSrc`/`clipSrc` are
  // declared outside the `if` (defaulting to the raw checkpoint, '1') so the
  // ipadapter branch below can read the chain's tail — see F-bdc5a692: it
  // used to hardcode IPAdapterApply's `model` input to ['1', 0], silently
  // discarding this chain whenever both were requested together.
  let modelSrc: [string, number] = ['1', 0];
  let clipSrc: [string, number] = ['1', 1];
  if (opts.loras && opts.loras.length > 0) {
    opts.loras.forEach((lora, i) => {
      const nodeId = String(20 + i);
      workflow[nodeId] = {
        class_type: 'LoraLoader',
        inputs: {
          model: modelSrc,
          clip: clipSrc,
          lora_name: lora.name,
          strength_model: lora.weight ?? 1,
          strength_clip: lora.weight ?? 1,
        },
      };
      modelSrc = [nodeId, 0];
      clipSrc = [nodeId, 1];
    });
    const ks = workflow['5'] as { inputs: Record<string, unknown> };
    ks.inputs.model = modelSrc;
  }

  const mode = controlImageName ? controlMode(opts) : null;
  if (mode === 'controlnet' && controlImageName && opts.controlnet && opts.controlnet !== 'ipadapter') {
    workflow['10'] = {
      class_type: 'LoadImage',
      inputs: { image: controlImageName },
    };
    workflow['11'] = {
      class_type: 'ControlNetLoader',
      inputs: { control_net_name: `control_${opts.controlnet}.safetensors` },
    };
    workflow['12'] = {
      class_type: 'ControlNetApply',
      inputs: {
        conditioning: ['2', 0],
        control_net: ['11', 0],
        image: ['10', 0],
        strength: 1.0,
      },
    };
    const ks = workflow['5'] as { inputs: Record<string, unknown> };
    ks.inputs.positive = ['12', 0];
  } else if (mode === 'ipadapter' && controlImageName) {
    workflow['10'] = {
      class_type: 'LoadImage',
      inputs: { image: controlImageName },
    };
    workflow['13'] = {
      class_type: 'IPAdapterModelLoader',
      inputs: { ipadapter_file: 'ip-adapter.safetensors' },
    };
    workflow['14'] = {
      class_type: 'CLIPVisionLoader',
      inputs: { clip_name: 'CLIP-ViT-H-14.safetensors' },
    };
    workflow['15'] = {
      class_type: 'IPAdapterApply',
      inputs: {
        ipadapter: ['13', 0],
        clip_vision: ['14', 0],
        image: ['10', 0],
        // F-bdc5a692: read the LoRA chain's tail (falls back to the raw
        // checkpoint '1' when no loras were requested) instead of the
        // hardcoded ['1', 0] this used to carry — that hardcode silently
        // discarded the LoRA stack whenever loras + ipadapter were combined,
        // since this node's output goes on to replace KSampler's model
        // input below, and the LoraLoader chain (built above, before this
        // branch runs) became a dead end with zero effect on the sample.
        model: modelSrc,
        weight: ipAdapterWeight(opts),
        noise: 0,
      },
    };
    const ks = workflow['5'] as { inputs: Record<string, unknown> };
    ks.inputs.model = ['15', 0];
  }

  return workflow;
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

async function readTextCapped(res: Response, cap: number): Promise<string | 'too-large'> {
  const bytes = await readBodyCapped(res, cap);
  if (bytes === 'too-large') return 'too-large';
  return new TextDecoder().decode(bytes);
}

export class ComfyUIProvider implements ImageProvider {
  readonly name = 'comfyui';
  /** Checkpoint actually sent to KSampler (F-b36de2d4). */
  readonly model: string;
  private readonly baseUrl: string;
  private readonly opts: ComfyUIProviderOptions;

  constructor(opts?: ComfyUIProviderOptions) {
    this.opts = opts ?? {};
    this.baseUrl = (opts?.baseUrl ?? 'http://localhost:8188').replace(/\/$/, '');
    this.model = opts?.checkpoint ?? 'sd_xl_base_1.0.safetensors';
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

  /** POST /upload/image so LoadImage / LoadImageMask can see the frame. */
  private async uploadImage(
    bytes: Uint8Array,
    timeout: number,
    filename: string,
  ): Promise<string | GenerationFailure> {
    const form = new FormData();
    const copy = new Uint8Array(bytes);
    form.append('image', new Blob([copy], { type: 'image/png' }), filename);
    form.append('overwrite', 'true');
    const res = await fetch(`${this.baseUrl}/upload/image`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      const text = await readTextCapped(res, ERROR_BODY_CAP);
      if (text === 'too-large') {
        return fail(
          'http_error',
          `ComfyUI image upload failed (HTTP ${res.status}): error body exceeded the ${ERROR_BODY_CAP}-byte cap`,
        );
      }
      return fail(
        'http_error',
        `ComfyUI image upload failed (HTTP ${res.status}): ${excerpt(text || '(no body)')}`,
      );
    }
    const body = await readBodyCapped(res, ERROR_BODY_CAP);
    if (body === 'too-large') {
      return fail('invalid_response', `ComfyUI upload response exceeded the ${ERROR_BODY_CAP}-byte cap`);
    }
    let json: { name?: unknown; subfolder?: unknown };
    try {
      json = JSON.parse(new TextDecoder().decode(body)) as { name?: unknown; subfolder?: unknown };
    } catch {
      return fail(
        'invalid_response',
        'ComfyUI returned a non-JSON response from POST /upload/image (HTTP 200)',
      );
    }
    if (typeof json.name !== 'string' || json.name.length === 0) {
      return fail('invalid_response', 'ComfyUI upload response did not include an image name');
    }
    const sub = typeof json.subfolder === 'string' && json.subfolder.length > 0 ? `${json.subfolder}/` : '';
    return `${sub}${json.name}`;
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
    // GenerationOptions.model is the same checkpoint identity the pipeline
    // keys portraits on (F-b36de2d4). Prefer it over the constructor default
    // so identity and the workflow see one value.
    if (typeof opts?.model === 'string' && opts.model.length > 0) {
      mergedOpts.checkpoint = opts.model;
    } else if (!mergedOpts.checkpoint) {
      mergedOpts.checkpoint = this.model;
    }
    // Resolve the effective seed exactly once (PA-1): the value sent to
    // KSampler and the value reported in the result must be the same number,
    // or the portrait can never be reproduced.
    // Number.isFinite: NaN/Infinity are not nullish, so `seed ?? derived`
    // would send the raw non-finite value to KSampler while identity tags
    // JSON.stringify it as null (F-a623fcff). Treat non-finite as omitted.
    const rawSeed = mergedOpts.seed;
    const seed = typeof rawSeed === 'number' && Number.isFinite(rawSeed)
      ? rawSeed
      : deriveDefaultSeed(prompt, mergedOpts);
    let initImageName: string | undefined;
    if (opts?.initImage && opts.initImage.length > 0) {
      const uploaded = await this.uploadImage(opts.initImage, timeout, 'init.png');
      if (typeof uploaded !== 'string') return uploaded;
      initImageName = uploaded;
    }
    let maskImageName: string | undefined;
    if (initImageName && opts?.mask && opts.mask.length > 0) {
      const uploaded = await this.uploadImage(opts.mask, timeout, 'mask.png');
      if (typeof uploaded !== 'string') return uploaded;
      maskImageName = uploaded;
    }
    let controlImageName: string | undefined;
    if (opts?.controlImage && opts.controlImage.length > 0 && controlMode(mergedOpts)) {
      const uploaded = await this.uploadImage(opts.controlImage, timeout, 'control.png');
      if (typeof uploaded !== 'string') return uploaded;
      controlImageName = uploaded;
    }
    const workflow = buildWorkflow(
      prompt,
      mergedOpts,
      seed,
      initImageName,
      maskImageName,
      controlImageName,
    );
    const start = Date.now();

    // 1. Queue the prompt — bounded + non-JSON-safe (A1).
    const queueRes = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!queueRes.ok) {
      // F-3d137abb: cap before excerpt — queueRes.text() used to buffer the
      // whole error page (proxy dump, busy daemon) then slice 200 chars.
      const text = await readTextCapped(queueRes, ERROR_BODY_CAP);
      if (text === 'too-large') {
        return fail(
          'http_error',
          `ComfyUI queue failed (HTTP ${queueRes.status}): error body exceeded the ${ERROR_BODY_CAP}-byte cap`,
        );
      }
      return fail('http_error', `ComfyUI queue failed (HTTP ${queueRes.status}): ${excerpt(text || '(no body)')}`);
    }

    const queueBytes = await readBodyCapped(queueRes, ERROR_BODY_CAP);
    if (queueBytes === 'too-large') {
      return fail(
        'invalid_response',
        `ComfyUI queue response exceeded the ${ERROR_BODY_CAP}-byte cap`,
      );
    }
    let queueJson: { prompt_id?: unknown };
    try {
      queueJson = JSON.parse(new TextDecoder().decode(queueBytes)) as { prompt_id?: unknown };
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

      const historyBytes = await readBodyCapped(historyRes, ERROR_BODY_CAP);
      if (historyBytes === 'too-large') {
        return fail(
          'invalid_response',
          `ComfyUI history response exceeded the ${ERROR_BODY_CAP}-byte cap`,
        );
      }
      let history: Record<string, HistoryEntry>;
      try {
        history = JSON.parse(new TextDecoder().decode(historyBytes)) as Record<string, HistoryEntry>;
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
      model: mergedOpts.checkpoint ?? this.model,
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
