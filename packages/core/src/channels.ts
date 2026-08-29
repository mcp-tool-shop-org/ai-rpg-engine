// Presentation channels — route events to UI through layered truth filters

import type { ResolvedEvent, EventChannel } from './types.js';

export type ChannelFilter = (event: ResolvedEvent) => ResolvedEvent | null;

/**
 * Optional hook invoked when a channel filter throws during
 * {@link PresentationChannels.present}. Mirrors the EventBus onListenerError
 * pattern: a throwing filter is always isolated (presentation of other
 * channels, events, and batches never aborts); supply this to surface the
 * failure to a dev overlay / log instead of swallowing it.
 */
export type ChannelFilterErrorHook = (
  err: unknown,
  event: ResolvedEvent,
  channel: EventChannel,
) => void;

export type PresentationChannelsOptions = {
  onFilterError?: ChannelFilterErrorHook;
};

function cloneEvent(event: ResolvedEvent): ResolvedEvent {
  return structuredClone(event);
}

/** Stable fingerprint of truth-bearing fields for `_filtered` (content, not identity). */
function eventFingerprint(event: ResolvedEvent): string {
  return JSON.stringify(event);
}

export class PresentationChannels {
  private filters: Map<EventChannel, ChannelFilter[]> = new Map();
  private onFilterError?: ChannelFilterErrorHook;

  constructor(options?: PresentationChannelsOptions) {
    this.onFilterError = options?.onFilterError;
  }

  /** Register a filter on a channel. Filters can modify or suppress events. */
  addFilter(channel: EventChannel, filter: ChannelFilter): void {
    if (!this.filters.has(channel)) {
      this.filters.set(channel, []);
    }
    this.filters.get(channel)!.push(filter);
  }

  /**
   * Route an event through its declared channels, return presented versions.
   *
   * A throwing filter is isolated (v2.5 PC-5) — the same warn-and-degrade
   * contract validators, verb handlers, event listeners, and rule effects
   * already have. The failure mode is FAIL-CLOSED: the event is suppressed on
   * the channel whose filter threw, never passed through unfiltered. Filters
   * are the truth layer (fog-of-war, concealment, narrator distortion), so
   * failing open would leak the objective event to a channel whose broken
   * filter existed precisely to redact it — a missing line of presentation is
   * recoverable, a truth leak is not. The error routes to the optional
   * onFilterError hook; other channels of the same event, and other events in
   * a presentAll batch, present normally.
   */
  present(event: ResolvedEvent): PresentedEvent[] {
    const channels = event.presentation?.channels ?? ['objective'];
    const results: PresentedEvent[] = [];
    // Fingerprint the SOURCE (eventLog entry / caller object) before any
    // filter runs. Each channel starts from its own clone so an in-place
    // redaction cannot write through to the log or to sibling channels
    // (F-4bcdd095 / F-71ec5dcd alias class).
    const sourceFingerprint = eventFingerprint(event);

    for (const channel of channels) {
      let current: ResolvedEvent | null = cloneEvent(event);
      const filters = this.filters.get(channel) ?? [];

      for (const filter of filters) {
        if (!current) break;
        const input: ResolvedEvent = current;
        try {
          current = filter(input);
        } catch (err) {
          if (this.onFilterError) this.onFilterError(err, input, channel);
          // Fail closed: suppress this event on this channel (see doc above).
          current = null;
        }
      }

      if (current) {
        results.push({
          ...current,
          _channel: channel,
          // Content, not identity: an in-place mutator returns the same
          // reference it received (the clone) but still redacted the payload.
          _filtered: eventFingerprint(current) !== sourceFingerprint,
        });
      }
    }

    return results;
  }

  /** Present a batch of events */
  presentAll(events: ResolvedEvent[]): PresentedEvent[] {
    return events.flatMap((e) => this.present(e));
  }

  /** Clear all filters */
  clear(): void {
    this.filters.clear();
  }
}

export type PresentedEvent = ResolvedEvent & {
  /** Which channel delivered this version */
  _channel: EventChannel;
  /** Whether any filter modified this event */
  _filtered: boolean;
};
