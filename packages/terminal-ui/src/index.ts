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
  visibleDialogueChoices,
  humanizeStateId,
  textBar,
  formatEventLine,
  DIALOGUE_LOOKBACK,
  EVENT_LOG_LOOKBACK,
  SCREEN_WIDTH,
  BODY_INDENT,
  frameRule,
  clipToWidth,
  wrapToWidth,
  paddedMenuIndex,
  type RenderOptions,
  type FullScreenOptions,
  type ActionOption,
  type ExtraMenuEntry,
  type DialogueChoiceOnScreen,
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

export {
  detectAsciiOnly,
  glyphsFor,
  withGlyphs,
  applyGlyphPunctuation,
  UNICODE_GLYPHS,
  ASCII_GLYPHS,
  type GlyphSet,
} from './glyphs.js';
