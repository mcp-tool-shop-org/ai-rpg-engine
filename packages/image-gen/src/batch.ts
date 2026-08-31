// Batch generation — roster/zone/icon fan-out with partial success.

import type { AssetMetadata, AssetStore } from '@ai-rpg-engine/asset-registry';
import {
  ensurePortrait,
  generatePortrait,
  generateBackground,
  ensureBackground,
  generateIcon,
  ensureIcon,
  ImageGenError,
  type PipelineOptions,
} from './pipeline.js';
import type { ImageProvider, PortraitRequest, SceneRequest, IconRequest } from './types.js';

export type BatchOptions = PipelineOptions & {
  /**
   * Max in-flight generations. Default 1 — ComfyUI's EmptyLatentImage stays
   * `batch_size: 1`, and a local GPU cannot usefully run concurrent queues.
   * Raise this for PlaceholderProvider / remote farms.
   */
  concurrency?: number;
  /** Fired after each request settles (success or isolated failure). */
  onProgress?: (info: BatchProgress) => void;
  /** Cancel queued (not in-flight) work. Already-started generates finish. */
  signal?: AbortSignal;
};

export type BatchProgress = {
  completed: number;
  total: number;
  index: number;
  ok: boolean;
};

export type BatchFailure<TRequest> = {
  ok: false;
  request: TRequest;
  error: ImageGenError | Error;
};

export type BatchItem<TRequest> = AssetMetadata | BatchFailure<TRequest>;

export type BatchResult<TRequest> = {
  results: BatchItem<TRequest>[];
};

export type PortraitBatchOptions = BatchOptions;
export type PortraitBatchProgress = BatchProgress;
export type PortraitBatchFailure = BatchFailure<PortraitRequest>;
export type PortraitBatchItem = BatchItem<PortraitRequest>;
export type PortraitBatchResult = BatchResult<PortraitRequest>;

export type SceneBatchOptions = BatchOptions;
export type SceneBatchFailure = BatchFailure<SceneRequest>;
export type SceneBatchItem = BatchItem<SceneRequest>;
export type SceneBatchResult = BatchResult<SceneRequest>;

export type IconBatchOptions = BatchOptions;
export type IconBatchFailure = BatchFailure<IconRequest>;
export type IconBatchItem = BatchItem<IconRequest>;
export type IconBatchResult = BatchResult<IconRequest>;

export function isBatchFailure<TRequest>(item: BatchItem<TRequest>): item is BatchFailure<TRequest> {
  return (item as BatchFailure<TRequest>).ok === false;
}

export function isPortraitBatchFailure(item: PortraitBatchItem): item is PortraitBatchFailure {
  return isBatchFailure(item);
}

export function isSceneBatchFailure(item: SceneBatchItem): item is SceneBatchFailure {
  return isBatchFailure(item);
}

export function isIconBatchFailure(item: IconBatchItem): item is IconBatchFailure {
  return isBatchFailure(item);
}

function toFailure<TRequest>(err: unknown, request: TRequest): BatchFailure<TRequest> {
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

type OneShot<TRequest> = (
  request: TRequest,
  provider: ImageProvider,
  store: AssetStore,
  opts?: PipelineOptions,
) => Promise<AssetMetadata>;

async function runBatch<TRequest>(
  requests: readonly TRequest[],
  provider: ImageProvider,
  store: AssetStore,
  opts: BatchOptions | undefined,
  one: OneShot<TRequest>,
  label: string,
): Promise<BatchResult<TRequest>> {
  if (!Array.isArray(requests)) {
    throw new Error(`[image-gen] batch ${label} require an array of requests`);
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
  return runBatch(requests, provider, store, opts, generatePortrait, 'portraits');
}

/** Like {@link generatePortraits} but reuses {@link ensurePortrait} identity matching. */
export async function ensurePortraits(
  requests: readonly PortraitRequest[],
  provider: ImageProvider,
  store: AssetStore,
  opts?: PortraitBatchOptions,
): Promise<PortraitBatchResult> {
  return runBatch(requests, provider, store, opts, ensurePortrait, 'portraits');
}

/** Zone atlas fan-out — one ImageGenError must not abort the rest (F-3a495263). */
export async function generateBackgrounds(
  requests: readonly SceneRequest[],
  provider: ImageProvider,
  store: AssetStore,
  opts?: SceneBatchOptions,
): Promise<SceneBatchResult> {
  return runBatch(requests, provider, store, opts, generateBackground, 'backgrounds');
}

/** Like {@link generateBackgrounds} but reuses {@link ensureBackground} identity matching. */
export async function ensureBackgrounds(
  requests: readonly SceneRequest[],
  provider: ImageProvider,
  store: AssetStore,
  opts?: SceneBatchOptions,
): Promise<SceneBatchResult> {
  return runBatch(requests, provider, store, opts, ensureBackground, 'backgrounds');
}

/** Inventory-sheet fan-out — one ImageGenError must not abort the rest (F-3a495263). */
export async function generateIcons(
  requests: readonly IconRequest[],
  provider: ImageProvider,
  store: AssetStore,
  opts?: IconBatchOptions,
): Promise<IconBatchResult> {
  return runBatch(requests, provider, store, opts, generateIcon, 'icons');
}

/** Like {@link generateIcons} but reuses {@link ensureIcon} identity matching. */
export async function ensureIcons(
  requests: readonly IconRequest[],
  provider: ImageProvider,
  store: AssetStore,
  opts?: IconBatchOptions,
): Promise<IconBatchResult> {
  return runBatch(requests, provider, store, opts, ensureIcon, 'icons');
}
