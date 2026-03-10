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

# @ai-rpg-engine/modules

17 moduli di simulazione componibili per il motore AI RPG: combattimento, dialoghi, cognizione, percezione, fazioni e altro.

## Installazione

```bash
npm install @ai-rpg-engine/modules
```

## Moduli

| Modulo | Descrizione |
|--------|-------------|
| `combatCore` | Attacco/difesa, danno, sconfitta, resistenza, guardia, disimpegno. |
| `dialogueCore` | Alberi di dialogo basati su grafi con condizioni. |
| `inventoryCore` | Oggetti, equipaggiamento, utilizzo/equipaggiamento/rimozione dell'equipaggiamento. |
| `traversalCore` | Movimento e validazione dell'uscita dalle zone. |
| `statusCore` | Effetti di stato con durata e accumulo. |
| `environmentCore` | Proprietà dinamiche delle zone, pericoli, decadimento. |
| `cognitionCore` | Credenze, intenzioni, morale e memoria dell'IA. |
| `perceptionFilter` | Canali sensoriali, chiarezza, udito tra zone. |
| `narrativeAuthority` | Verità rispetto alla presentazione, occultamento, distorsione. |
| `progressionCore` | Progressione basata sulla valuta, alberi di abilità. |
| `factionCognition` | Credenze delle fazioni, fiducia, conoscenza tra fazioni. |
| `rumorPropagation` | Diffusione delle informazioni con decadimento della fiducia. |
| `knowledgeDecay` | Erosione della fiducia basata sul tempo. |
| `districtCore` | Memoria spaziale, metriche delle zone, soglie di allerta. |
| `beliefProvenance` | Ricostruzione delle tracce attraverso percezione/cognizione/pettegolezzo. |
| `observerPresentation` | Filtraggio degli eventi per osservatore, tracciamento delle divergenze. |
| `simulationInspector` | Ispezione a runtime, controlli di salute, diagnostica. |
| `combatIntent` | Bias nel processo decisionale dell'IA, morale, logica di fuga. |
| `engagementCore` | Posizionamento in prima/seconda linea, intercettazione delle guardie del corpo. |
| `combatRecovery` | Stati di ferita post-combattimento, guarigione nelle zone sicure. |
| `combatReview` | Spiegazione delle formule, analisi delle probabilità di successo. |
| `defeatFallout` | Conseguenze delle fazioni post-combattimento, variazioni della reputazione. |
| `bossPhaseListener` | Transizioni di fase basate sulla soglia di HP dei boss. |

### Creazione del sistema di combattimento (funzioni pure)

| Esportazione | Scopo |
|--------|---------|
| `combat-roles` | 8 modelli di ruolo, tipi di composizione degli incontri, valutazione del pericolo, definizioni dei boss. |
| `encounter-library` | 5 fabbriche di archetipi di incontri, 3 fabbriche di modelli di boss, controllo dei pacchetti. |
| `combat-summary` | Interrogazione, controllo, formattazione e ispezione del contenuto del combattimento. |

## Utilizzo

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { combatCore, dialogueCore, cognitionCore, perceptionFilter } from '@ai-rpg-engine/modules';

const engine = new Engine({
  manifest: { /* ... */ },
  seed: 42,
  modules: [combatCore(), dialogueCore(), cognitionCore(), perceptionFilter()],
});
```

## Documentazione

- [Moduli (Cap. 6)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/06-modules/)
- [Cognizione dell'IA (Cap. 8)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/08-ai-cognition/)
- [Percezione (Cap. 9)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/09-perception-layers/)
- [Sistema di combattimento (Cap. 47)](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/47-combat-system/)
- [Manuale](https://mcp-tool-shop-org.github.io/ai-rpg-engine/handbook/)
- [GitHub](https://github.com/mcp-tool-shop-org/ai-rpg-engine)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
