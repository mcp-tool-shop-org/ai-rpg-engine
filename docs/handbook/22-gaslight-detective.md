> Part VI — Starter Worlds

A walkthrough of the detective starter.

## Setting

A fog-choked Victorian estate. A man lies dead in a locked study. Everyone has secrets, and the clock is ticking before the real killer vanishes into the gaslight.

## Contents

| Element | Description |
|---------|-------------|
| The Study | Starting zone — locked-room crime scene with desk, brandy glass, fireplace |
| The Parlour | Social zone — aristocratic setting with portrait, letter tray |
| Servants' Hall | Hidden zone — below-stairs access, key rack, coal chute |
| Front Entrance | Transition zone — foggy public entrance |
| Back Alley | Danger zone — dark, ambush risk, fog chill hazard |
| Lady Ashford | NPC — widow and suspect, eloquence 7, branching interrogation |
| Constable Pike | NPC — law enforcement, grit 6 |
| Mrs Calloway | NPC — servant and witness, perception 5 |
| Dock Thug | Enemy — aggressive AI, guards territory |
| Smelling Salts | Item — restores 6 composure |
| Deduction Mastery | Progression tree — keen-eye → silver-tongue / iron-nerves |

## Ruleset: detective-minimal

| Stat | Role |
|------|------|
| Perception | Notice clues, detect lies, observe details |
| Eloquence | Persuade, interrogate, navigate social encounters |
| Grit | Physical toughness, resist intimidation |

| Resource | Range | Notes |
|----------|-------|-------|
| HP | 0–30 | Physical health |
| Composure | 0–20 | Mental fortitude, regens 1/tick |

Unique verbs: `interrogate` (press for information), `deduce` (draw conclusions from evidence).

## How the Systems Interact

1. **Dialogue** — The widow interrogation branches based on approach. Pressing her sets the `pressed-widow` global flag. Asking about keys reveals `knows-spare-key`.

2. **Cognition** — The suspect paranoia presentation rule makes suspects perceive the inspector's arrival as threatening, influencing NPC behavior.

3. **Environment** — The back alley's fog chill hazard drains composure on entry, creating tension before encounters.

4. **Progression** — Defeating enemies awards XP. The deduction mastery tree grants perception, eloquence, and composure boosts.

5. **Districts** — Ashford Estate (4 zones, aristocratic) vs The Dockyards (1 zone, dockworker-controlled).

## Install

```bash
npm install @ai-rpg-engine/starter-detective
```

```typescript
import { createGame } from '@ai-rpg-engine/starter-detective';
const engine = createGame(42);
```
