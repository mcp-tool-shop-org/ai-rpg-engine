<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="400" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/ai-rpg-engine/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

# AI RPG Engine

Un toolkit TypeScript per creare simulazioni di giochi di ruolo (RPG) deterministiche. È possibile definire le statistiche, scegliere i moduli, collegare un sistema di combattimento e creare contenuti. Il motore gestisce lo stato, gli eventi, il generatore di numeri casuali (RNG), la risoluzione delle azioni e il processo decisionale dell'intelligenza artificiale. Ogni esecuzione è riproducibile.

Questo è un **motore di composizione**, non un gioco completo. I 10 mondi di esempio sono modelli che possono essere riutilizzati e modificati. Il proprio gioco utilizzerà solo i moduli del motore necessari.

---

## Cosa è questo

- Una **libreria di moduli** — più di 27 moduli che coprono combattimento, percezione, cognizione, fazioni, voci, esplorazione, compagni e altro.
- Un **toolkit di composizione** — `buildCombatStack()` collega il sistema di combattimento in circa 7 righe; `new Engine({ modules })` avvia il gioco.
- Un **ambiente di esecuzione per simulazioni** — tick deterministici, log delle azioni riproducibili, RNG con seme.
- Uno **studio di progettazione dell'intelligenza artificiale** (opzionale) — strumenti di scaffolding, analisi critica, analisi dell'equilibrio, ottimizzazione e sperimentazione tramite Ollama.

## Cosa non è questo

- Non è un gioco giocabile "out of the box" — è necessario comporlo utilizzando moduli e contenuti.
- Non è un motore grafico — produce eventi strutturati, non pixel.
- Non è un generatore di storie — simula mondi; la narrazione emerge dalle meccaniche.

---

## Stato attuale (v2.3.0)

**Cosa funziona ed è stato testato:**
- Core runtime: stato del mondo, eventi, azioni, tick, replay — stabile dalla versione 1.0.
- Sistema di combattimento: 5 azioni, 4 stati di combattimento, 4 stati di ingaggio, intercettazione dei compagni, flusso di sconfitta, tattiche dell'IA — 1099 test.
- Abilità: costi, tempi di ricarica, controlli delle statistiche, effetti tipizzati, vocabolario di stati, selezione consapevole dell'IA.
- Livello di decisione unificato: combattimento + punteggio delle abilità uniti in una singola chiamata (`selectBestAction`).
- 10 mondi di esempio con nemici con statistiche diverse e completa integrazione del combattimento.
- `buildCombatStack()` elimina circa 40 righe di configurazione del combattimento per mondo.
- Tassonomia di tag e utilità di validazione per la creazione di contenuti.
- Validazione delle fasi del boss con tracciamento dei tag tra le fasi.

**Cosa è ancora in fase di sviluppo o incompleto:**
- Gli strumenti di creazione del mondo per l'intelligenza artificiale (livello Ollama) funzionano, ma sono stati testati meno rispetto alla simulazione.
- La shell CLI dello studio è funzionale, ma non ancora ottimizzata.
- Solo 1 dei 10 mondi di esempio utilizza `buildCombatStack` (Weird West); gli altri utilizzano collegamenti manuali più complessi.
- Non esiste ancora un sistema di profili — i mondi sono autonomi e non possono essere composti da profili condivisi.
- La documentazione è completa (57 capitoli), ma non tutti i capitoli riflettono le ultime API.

---

