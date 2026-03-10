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

Un toolkit avanzato per la creazione, l'analisi e l'ottimizzazione di mondi di gioco di ruolo (RPG).

L'AI RPG Engine combina un motore di simulazione deterministica con un ambiente di progettazione assistito dall'intelligenza artificiale, consentendo agli autori di creare mondi, testarli tramite simulazione e migliorarli sulla base di dati concreti, anziché di semplici ipotesi.

> Gli strumenti tradizionali vi aiutano a scrivere storie.
> L'AI RPG Engine vi aiuta a **testare i mondi**.

---

## Cosa fa

```
build → critique → simulate → analyze → tune → experiment
```

È possibile generare contenuti per il mondo di gioco, valutare i progetti, eseguire simulazioni deterministiche, analizzare il comportamento delle partite, ottimizzare le meccaniche, eseguire esperimenti su diverse configurazioni e confrontare i risultati. Ogni risultato è riproducibile, verificabile e spiegabile.

---

## Funzionalità principali

### Simulazione deterministica

Un motore di simulazione basato su eventi per mondi di giochi di ruolo. Include lo stato del mondo, un sistema di eventi, livelli di percezione e cognizione, propagazione delle credenze delle fazioni, sistemi di voci, metriche dei distretti con derivazione dell'umore, autonomia dei personaggi non giocanti con punti di rottura della lealtà e catene di conseguenze, compagni con morale e rischio di abbandono, influenza del giocatore e azioni politiche, analisi della mappa strategica, assistente di movimento, riconoscimento degli oggetti e provenienza delle attrezzature, tappe fondamentali della crescita degli artefatti, opportunità emergenti (contratti, taglie, favori, missioni di rifornimento, indagini) generate dalle condizioni del mondo, rilevamento dell'arco narrativo (10 tipi di arco derivati dallo stato accumulato), rilevamento dei trigger della fine del gioco (8 classi di risoluzione) e rendering finale deterministico con epiloghi strutturati. Registri delle azioni riproducibili e generatore di numeri casuali deterministico. Ogni partita può essere riprodotta esattamente.

### Creazione di mondi assistita dall'IA

Un livello opzionale di intelligenza artificiale che crea stanze, fazioni, missioni e distretti a partire da un tema. Valuta i progetti, corregge gli errori di schema, propone miglioramenti e guida i processi di creazione del mondo. L'IA non modifica direttamente lo stato della simulazione, ma genera solo contenuti o suggerimenti.

### Flussi di lavoro di progettazione guidati

Flussi di lavoro sensibili al contesto e basati sulla pianificazione per la creazione del mondo, i cicli di valutazione, l'iterazione del design, la creazione guidata e i piani di ottimizzazione strutturati. Combina strumenti deterministici con l'assistenza dell'IA.

### Abilità e Poteri

Sistema di abilità nativo del genere, con una copertura trasversale di 10 categorie. Le abilità hanno costi, controlli di statistiche, tempi di ricarica ed effetti di tipo (danno, guarigione, applicazione di stati, purificazione). Gli effetti di stato utilizzano un vocabolario semantico con 11 tag, con profili di resistenza/vulnerabilità per le entità. Il sistema di selezione delle abilità, consapevole dell'intelligenza artificiale, valuta percorsi di attacco a sé stessi/ad area/a bersaglio singolo, tenendo conto della resistenza e della valutazione della purificazione. Strumenti di audit dell'equilibrio e riepilogo dei pacchetti rilevano anomalie durante la fase di creazione.

```typescript
const warCry: AbilityDefinition = {
  id: 'war-cry', name: 'War Cry', verb: 'use-ability',
  tags: ['combat', 'debuff', 'aoe'],
  costs: [{ resourceId: 'stamina', amount: 3 }, { resourceId: 'infection', amount: 5 }],
  target: { type: 'all-enemies' },
  checks: [{ stat: 'nerve', difficulty: 6, onFail: 'abort' }],
  effects: [
    { type: 'apply-status', target: 'target', params: { statusId: 'rattled', duration: 2 } },
  ],
  cooldown: 4,
};
```

### Analisi della simulazione

Analisi delle partite che spiega perché si sono verificati determinati eventi, dove le meccaniche non funzionano correttamente, quali trigger non si attivano e quali sistemi creano instabilità. I risultati strutturati vengono utilizzati direttamente per l'ottimizzazione.

### Ottimizzazione guidata

I risultati dell'analisi generano piani di ottimizzazione strutturati con correzioni proposte, impatto previsto, stime di affidabilità e modifiche in anteprima. Vengono applicati passo dopo passo, con piena tracciabilità.

### Esperimenti di simulazione

Eseguire batch di simulazioni su diverse configurazioni per comprendere il comportamento tipico. Estrarre metriche di scenario, rilevare la varianza, modificare i parametri e confrontare i mondi ottimizzati con quelli di base. Trasforma la progettazione del mondo in un processo testabile.

