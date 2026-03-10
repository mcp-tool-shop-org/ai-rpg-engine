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

# @ai-rpg-engine/starter-cyberpunk

**Neon Lockbox** — un mondo di esempio cyberpunk per il motore di giochi di ruolo AI.

## Installazione

```bash
npm install @ai-rpg-engine/starter-cyberpunk
```

## Cosa imparerai

Questo esempio dimostra la flessibilità del motore: lo stesso stack tecnologico con un modello di statistiche completamente diverso.

| Caratteristiche | Cosa offre Neon Lockbox |
|---|---|
| **Rulesets** | `cyberpunkMinimalRuleset` — statistiche (chrome/riflessi/netrunning), risorse (hp/ice/larghezza di banda), 8 azioni, tra cui `hack` e `jack-in`. |
| **Zones & traversal** | 3 zone (strada → sala server → caveau) con illuminazione, pericoli e elementi interattivi. |
| **Districts** | Quartiere residenziale (pubblico) vs. complesso del caveau (sicuro, controllato da una fazione). |
| **Dialogue** | Briefing di un intermediario con 3 percorsi e effetti globali. |
| **Combat** | Sentinella ICE con intelligenza artificiale aggressiva, obiettivo: proteggere il caveau. |
| **Cognition & perception** | Decadimento e instabilità più elevati, percezione basata sui "riflessi" con la statistica "netrunning". |
| **Progression** | Albero di abilità di netrunning a 3 nodi (Packet Sniffer → ICE Hardening → Neural Boost). |
| **Environment** | Pericolo di cavi scoperti che infliggono 2 danni ai punti ferita all'ingresso nella zona. |
| **Factions** | Fazione Vault-ICE con una coesione di 0.95. |
| **Belief provenance** | Propagazione delle voci più rapida (delay=1) con una distorsione del 3% per ogni passaggio. |
| **Inventory** | Programma ICE Breaker — riduce l'ICE del bersaglio di 8. |
| **Presentation rules** | Gli agenti ICE segnalano tutte le entità non-ICE come intrusioni. |

### Fantasy vs Cyberpunk — stesso motore, regole diverse

| | Chapel Threshold | Neon Lockbox |
|---|---|---|
| Statistiche | vigor / instinct / will | chrome / reflex / netrunning |
| Risorse | hp, stamina | hp, ice, bandwidth |
| Azioni uniche | — | hack, jack-in |
| Percezione | predefinita | basata sui riflessi + senso di netrunning |
| Decadimento della cognizione | 0.02 (valore base) | 0.03 (valore base), 0.8 di instabilità |
| Propagazione delle voci | delay=2, nessuna distorsione | delay=1, 3% di distorsione |

## Cosa c'è dentro

- **3 zone** — Strada al livello della strada, sala server abbandonata, caveau dati.
- **1 PNG** — Kira l'intermediaria (dialogo introduttivo, 3 percorsi di conversazione).
- **1 nemico** — Sentinella ICE (intelligenza artificiale aggressiva, obiettivo: proteggere il caveau).
- **1 oggetto** — Programma ICE Breaker (riduce la risorsa ICE del bersaglio).
- **1 albero di progressione** — Abilità di netrunning (Packet Sniffer → ICE Hardening → Neural Boost).
- **1 regola di presentazione** — Gli agenti ICE segnalano tutte le entità non-ICE come intrusioni.
- **15 moduli collegati** — Lo stesso stack completo di Chapel Threshold, con una configurazione diversa.

## Utilizzo

```typescript
import { createGame } from '@ai-rpg-engine/starter-cyberpunk';

// One line — all 15 modules, content, and ruleset pre-wired
const engine = createGame(77);

// Or import pieces individually:
import { manifest, zones, fixerDialogue, cyberpunkMinimalRuleset } from '@ai-rpg-engine/starter-cyberpunk';
```

## Documentazione

- [Neon Lockbox (Cap. 21)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/21-neon-lockbox/)
- [Manuale](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
