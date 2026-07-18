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
  formatEventLine,
  DIALOGUE_LOOKBACK,
  EVENT_LOG_LOOKBACK,
  SCREEN_WIDTH,
  type RenderOptions,
  type ActionOption,
} from './renderer.js';

export {
  TurnPresenter,
  presentTurn,
  renderNarrationLine,
  narrationTextFromEvents,
  PRESENTATION_TICK_MS,
  QUIET_TURN_TEXT,
  type PresentedTurn,
  type PresentTurnOptions,
  type TurnPresenterOptions,
} from './presentation.js';

export {
  detectColorEnabled,
  makePalette,
  stripAnsi,
  type Palette,
} from './styles.js';
