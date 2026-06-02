// Event bus — structured event emission and subscription

import type { ResolvedEvent, EventHandler } from './types.js';

export type EventSubscription = {
  eventType: string;
  handler: EventHandler;
};

/**
 * Optional hook invoked when a subscriber throws during {@link EventBus.emit}.
 * Lets a host surface listener failures (dev overlay, log) without letting one
 * bad consumer abort the tick. When no hook is supplied the error is swallowed
 * so dispatch always completes — a listener failure must never break the
 * simulation loop or propagate a raw stack to other listeners.
 */
export type EventBusListenerErrorHook = (
  err: unknown,
  event: ResolvedEvent,
) => void;

export type EventBusOptions = {
  onListenerError?: EventBusListenerErrorHook;
};

export class EventBus {
  private listeners: Map<string, EventHandler[]> = new Map();
  private wildcardListeners: EventHandler[] = [];
  private onListenerError?: EventBusListenerErrorHook;

  constructor(options?: EventBusOptions) {
    this.onListenerError = options?.onListenerError;
  }

  /**
   * Invoke one subscriber in isolation. A throwing consumer listener is caught
   * and routed to onListenerError (if any), then dispatch continues to the next
   * listener. This is the WARN-AND-DEGRADE contract for the event bus: one bad
   * consumer cannot abort the tick, drop other subscribers, or leak a stack.
   */
  private invokeListener(
    handler: EventHandler,
    event: ResolvedEvent,
    world: import('./types.js').WorldState,
  ): void {
    try {
      handler(event, world);
    } catch (err) {
      if (this.onListenerError) this.onListenerError(err, event);
    }
  }

  /** Subscribe to a specific event type */
  on(eventType: string, handler: EventHandler): void {
    const existing = this.listeners.get(eventType);
    if (existing) {
      existing.push(handler);
    } else {
      this.listeners.set(eventType, [handler]);
    }
  }

  /** Subscribe to all events */
  onAny(handler: EventHandler): void {
    this.wildcardListeners.push(handler);
  }

  /** Remove a specific listener */
  off(eventType: string, handler: EventHandler): void {
    const existing = this.listeners.get(eventType);
    if (existing) {
      const idx = existing.indexOf(handler);
      if (idx !== -1) existing.splice(idx, 1);
    }
  }

  /** Remove a wildcard listener */
  offAny(handler: EventHandler): void {
    const idx = this.wildcardListeners.indexOf(handler);
    if (idx !== -1) this.wildcardListeners.splice(idx, 1);
  }

  /**
   * Emit an event to all matching listeners. Each listener runs in isolation
   * (see {@link invokeListener}) so a throwing subscriber cannot abort the tick
   * or stop sibling listeners from firing.
   */
  emit(event: ResolvedEvent, world: import('./types.js').WorldState): void {
    // Specific listeners
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      const snapshot = [...handlers];
      for (const handler of snapshot) {
        this.invokeListener(handler, event, world);
      }
    }

    // Domain wildcard: "combat.*" matches "combat.contact.hit"
    const dotIndex = event.type.indexOf('.');
    if (dotIndex !== -1) {
      const domain = event.type.substring(0, dotIndex);
      const domainWildcard = `${domain}.*`;
      const domainHandlers = this.listeners.get(domainWildcard);
      if (domainHandlers) {
        const domainSnapshot = [...domainHandlers];
        for (const handler of domainSnapshot) {
          this.invokeListener(handler, event, world);
        }
      }
    }

    // Wildcard listeners
    const wildcardSnapshot = [...this.wildcardListeners];
    for (const handler of wildcardSnapshot) {
      this.invokeListener(handler, event, world);
    }
  }

  /** Clear all listeners */
  clear(): void {
    this.listeners.clear();
    this.wildcardListeners = [];
  }
}
