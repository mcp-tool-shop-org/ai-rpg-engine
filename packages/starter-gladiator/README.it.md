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

# @ai-rpg-engine/starter-gladiator

**Esempio di implementazione** — Questo esempio dimostra come collegare i componenti per un combattimento in arena. È un esempio da cui imparare, non un modello da copiare. Consultare la [Guida all'implementazione](../../docs/handbook/57-composition-guide.md) per creare il proprio gioco.

**Iron Colosseum** — Un'arena gladiatoria sotterranea situata sotto un impero in decadenza. Combatti per la libertà, conquista i favori dei patroni e sopravvivi al giudizio della folla.

Parte del catalogo di modelli di avvio per l'[AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Combattimenti nell'arena romana + politica dei patroni. Il favore della folla oscilla notevolmente a seconda dello spettacolo: un alto favore sblocca doni dai patroni, un basso favore significa una condanna a morte. I patroni vedono i gladiatori come "investimenti in sangue e spettacolo".

## Guida Rapida

```typescript
import { createGame } from '@ai-rpg-engine/starter-gladiator';

const engine = createGame();
engine.start();
```

## Modelli dimostrati

| Funzionalità | Cosa mostra Gladiator |
|---------|----------------------|
| **Resources** | Una risorsa meta-dinamica (il favore del pubblico) guidata dallo spettacolo, non dall'efficienza. |
| **Combat** | Progettazione di un boss in tre fasi con cambiamenti dinamici durante l'incontro. |
| **Custom verbs** | Provocazioni e gesti come azioni di combattimento che non infliggono danni, ma influenzano le risorse. |
| **Social** | Sistema di mecenatismo legato a soglie di favore del pubblico. |

## Contenuti

- **5 zone:** Celle di detenzione, Arena, Galleria dei patroni, Arsenale, Uscita del tunnel
- **3 PNG:** Lanista Brutus (maestro dell'arena), Domina Valeria (patrona), Nerva (alleato veterano)
- **2 nemici:** Campione dell'arena, Bestia da guerra
- **1 albero di dialoghi:** Interazione con i patroni su sponsorizzazioni e politica dell'arena
- **1 albero di progressione:** Gloria dell'arena (Acclamato dalla folla → Resistenza di ferro → Combattente per la libertà)
- **1 oggetto:** Getone del patrono (aumenta il favore della folla di 10)

## Meccaniche Uniche

| Verbo | Descrizione |
|------|-------------|
| `taunt` | Provoca i nemici e entusiasma la folla |
| `showboat` | Sacrifica l'efficienza per lo spettacolo e il favore |

## Statistiche e Risorse

| Statistica | Ruolo |
|------|------|
| Forza | Potenza bruta, colpi pesanti |
| Agilità | Velocità, schivata, precisione |
| Carisma | Manipolazione della folla, combattimento teatrale |

| Risorsa | Portata | Note |
|----------|-------|-------|
| HP | 0–40 | Salute standard |
| Affaticamento | 0–50 | Pressione inversa: aumenta in combattimento, si recupera di -2 per tick |
| Favore della folla | 0–100 | Volatile: >75 sblocca doni dai patroni, <25 significa morte |

## Cosa prendere come riferimento

L'economia delle risorse legate alla performance (il favore del pubblico) e la progettazione di un boss in tre fasi. Studiare come il favore del pubblico agisce come una risorsa meta-dinamica che varia in base allo spettacolo piuttosto che all'efficienza, e come il combattimento contro il Campione dell'Arena utilizza le transizioni di fase per modificare le dinamiche del combattimento durante l'incontro.

## Licenza

MIT
