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

# @ai-rpg-engine/starter-vampire

**Crimson Court** — Una mansión aristocrática en ruinas durante un baile de máscaras. Tres casas de vampiros compiten por el dominio mientras el hambre amenaza con consumirte.

Parte del catálogo de paquetes de inicio del [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Horror gótico + política de la corte de vampiros. La sed de sangre aumenta con cada instante; si alcanza 100, el jugador pierde el control. Alimentarse reduce la sed de sangre, pero cuesta humanidad. Los vampiros perciben a los humanos como "receptáculos de calor".

## Inicio rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';

const engine = createGame();
engine.start();
```

## Contenido

- **5 zonas:** Gran salón de baile, Galería este, Bodega de vinos, Jardín a la luz de la luna, Campanario.
- **3 PNJ:** Duquesa Morvaine (vampiro anciano), Cassius (vampiro rival), Sirvienta Elara (humana).
- **2 enemigos:** Cazador de brujas, Esclavo salvaje.
- **1 árbol de diálogo:** Audiencia con la duquesa sobre política de la corte y control de la sed de sangre.
- **1 árbol de progresión:** Maestría de la sangre (Voluntad de hierro → Mesmerizador → Depredador ápice).
- **1 objeto:** Viales de sangre (reduce la sed de sangre en 15).

## Mecánicas únicas

| Verbo | Descripción |
|------|-------------|
| `enthrall` | Dominio social sobrenatural utilizando la presencia. |
| `feed` | Drenar sangre para reducir la sed de sangre a costa de la humanidad. |

## Estadísticas y recursos

| Estadística | Rol |
|------|------|
| presencia | Dominio social, autoridad sobrenatural. |
| vitalidad | Habilidad física, eficiencia al alimentarse. |
| astucia | Engaño, percepción, intrigas de la corte. |

| Recurso | Rango | Notas |
|----------|-------|-------|
| HP | 0–30 | Salud estándar |
| Sed de sangre | 0–100 | Presión inversa: aumenta con cada instante, pérdida de control al alcanzar 100. |
| Humanidad | 0–30 | Ancla moral: por debajo de 10, se bloquean opciones de diálogo. |

## Licencia

MIT
