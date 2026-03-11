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

> **Esempio di composizione** — Questo progetto dimostrativo mostra come configurare il motore per un'esperienza horror gotica incentrata sui vampiri. È un esempio da cui imparare, non un modello da copiare. Consultare la [Guida alla composizione](../../docs/handbook/57-composition-guide.md) per creare il proprio gioco.

**Crimson Court** — Una decadente dimora aristocratica durante un ballo in maschera. Tre casate di vampiri competono per il dominio, mentre la sete di sangue minaccia di sopraffarti.

Parte del catalogo di progetti dimostrativi [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Horror gotico + politica della corte dei vampiri. La sete di sangue aumenta ad ogni istante; se raggiunge 100, il giocatore perde il controllo. Nutrirsi riduce la sete di sangue, ma costa "umanità". I vampiri percepiscono gli umani come "vasi di calore".

## Guida rapida

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';

const engine = createGame();
engine.start();
```

## Modelli dimostrati

| Caratteristica | Cosa mostra "Vampire" |
|---------|---------------------|
| **Resources** | Risorse duali opposte (sete di sangue aumenta, umanità diminuisce), creando un'economia morale. |
| **Cognition** | I vampiri percepiscono gli umani in modo diverso: regola di presentazione per le entità viventi. |
| **Dialogue** | Opzioni limitate: una bassa "umanità" blocca i rami di dialogo. |
| **Progression** | Albero di poteri soprannaturali con abilità di controllo sociale in aumento. |

## Contenuti

- **5 zone:** Sala da ballo, Galleria Est, Cantina, Giardino illuminato dalla luna, Campanile.
- **3 PNG:** Duchessa Morvaine (vampira anziana), Cassius (rivale emergente), Serva Elara (umana).
- **2 nemici:** Cacciatore di streghe, Schiavo selvaggio.
- **1 albero di dialogo:** Udienza con la Duchessa sulla politica della corte e sul controllo della sete di sangue.
- **1 albero di progressione:** Maestria del sangue (Volontà di ferro → Mesmerizzatore → Predatore apicale).
- **1 oggetto:** Fiala di sangue (riduce la sete di sangue di 15).

## Meccaniche uniche

| Verbo | Descrizione |
|------|-------------|
| `enthrall` | Dominio sociale soprannaturale tramite la "presenza". |
| `feed` | Drenare il sangue per ridurre la sete di sangue, a costo dell'umanità. |

## Statistiche e risorse

| Statistica | Ruolo |
|------|------|
| presenza | Dominio sociale, autorità soprannaturale. |
| vitalità | Abilità fisica, efficienza nell'alimentazione. |
| astuzia | Inganno, percezione, intrighi di corte. |

| Risorsa | Intervallo | Note |
|----------|-------|-------|
| HP | 0–30 | Salute standard |
| Sete di sangue | 0–100 | Pressione inversa: aumenta ad ogni istante, perdita di controllo a 100. |
| Umanità | 0–30 | Ancora morale: al di sotto di 10 blocca le opzioni di dialogo. |

## Cosa prendere in prestito

Risorse duali opposte (sete di sangue vs umanità). Studiare come due risorse che si muovono in direzioni opposte creano un'economia morale: nutrirsi riduce la sete di sangue, ma costa umanità, rendendo ogni decisione relativa alle risorse una scelta narrativa con conseguenze permanenti.

## Licenza

MIT
