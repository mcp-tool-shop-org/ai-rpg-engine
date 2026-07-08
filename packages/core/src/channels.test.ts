// PresentationChannels filter isolation — dogfood v2.5 finding PC-5.
//
// `present()` ran consumer filters bare: one throwing filter (fog-of-war /
// truth-layer code) aborted the entire event-rendering path with a raw stack —
// the ONE core consumer-extension seam lacking the warn-and-degrade discipline
// applied to validators (actions.ts), verb handlers, event listeners
// (events.ts invokeListener), and rule effects (modules.ts).
//
// Failure mode is FAIL-CLOSED by design: presentation filters are the truth
// layer, so when one throws, the event is SUPPRESSED on that channel rather
// than passed through unfiltered. Failing open would leak the objective event
// to a channel whose (broken) filter existed precisely to redact it — a
// missing line of presentation is recoverable, a truth leak is not. The
// failure surfaces via the optional onFilterError hook, mirroring the
// EventBus onListenerError pattern.

import { describe, it, expect } from 'vitest';
import { PresentationChannels } from './channels.js';
import type { EventChannel, ResolvedEvent } from './types.js';

function evt(id: string, channels: EventChannel[] = ['objective']): ResolvedEvent {
  return {
    id,
    tick: 0,
    type: 'test.presented',
    payload: { secret: 'the-truth' },
    presentation: { channels },
  };
}

describe('pc5 — a throwing presentation filter is isolated (warn-and-degrade)', () => {
  it('pc5-001: present() does not throw when a filter throws', () => {
    const channels = new PresentationChannels();
    channels.addFilter('objective', () => {
      throw new Error('broken fog-of-war filter');
    });
    expect(() => channels.present(evt('e1'))).not.toThrow();
  });

  it('pc5-002: fail-closed — the event is suppressed on the channel whose filter threw', () => {
    const channels = new PresentationChannels();
    channels.addFilter('objective', () => {
      throw new Error('broken filter');
    });
    const results = channels.present(evt('e1'));
    // No unfiltered truth leaks through the broken filter's channel.
    expect(results.filter((r) => r._channel === 'objective')).toHaveLength(0);
  });

  it('pc5-003: other channels of the same event still present normally', () => {
    const channels = new PresentationChannels();
    channels.addFilter('objective', () => {
      throw new Error('broken filter');
    });
    const results = channels.present(evt('e1', ['objective', 'system']));
    expect(results.filter((r) => r._channel === 'objective')).toHaveLength(0);
    const system = results.filter((r) => r._channel === 'system');
    expect(system).toHaveLength(1);
    expect(system[0].id).toBe('e1');
  });

  it('pc5-004: onFilterError receives the error, the event as the filter saw it, and the channel', () => {
    const calls: Array<{ err: unknown; eventId: string; channel: EventChannel }> = [];
    const channels = new PresentationChannels({
      onFilterError: (err, event, channel) => {
        calls.push({ err, eventId: event.id, channel });
      },
    });
    channels.addFilter('narrator', () => {
      throw new Error('bad narrator filter');
    });
    channels.present(evt('e7', ['narrator']));

    expect(calls).toHaveLength(1);
    expect((calls[0].err as Error).message).toBe('bad narrator filter');
    expect(calls[0].eventId).toBe('e7');
    expect(calls[0].channel).toBe('narrator');
  });

  it('pc5-005: presentAll survives one bad filter — the rest of the batch still presents', () => {
    const channels = new PresentationChannels();
    channels.addFilter('objective', (event) => {
      if (event.id === 'poison') throw new Error('chokes on this one event');
      return event;
    });
    const results = channels.presentAll([evt('a'), evt('poison'), evt('b')]);
    expect(results.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('pc5-006: without a hook the failure is swallowed and later events still flow (degrade, not crash)', () => {
    const channels = new PresentationChannels();
    let first = true;
    channels.addFilter('objective', (event) => {
      if (first) {
        first = false;
        throw new Error('transient failure');
      }
      return event;
    });
    expect(channels.present(evt('e1'))).toHaveLength(0); // suppressed, no throw
    const second = channels.present(evt('e2'));
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe('e2');
  });

  it('pc5-007: control — well-behaved filters still transform and suppress as before', () => {
    const channels = new PresentationChannels();
    channels.addFilter('objective', (event) => ({
      ...event,
      payload: { ...event.payload, redacted: true },
    }));
    channels.addFilter('system', () => null); // deliberate suppression

    const results = channels.present(evt('e1', ['objective', 'system']));
    expect(results).toHaveLength(1);
    expect(results[0]._channel).toBe('objective');
    expect(results[0]._filtered).toBe(true);
    expect(results[0].payload.redacted).toBe(true);
  });
});
