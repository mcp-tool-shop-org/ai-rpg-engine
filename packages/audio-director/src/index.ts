export type {
  AudioDomain,
  AudioCommand,
  DuckingRule,
  CooldownEntry,
  AudioDirectorConfig,
} from './types.js';

export {
  DEFAULT_DOMAIN_PRIORITIES,
  DEFAULT_DUCKING_RULES,
} from './types.js';

export { AudioDirector } from './director.js';

export {
  scheduleAll,
  scheduleSfx,
  scheduleAmbient,
  scheduleMusic,
  scheduleVoice,
} from './scheduler.js';