## Guida rapida

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, createTraversalCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [...combat.modules, createTraversalCore(), createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consultare la [Guida alla composizione](docs/handbook/57-composition-guide.md) per il flusso di lavoro completo.

---

## Architettura

| Livello | Ruolo |
|-------|------|
| **Core Runtime** | Motore deterministico — stato del mondo, eventi, azioni, tick, RNG, replay. |
| **Modules** | Più di 27 sistemi componibili — combattimento, percezione, cognizione, fazioni, esplorazione, compagni, ecc. |
| **Content** | Entità, zone, dialoghi, oggetti, abilità, stati — creati dall'utente. |
| **AI Studio** | Livello Ollama opzionale — scaffolding, analisi critica, analisi dell'equilibrio, ottimizzazione, sperimentazione. |

---

## Sistema di combattimento

Cinque azioni (attacco, guardia, disimpegno, parata, riposizionamento), quattro stati di combattimento (in guardia, sbilanciato, esposto, in fuga), quattro stati di ingaggio (ingaggiato, protetto, retroguardia, isolato). Tre dimensioni delle statistiche guidano ogni formula, quindi un duellante veloce gioca in modo diverso da un combattente pesante o da un sentinella composto.

Gli avversari con intelligenza artificiale utilizzano un sistema di punteggio decisionale unificato — le azioni di combattimento e le abilità competono in una singola valutazione, con soglie configurabili per evitare un eccessivo utilizzo di abilità marginali.

Gli autori dei pacchetti utilizzano `buildCombatStack()` per implementare il combattimento in circa 7 righe: mappatura delle statistiche, profilo delle risorse ed etichette di bias. Consultare la [Panoramica del combattimento](docs/handbook/49a-combat-overview.md) e la [Guida per gli autori dei pacchetti](docs/handbook/55-combat-pack-guide.md).

---

## Abilità

Sistema di abilità specifico per il genere, con costi, controlli delle statistiche, tempi di ricarica ed effetti tipizzati (danno, guarigione, applicazione di stati, purificazione). Gli effetti di stato utilizzano un vocabolario semantico con 11 tag, con profili di resistenza/vulnerabilità. La selezione consapevole dell'IA valuta percorsi auto/AoE/singolo bersaglio.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

---

## Pacchetti

| Pacchetto | Scopo |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Motore di simulazione deterministico — stato del mondo, eventi, RNG, tick, risoluzione delle azioni |
| [`@ai-rpg-engine/modules`](packages/modules) | 27+ moduli componibili: combattimento, percezione, cognizione, fazioni, voci, esplorazione, compagni, autonomia dei personaggi non giocanti (PNG), mappa strategica, riconoscimento degli oggetti, opportunità emergenti, rilevamento degli archi narrativi, trigger per la fine del gioco. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e validatori canonici per i contenuti del mondo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Stato di progressione del personaggio, ferite, tappe fondamentali, reputazione. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell'archetipo, generazione della build, equipaggiamento iniziale. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipi di equipaggiamento, provenienza degli oggetti, crescita degli artefatti. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti delle relazioni, stato della campagna. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione assistita dall'IA (opzionale) — scaffolding, valutazione, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | Studio di progettazione basato su riga di comando. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motore di rendering per terminale e livello di input. |

### Esempi iniziali

I 10 mondi iniziali sono **esempi di composizione**: dimostrano come combinare i moduli del motore per creare giochi completi. Ognuno mostra schemi diversi (mappature delle statistiche, profili delle risorse, configurazioni degli scontri, set di abilità). Consultare il file README di ogni esempio iniziale per le sezioni "Schemi dimostrati" e "Cosa prendere in prestito".

| Iniziale | Genere | Schemi chiave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Dark fantasy | Combattimento minimo, guidato dal dialogo. |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Risorse, ruoli negli scontri. |
| [`starter-detective`](packages/starter-detective) | Mistero vittoriano | Priorità all'interazione sociale, forte enfasi sulla percezione. |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Combattimento navale + corpo a corpo, più zone. |
| [`starter-zombie`](packages/starter-zombie) | Sopravvivenza agli zombie | Scarsità, risorsa "infezione". |
| [`starter-weird-west`](packages/starter-weird-west) | West selvaggio | Riferimento a `buildCombatStack`, preferenze per i pacchetti. |
| [`starter-colony`](packages/starter-colony) | Colonia fantascientifica | Punti di strozzatura, zone di imboscata. |
| [`starter-ronin`](packages/starter-ronin) | Giappone feudale | Passaggi nascosti, molteplici ruoli di protezione. |
| [`starter-vampire`](packages/starter-vampire) | Horror vampiresco | Risorsa "sangue", manipolazione sociale. |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiatore storico | Combattimento nell'arena, favore del pubblico. |

---

## Documentazione

| Risorse. | Descrizione. |
|----------|-------------|
| [Composition Guide](docs/handbook/57-composition-guide.md) | Crea il tuo gioco componendo moduli del motore: inizia qui. |
| [Combat Overview](docs/handbook/49a-combat-overview.md) | Sei pilastri del combattimento, cinque azioni, stato a colpo d'occhio. |
| [Pack Author Guide](docs/handbook/55-combat-pack-guide.md) | Costruzione passo-passo di `buildCombatStack`, mappatura delle statistiche, profili delle risorse. |
| [Handbook](docs/handbook/index.md) | 26 capitoli + 4 appendici che coprono ogni sistema. |
| [Composition Model](docs/composition-model.md) | I 6 livelli riutilizzabili e come si combinano. |
| [Examples](docs/examples/) | Esempi in TypeScript eseguibili: gruppo misto, tra mondi, da zero. |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline delle azioni, verità vs presentazione. |
| [Philosophy](PHILOSOPHY.md) | Perché mondi deterministici, progettazione basata su evidenze e l'intelligenza artificiale come assistente. |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni. |

---

## Roadmap (piano di sviluppo)

### Dove siamo ora

Il runtime della simulazione e il sistema di combattimento sono solidi: 2661 test, 10 esempi di genere, replay deterministico, valutazione completa delle decisioni dell'intelligenza artificiale. Il motore funziona come un toolkit di composizione: scegli i moduli, definisci le statistiche, collega i componenti e crea contenuti. La documentazione copre ogni sistema, ma è necessario un aggiornamento dell'API per le ultime aggiunte.

### Nelle prossime settimane

- Migrare i restanti 9 esempi iniziali a `buildCombatStack` (l'esempio del West selvaggio è il riferimento).
- Sincronizzazione della documentazione dell'API: `submitActionAs`, `selectBestAction`, `resourceCaps`, tassonomia dei tag.
- Miglioramento dei file README degli esempi iniziali: istruzioni più chiare su "Cosa prendere in prestito" e come remixare.
- Collegamenti incrociati: file README, guida alla composizione, esempi e manuale collegati tra loro.

### Obiettivo: Profili personalizzabili

L'obiettivo finale del motore sono i **profili definiti dall'utente**: pacchetti portabili che si integrano in qualsiasi gioco. Un profilo include una mappatura delle statistiche, un comportamento delle risorse, tag di preferenza dell'intelligenza artificiale, abilità e hook degli scontri in un'unica unità importabile. Due giocatori con profili diversi possono condividere lo stesso mondo, ognuno con il proprio stile di gioco.

I profili si basano sulla composizione (già funzionante) e sul livello di decisione unificato (disponibile dalla versione 2.3.0). Il lavoro rimanente consiste nella definizione dello schema del profilo, nella creazione del loader e nella validazione delle interazioni tra profili. Consultare [Roadmap dei profili](docs/profile-roadmap.md) per il piano completo.

---

## Filosofia

Il motore AI RPG è costruito attorno a tre idee:

1. **Mondi deterministici:** i risultati della simulazione devono essere riproducibili.
2. **Progettazione basata su evidenze:** le meccaniche del mondo devono essere testate tramite simulazione.
3. **L'intelligenza artificiale come assistente, non come autorità:** gli strumenti di intelligenza artificiale aiutano a generare e valutare i progetti, ma non sostituiscono i sistemi deterministici.

Consultare [PHILOSOPHY.md](PHILOSOPHY.md) per una spiegazione completa.

---

## Sicurezza

AI RPG Engine è una **libreria di simulazione esclusivamente locale**. Nessuna telemetria, nessuna rete, nessun segreto. I file di salvataggio vengono scritti nella cartella `.ai-rpg-engine/` solo quando esplicitamente richiesto. Consultare [SECURITY.md](SECURITY.md) per i dettagli.

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
