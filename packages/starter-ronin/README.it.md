<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# @ai-rpg-engine/starter-ronin

**Jade Veil** — Un castello feudale durante un delicato vertice politico. Un signore è stato avvelenato. Scopri l'assassino prima che l'onore sia compromesso.

Parte del catalogo di pacchetti di avvio [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Mistero feudale + intrighi di corte. L'onore è fragile: le false accuse hanno un costo elevato e sono quasi impossibili da riparare. Ogni domanda ha un peso, ogni accusa ha delle conseguenze. Gli assassini percepiscono il ronin come "una spada senza un signore: imprevedibile".

## Guida Rapida

```typescript
import { createGame } from '@ai-rpg-engine/starter-ronin';

const engine = createGame();
engine.start();
```

## Contenuti

- **5 zone:** Porta del castello, Grande sala, Giardino delle tisane, Camera del signore, Passaggio segreto
- **3 PNG:** Lord Takeda (signore avvelenato), Lady Himiko (sospettata), Magistrato Sato (investigatore)
- **2 nemici:** Assassino nell'ombra, Samurai corrotto
- **1 albero di dialogo:** Briefing del magistrato sull'avvelenamento e sui sospetti di corte
- **1 albero di progressione:** Via della Spada (Mano ferma → Calma interiore → Furia giusta)
- **1 oggetto:** Kit di incenso (ripristina 5 ki)

## Meccaniche Uniche

| Verbo | Descrizione |
|------|-------------|
| `duel` | Sfida marziale formale che utilizza la disciplina. |
| `meditate` | Ripristina ki e compostezza a costo di un turno. |

## Statistiche e Risorse

| Statistica | Ruolo |
|------|------|
| disciplina | Abilità marziale, tecnica della spada, concentrazione. |
| percezione | Consapevolezza, deduzione, interpretazione delle intenzioni. |
| compostezza | Controllo sociale, padronanza emotiva. |

| Risorsa | Portata | Note |
|----------|-------|-------|
| HP | 0–30 | Salute standard |
| Onore | 0–30 | Fragile: le false accuse costano -5, difficile da recuperare. |
| Ki | 0–20 | Energia spirituale, si rigenera a 2 per tick. |

## Licenza

MIT
