// Batch portrait generation — roster/chargen fan-out with partial success.

import type { AssetMetadata, AssetStore } from '@ai-rpg-engine/asset-registry';
import { ensurePortrait, generatePortrait, ImageGenError, type PipelineOptions } from './pipeline.js';
import type { ImageProvider, PortraitRequest } from './types.js';

export type PortraitBatchOptions = PipelineOptions & {
  /**
   * Max in-flight generations. Default 1 — ComfyUI's EmptyLatentImage stays
   * `batch_size: 1`, and a local GPU cannot usefully run concurrent queues.
   * Raise this for PlaceholderProvider / remote farms.
   */
  concurrency?: number;
  /** Fired after each request settles (success or isolated failure). */
  onProgress?: (info: PortraitBatchProgress) => void;
  /** Cancel queued (not in-flight) work. Already-started generates finish. */
  signal?: AbortSignal;
};

export type PortraitBatchProgress = {
  completed: number;
  total: number;
  index: number;
  ok: boolean;
};

export type PortraitBatchFailure = {
  ok: false;
  request: PortraitRequest;
  error: ImageGenError | Error;
};

export type PortraitBatchItem = AssetMetadata | PortraitBatchFailure;

export type PortraitBatchResult = {
  results: PortraitBatchItem[];
};

export function isPortraitBatchFailure(item: PortraitBatchItem): item is PortraitBatchFailure {
  return (item as PortraitBatchFailure).ok === false;
}

function toFailure(err: unknown, request: PortraitRequest): PortraitBatchFailure {
  if (err instanceof ImageGenError || err instanceof Error) {
    return { ok: false, request, error: err };
  }
  return { ok: false, request, error: new Error(String(err)) };
}

async function runPool<T>(
  count: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = new Array(count);
  let next = 0;
  async function run(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= count) return;
      results[i] = await worker(i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, count));
  await Promise.all(Array.from({ length: n }, () => run()));
  return results;
}

type OneShot = (
  request: PortraitRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts?: PipelineOptions,
) => Promise<AssetMetadata>;

async function runBatch(
  requests: readonly PortraitRequest[],
  provider: ImageProvider,
  store: AssetStore,
  opts: PortraitBatchOptions | undefined,
  one: OneShot,
): Promise<PortraitBatchResult> {
  if (!Array.isArray(requests)) {
    throw new Error('[image-gen] batch portraits require an array of PortraitRequest');
  }
  const rawConcurrency = opts?.concurrency ?? 1;
  if (typeof rawConcurrency !== 'number' || !Number.isFinite(rawConcurrency) || rawConcurrency < 1) {
    throw new Error(
      `[image-gen] concurrency must be a finite number >= 1 (got ${String(rawConcurrency)})`,
    );
  }
  const concurrency = Math.floor(rawConcurrency);
  const total = requests.length;
  if (total === 0) return { results: [] };

  const pipelineOpts: PipelineOptions | undefined = opts
    ? { generation: opts.generation, extraTags: opts.extraTags }
    : undefined;

  let completed = 0;
  const results = await runPool(total, concurrency, async (index) => {
    const request = requests[index];
    if (opts?.signal?.aborted) {
      completed += 1;
      opts.onProgress?.({ completed, total, index, ok: false });
      return { ok: false as const, request, error: new Error('Aborted') };
    }
    try {
      const meta = await one(request, provider, store, pipelineOpts);
      completed += 1;
      opts?.onProgress?.({ completed, total, index, ok: true });
      return meta;
    } catch (err) {
      completed += 1;
      opts?.onProgress?.({ completed, total, index, ok: false });
      return toFailure(err, request);
    }
  });

  return { results };
}

/** Generate every request; isolate ImageGenError per item so one timeout does not abort the roster. */
export async function generatePortraits(
  requests: readonly PortraitRequest[],
  provider: ImageProvider,
  store: AssetStore,
  opts?: PortraitBatchOptions,
): Promise<PortraitBatchResult> {
  return runBatch(requests, provider, store, opts, generatePortrait);
}

/** Like {@link generatePortraits} but reuses {@link ensurePortrait} identity matching. */
export async function ensurePortraits(
  requests: readonly PortraitRequest[],
  provider: ImageProvider,
  store: AssetStore,
  opts?: PortraitBatchOptions,
): Promise<PortraitBatchResult> {
  return runBatch(requests, provider, store, opts, ensurePortrait);
}
