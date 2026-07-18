// @ai-rpg-engine/terminal-ui — terminal renderer and input

export {
  renderScene,
  renderEventLog,
  renderActions,
  renderDialogue,
  renderFullScreen,
  parseActionSelection,
  parseTextInput,
  buildActionList,
  humanizeStateId,
  textBar,
  DIALOGUE_LOOKBACK,
  EVENT_LOG_LOOKBACK,
  SCREEN_WIDTH,
  type RenderOptions,
  type ActionOption,
} from './renderer.js';

export {
  detectColorEnabled,
  makePalette,
  stripAnsi,
  type Palette,
} from './styles.js';
