// Presentation channels — route events to UI through layered truth filters

import type { ResolvedEvent, EventChannel, EventPresentation } from './types.js';

export type ChannelFilter = (event: ResolvedEvent) => ResolvedEvent | null;

export class PresentationChannels {
  private filters: Map<EventChannel, ChannelFilter[]> = new Map();

  /** Register a filter on a channel. Filters can modify or suppress events. */
  addFilter(channel: EventChannel, filter: ChannelFilter): void {
    if (!this.filters.has(channel)) {
      this.filters.set(channel, []);
    }
    this.filters.get(channel)!.push(filter);
  }

  /** Route an event through its declared channels, return presented versions */
  present(event: ResolvedEvent): PresentedEvent[] {
    const channels = event.presentation?.channels ?? ['objective'];
    const results: PresentedEvent[] = [];

    for (const channel of channels) {
      let current: ResolvedEvent | null = event;
      const filters = this.filters.get(channel) ?? [];
      let wasFiltered = false;

      for (const filter of filters) {
        if (!current) break;
        const result = filter(current);
        if (result !== current) wasFiltered = true;
        current = result;
      }

      if (current) {
        results.push({
          ...current,
          _channel: channel,
          _filtered: wasFiltered,
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
