// security/index.ts — barrel for the security-impl domain: the two safety
// rails every other domain (transport-impl, state-impl, settle-impl) builds
// on top of. See guard.ts and secrets.ts for the implementations and the
// escape-the-valley grounding (backpack.py's TESTNET_HOSTS host check and the
// "seeds out of run.json" lesson).

export { TESTNET_HOSTS, assertTestnetHost, resolveTestnetEndpoint } from './guard.js';

export {
  createSidecar,
  putSeed,
  getSeed,
  serializeSidecar,
  deserializeSidecar,
  sidecarPath,
  assertNoSeedsInState,
  loadSidecar,
  saveSidecar,
} from './secrets.js';
