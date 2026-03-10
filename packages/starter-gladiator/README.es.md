<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-gladiator

**Coliseo de Hierro** — Una arena gladiatorial subterránea bajo un imperio en decadencia. Lucha por la libertad, gana patrocinadores y sobrevive al juicio del público.

Parte del catálogo de paquetes de inicio del [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Combate en arena romana + política de patrocinio. El favor del público fluctúa drásticamente según el espectáculo; un alto favor desbloquea regalos de los patrocinadores, mientras que un bajo favor puede significar la muerte. Los patrocinadores ven a los gladiadores como "inversiones en sangre y espectáculo".

## Inicio rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.start();
```

## Contenido

- **5 zonas:** Celdas de detención, suelo de la arena, galería de patrocinadores, armería, salida del túnel.
- **3 PNJ:** Lanista Brutus (maestro de la arena), Domina Valeria (patrocinadora), Nerva (aliado veterano).
- **2 enemigos:** Campeón de la arena, bestia de guerra.
- **1 árbol de diálogo:** Audiencia del patrocinador sobre patrocinio y política de la arena.
- **1 árbol de progresión:** Gloria en la arena (Complacer al público → Resistencia de hierro → Luchador por la libertad).
- **1 objeto:** Ficha de patrocinador (aumenta el favor del público en 10).

## Mecánicas únicas

| Verbo | Descripción |
|------|-------------|
| `taunt` | Provoca a los enemigos y emociona al público. |
| `showboat` | Sacrifica la eficiencia por el espectáculo y el favor. |

## Estadísticas y recursos

| Estadística | Rol |
|------|------|
| fuerza | Poder bruto, golpes pesados. |
| agilidad | Velocidad, evasión, precisión. |
| espectacularidad | Manipulación del público, combate teatral. |

| Recurso | Rango | Notas |
|----------|-------|-------|
| HP | 0–40 | Salud estándar |
| Fatiga | 0–50 | Presión inversa: aumenta en combate, se recupera -2 por tick. |
| Favor del público | 0–100 | Volátil: >75 desbloquea regalos del patrocinador, <25 significa la muerte. |

## Licencia

MIT
