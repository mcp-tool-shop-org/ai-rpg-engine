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

# @ai-rpg-engine/starter-vampire

**Crimson Court** — Una decadente dimora aristocratica durante un ballo in maschera. Tre casate di vampiri competono per il dominio, mentre la sete di sangue minaccia di sopraffarti.

Parte del catalogo di modelli di avvio per l'[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Horror gotico + intrighi politici tra vampiri. La sete di sangue aumenta ad ogni istante; se raggiunge 100, il giocatore perde il controllo. Nutrirsi riduce la sete di sangue, ma costa "umanità". I vampiri percepiscono gli umani come "vasi di calore".

## Guida Rapida

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';

const engine = createGame();
engine.start();
```

## Contenuti

- **5 zone:** Grande Sala da Ballo, Galleria Est, Cantina, Giardino Illuminato dalla Luna, Campanile
- **3 PNG:** Duchessa Morvaine (vampira anziana), Cassius (rivale emergente), Serva Elara (umana)
- **2 nemici:** Cacciatore di Streghe, Schiavo Selvaggio
- **1 albero di dialoghi:** Udienza con la Duchessa sugli intrighi politici e sul controllo della sete di sangue
- **1 albero di progressione:** Maestria del Sangue (Volontà di Ferro → Mesmerizzatore → Predatore Apex)
- **1 oggetto:** Fiala di Sangue (riduce la sete di sangue di 15)

## Meccaniche Uniche

| Verbo | Descrizione |
|------|-------------|
| `enthrall` | Dominio sociale soprannaturale tramite la presenza |
| `feed` | Drenare il sangue per ridurre la sete di sangue, a costo dell'umanità |

## Statistiche e Risorse

| Statistica | Ruolo |
|------|------|
| presenza | Dominio sociale, autorità soprannaturale |
| vitalità | Abilità fisica, efficienza nell'alimentazione |
| astuzia | Inganno, percezione, intrighi di corte |

| Risorsa | Intervallo | Note |
|----------|-------|-------|
| HP | 0–30 | Salute standard |
| Sete di Sangue | 0–100 | Pressione inversa: aumenta ad ogni istante, perdita di controllo a 100 |
| Umanità | 0–30 | Ancora morale: al di sotto di 10, blocca le opzioni di dialogo |

## Licenza

MIT
