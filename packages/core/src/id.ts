// Deterministic ID generation for engine entities and events

let counter = 0;

export function resetIdCounter(value = 0): void {
  counter = value;
}

export function nextId(prefix = 'sf'): string {
  return `${prefix}_${(++counter).toString(36)}`;
}
