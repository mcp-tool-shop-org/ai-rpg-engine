// ComfyUI provider — direct HTTP API calls to a local ComfyUI server
// Works with any ComfyUI installation (standalone or via comfy-headless).
// Default: http://localhost:8188

import type { ImageProvider, GenerationResult, GenerationOptions } from './types.js';

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
  /** Maximum wait time in ms. Default: 120000 (2 min). */
  timeoutMs?: number;
};

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

  async generate(prompt: string, opts?: GenerationOptions): Promise<GenerationResult> {
    const mergedOpts = { ...this.opts, ...opts };
    const workflow = buildWorkflow(prompt, mergedOpts);
    const start = Date.now();

    // Queue the prompt
    const queueRes = await fetch(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!queueRes.ok) {
      const text = await queueRes.text();
      throw new Error(`ComfyUI queue failed (${queueRes.status}): ${text}`);
    }

    const { prompt_id } = (await queueRes.json()) as { prompt_id: string };

    // Poll for completion
    const pollInterval = this.opts.pollIntervalMs ?? 1000;
    const timeout = this.opts.timeoutMs ?? 120_000;
    const deadline = Date.now() + timeout;

    let outputImages: { filename: string; subfolder: string; type: string }[] = [];

    while (Date.now() < deadline) {
      await sleep(pollInterval);

      const historyRes = await fetch(`${this.baseUrl}/history/${prompt_id}`);
      if (!historyRes.ok) continue;

      const history = (await historyRes.json()) as Record<string, HistoryEntry>;
      const entry = history[prompt_id];
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
      throw new Error(`ComfyUI generation timed out after ${timeout}ms`);
    }

    // Fetch the generated image
    const img = outputImages[0];
    const viewUrl = `${this.baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`;
    const imageRes = await fetch(viewUrl);

    if (!imageRes.ok) {
      throw new Error(`ComfyUI image fetch failed (${imageRes.status})`);
    }

    const imageBuffer = new Uint8Array(await imageRes.arrayBuffer());
    const contentType = imageRes.headers.get('content-type') ?? 'image/png';
    const width = opts?.width ?? 512;
    const height = opts?.height ?? 512;

    return {
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
