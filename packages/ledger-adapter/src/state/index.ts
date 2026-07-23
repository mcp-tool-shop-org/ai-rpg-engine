// state-impl domain barrel — the adapter's pure state model + serialization.
// No transport, no secrets: this module never imports xrpl and never sees a
// seed. See ./state.ts for the grounding notes and per-function docs.

export {
  createInitialState,
  serializeState,
  deserializeState,
  assignTokenCode,
  getTokenCode,
  computeDeltas,
  advanceBaseline,
} from './state.js';
