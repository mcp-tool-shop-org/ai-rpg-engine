// Event bus — structured event emission and subscription

import type { ResolvedEvent, EventHandler } from './types.js';

export type EventSubscription = {
  eventType: string;
  handler: EventHandler;
};

export class EventBus {
  private listeners: Map<string, EventHandler[]> = new Map();
  private wildcardListeners: EventHandler[] = [];

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

  /** Emit an event to all matching listeners */
  emit(event: ResolvedEvent, world: import('./types.js').WorldState): void {
    // Specific listeners
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      const snapshot = [...handlers];
      for (const handler of snapshot) {
        handler(event, world);
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
          handler(event, world);
        }
      }
    }

    // Wildcard listeners
    const wildcardSnapshot = [...this.wildcardListeners];
    for (const handler of wildcardSnapshot) {
      handler(event, world);
    }
  }

  /** Clear all listeners */
  clear(): void {
    this.listeners.clear();
    this.wildcardListeners = [];
  }
}