### Ambiente di sviluppo

Ambiente di sviluppo a riga di comando (CLI) con dashboard di progetto, navigazione dei problemi, ispezione degli esperimenti, cronologia delle sessioni, onboarding guidato e scoperta di comandi contestuali. È uno spazio di lavoro per la creazione e il test di mondi.

---

## Guida rapida

```bash
# Install the CLI
npm install -g @ai-rpg-engine/cli

# Start the interactive studio
ai chat

# Run onboarding
/onboard

# Create your first content
create-room haunted chapel

# Run a simulation
simulate

# Analyze the results
analyze-balance

# Tune the design
tune paranoia

# Run an experiment
experiment run --runs 50
```

---

## Flusso di lavoro di esempio

```bash
ai chat

/onboard
create-location-pack haunted chapel district
critique-content
simulate
analyze-balance
tune rumor propagation
experiment run --runs 50
compare-replays
```

Creare un mondo e migliorarlo attraverso prove ottenute dalla simulazione.

---

## Architettura

Il sistema è composto da quattro livelli.

| Livello | Ruolo |
|-------|------|
| **Simulation** | Motore di simulazione deterministico — stato del mondo, eventi, azioni, percezione, cognizione, fazioni, propagazione delle voci, metriche dei distretti, riproduzione |
| **Authoring** | Generazione di contenuti — scaffolding, valutazione, normalizzazione, cicli di correzione, generatori di pacchetti |
| **AI Cognition** | Assistenza opzionale dell'IA — interfaccia di chat, instradamento contestuale, recupero, modellazione della memoria, orchestrazione degli strumenti |
| **Studio UX** | Ambiente di sviluppo a riga di comando — dashboard, tracciamento dei problemi, navigazione degli esperimenti, cronologia delle sessioni, flussi di lavoro guidati |

---

## Pacchetti

| Pacchetto | Scopo |
|---------|---------|
| [`@ai-rpg-engine/core`](packages/core) | Motore di simulazione deterministico — stato del mondo, eventi, RNG, tick, risoluzione delle azioni |
| [`@ai-rpg-engine/modules`](packages/modules) | 29 moduli integrati: combattimento, percezione, cognizione, fazioni, voci, distretti, autonomia dei personaggi non giocanti, compagni, influenza del giocatore, mappa strategica, assistente di movimento, riconoscimento degli oggetti, opportunità emergenti, rilevamento degli archi narrativi, trigger della fine del gioco. |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e validatori canonici per i contenuti del mondo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Stato di progressione del personaggio, ferite, tappe fondamentali, reputazione. |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell'archetipo, generazione della build, equipaggiamento iniziale. |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipi di equipaggiamento, provenienza degli oggetti, crescita degli artefatti, cronache degli oggetti. |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti delle relazioni, stato della campagna. |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione assistita dall'IA (opzionale) — scaffolding, valutazione, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | Studio di progettazione basato su riga di comando: shell di chat, flussi di lavoro, strumenti di sperimentazione. |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Motore di rendering per terminale e livello di input. |
| [`@ai-rpg-engine/starter-fantasy`](packages/starter-fantasy) | The Chapel Threshold: mondo di partenza a tema fantasy. |
| [`@ai-rpg-engine/starter-cyberpunk`](packages/starter-cyberpunk) | Neon Lockbox: mondo di partenza a tema cyberpunk. |
| [`@ai-rpg-engine/starter-detective`](packages/starter-detective) | Gaslight Detective: mondo di partenza a tema mistero vittoriano. |
| [`@ai-rpg-engine/starter-pirate`](packages/starter-pirate) | Black Flag Requiem: mondo di partenza a tema piratesco. |
| [`@ai-rpg-engine/starter-zombie`](packages/starter-zombie) | Ashfall Dead: mondo di partenza a tema sopravvivenza agli zombie. |
| [`@ai-rpg-engine/starter-weird-west`](packages/starter-weird-west) | Dust Devil's Bargain: mondo di partenza a tema western fantastico. |
| [`@ai-rpg-engine/starter-colony`](packages/starter-colony) | Signal Loss: mondo di partenza a tema colonia fantascientifica. |

---

## Documentazione

| Risorse. | Descrizione. |
|----------|-------------|
| [Handbook](docs/handbook/index.md) | 26 capitoli + 4 appendici che coprono ogni sistema. |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline di azioni, verità vs. presentazione, livelli di simulazione. |
| [AI Worldbuilding Guide](packages/ollama/AI_WORLDBUILDING.md) | Flussi di lavoro per la creazione di prototipi, la diagnosi, l'ottimizzazione e la sperimentazione. |
| [Philosophy](PHILOSOPHY.md) | Perché mondi deterministici, progettazione basata su evidenze e l'intelligenza artificiale come assistente. |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni. |

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
