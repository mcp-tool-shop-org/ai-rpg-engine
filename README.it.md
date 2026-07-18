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

# Motore RPG basato sull'IA

Un toolkit TypeScript per la creazione di simulazioni RPG deterministiche. Si definiscono le statistiche, si scelgono i moduli, si configura una sequenza di combattimento e si crea il contenuto. Il motore gestisce lo stato, gli eventi, il generatore di numeri casuali (RNG), la risoluzione delle azioni e il processo decisionale dell'IA. Ogni esecuzione è riproducibile.

Questo è un **motore di composizione**, non un gioco completo. I 10 mondi iniziali sono esempi: modelli scomponibili da cui si può imparare e che possono essere modificati. Il tuo gioco utilizza qualsiasi sottoinsieme del motore necessario.

---

## Cos'è questo progetto

- Una **libreria di moduli**: oltre 30 moduli per il motore, che coprono combattimento, percezione, cognizione, fazioni, voci, spostamenti, compagni e altro ancora.
- Un **toolkit di composizione**: `buildCombatStack()` configura il combattimento in circa 7 righe; `new Engine({ modules })` avvia il gioco.
- Un **ambiente di simulazione**: cicli deterministici, registri delle azioni riproducibili, RNG con seme predefinito.
- Uno **studio di progettazione dell'IA** (opzionale): scheletro, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti tramite Ollama.

## Cos'è questo progetto NON

- Non è un singolo gioco completo: include 10 mondi iniziali giocabili che puoi utilizzare oggi come esempi e il motore è il toolkit da cui componi il *tuo* gioco.
- Non è un motore grafico: genera eventi strutturati, non pixel.
- Non è un generatore di storie: simula mondi; la narrazione emerge dalla meccanica del gioco.

---

## Stato attuale (v2.6.0)

**Cosa funziona ed è stato testato:**
- Motore principale: stato del mondo, eventi, azioni, cicli, riproduzione: stabile dalla versione 1.0; riproduzione deterministica byte per byte (contatore ID per istanza, RNG con seme predefinito).
- Sistema di combattimento: 5 azioni, 4 stati di combattimento, 4 stati di coinvolgimento, intercettazione dei compagni, flusso di sconfitta, tattiche dell'IA.
- Abilità: costi, tempi di ricarica, controlli delle statistiche, effetti tipizzati, vocabolario di stato con 11 tag, selezione consapevole dell'IA.
- **Combattimento di gruppo (v2.4):** targeting degli alleati (cura/potenziamento/rianimazione), filtraggio AoE tra amici e nemici, selettori di bersaglio: un curatore può curare un compagno di squadra; l'AoE del nemico risparmia gli alleati.
- **Effetti di stato (v2.4):** i modificatori passivi delle statistiche raggiungono il combattimento, DoT/HoT deterministici basati sul contatore dei cicli, trigger reattivi con profondità limitata (spine/riflesso).
- **Profili plug-in: risoluzione delle regole per entità (v2.5):** un guerriero "forte" e un mistico "volitivo" risolvono il combattimento in una singola battaglia, leggendo ciascuno le statistiche tramite la propria mappatura. `RuleProfile` + `WorldState.ruleProfiles` + `EntityState.ruleProfileId`; `applyProfile()` associa un profilo (mappatura delle statistiche, pool di risorse, abilità per entità); `buildProfile()`, `validateProfileSet()` (gli ID duplicati vengono rifiutati), 10 modelli derivati dai mondi iniziali e un comando CLI `profile`.
- **Ciclo di gioco giocabile (`run`) (v2.6):** il gioco finale è reale, non una demo: i nemici agiscono in base ai propri profili di intelligenza artificiale (`aggressivo`/`cauto`/`territoriale`/`calcolatore`), un combattimento termina con la vittoria o la sconfitta, puoi salvare e riprendere e le abilità e l'esperienza sono nel menu delle azioni. `run <path>` carica un gioco che hai creato. Interfaccia utente terminale composta con HUD facilmente consultabile e colori accessibili (rispetta `NO_COLOR` / non-TTY).
- **Lo studio di progettazione dell'IA viene fornito come comando separato (`ai`) (v2.6):** `npm install -g @ai-rpg-engine/ollama` → `ai chat`: crea, analizza e bilancia il contenuto rispetto a un modello Ollama locale.
- Livello decisionale unificato: combattimento + punteggio delle abilità combinati in una singola chiamata (`selectBestAction`).
- Tutti i 10 mondi iniziali utilizzano `buildCombatStack()`: la colonna vertebrale di composizione comprovata.
- API di configurazione della cognizione (`cognition: CognitionCoreConfig | false`) per l'ottimizzazione dell'IA per ciascun mondo iniziale.
- Tassonomia dei tag e utilità di convalida per la creazione di contenuti.
- `ai-rpg-engine create-starter <name>`: crea un nuovo gioco (autonomo, eseguibile al di fuori del monorepo); comandi `validate` + `scaffold` per i contenuti; carica pacchetti da JSON.
- Modello iniziale pubblicato su npm (`@ai-rpg-engine/starter-template`).
- Suite di test completa: **4292 test** (deterministici in esecuzioni ripetute; il rispetto della copertura è applicato in CI).

**Cosa è ancora grezzo o incompleto:**
- Lo studio di worldbuilding basato sull'IA (livello Ollama) è testato meno a fondo del motore principale e richiede un daemon Ollama locale; è completamente opzionale: il motore e il ciclo `run` non necessitano di una connessione di rete.
- Il sistema di narrazione/audio genera comandi audio deterministici, ma **non esiste alcun backend audio terminale**: nulla riproduce un suono; i comandi sono un hook di integrazione per un'interfaccia utente grafica/web.
- Il multiplayer (due giocatori umani che condividono un mondo) **non** è stato implementato: si tratta di un livello di rete, volutamente fuori dall'ambito del progetto; oggi i profili mirano a un singolo controller.
- La documentazione è estesa, ma non tutte le pagine del manuale riflettono le API più recenti.

---

## Come appare

L'interfaccia utente terminale inclusa compone ogni turno in sezioni etichettate: scena, stato, registro e azioni, con un HUD facilmente consultabile. L'output è testo semplice per impostazione predefinita e aggiunge colori semantici su un TTY (danni in rosso, cure in verde, rifiuti in giallo), rispettando `NO_COLOR` e i pipe non-TTY; ogni indicazione è contenuta nel testo stesso, mai solo nei colori.

```text
── The Crypt Gate ──────────────────────────────────────────
  [dark, unhallowed]

  ! Crypt Warden · HP 6/14 · Off Balance
  ! Bone Thrall · defeated
  + Mira · HP 11/16

  * rusted portcullis winch

  Exits: Ossuary, Churchyard

── Status ──────────────────────────────────────────────────
  HP 9/20 [#####-----]  Stamina 4/10
  Status: Guarded
  Items: healing-draught, grave-key

── Log ─────────────────────────────────────────────────────
  > Ash takes a guarded stance.
  > Hit!  4 damage dealt (HP: 6)
  > Bone Thrall defeated!
  > You can't do that: not enough stamina

── Actions ─────────────────────────────────────────────────
  [ 1] Move to Ossuary      [ 3] Attack Crypt Warden
  [ 2] Move to Churchyard   [ 4] Inspect Crypt Warden
────────────────────────────────────────────────────────────
```

---

## Installazione e avvio

Gioca a un mondo iniziale o crea il tuo gioco dal terminale:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

Il ciclo `run` è una vera sessione a turni: i nemici agiscono in base ai propri profili di IA, le abilità e l'esperienza sono nel menu, puoi salvare e riprendere e un combattimento termina con la vittoria o la sconfitta. Ogni gioco è deterministico e riproducibile.

Facoltativamente, lo studio di progettazione dell'IA viene installato come comando separato:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

Lo studio comunica con un daemon [Ollama](https://ollama.com) locale: esegui prima `ollama serve` e `ollama pull qwen2.5-coder`. È completamente opzionale; il motore e il ciclo `run` non necessitano di una connessione di rete.

Un'immagine container è pubblicata su GHCR come `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` per CI ed esecuzioni in ambiente sandbox.

---

## Avvio rapido

Preferisci creare il tuo gioco nel codice? Componi il motore dai moduli:

```typescript
import { Engine } from '@ai-rpg-engine/core';
import { buildCombatStack, traversalCore, statusCore, createDialogueCore } from '@ai-rpg-engine/modules';

// Define your stat mapping
const combat = buildCombatStack({
  statMapping: { attack: 'might', precision: 'agility', resolve: 'will' },
  playerId: 'hero',
  biasTags: ['undead', 'beast'],
});

// Wire the engine
const engine = new Engine({
  manifest: myManifest,
  modules: [statusCore, ...combat.modules, traversalCore, createDialogueCore(myDialogues)],
});

// Submit player actions
engine.submitAction('attack', { targetIds: ['skeleton-1'] });

// Submit AI entity actions
engine.submitActionAs('guard-captain', 'attack', { targetIds: ['player'] });
```

Consulta la [Guida alla composizione](site/src/content/docs/handbook/57-composition-guide.md) per il flusso di lavoro completo, oppure crea un nuovo progetto di partenza:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architettura

| Livello | Ruolo |
|-------|------|
| **Core Runtime** | Motore deterministico: stato del mondo, eventi, azioni, cicli, RNG, replay |
| **Modules** | Oltre 30 sistemi componibili: combattimento, percezione, cognizione, fazioni, movimento, compagni, ecc. |
| **Content** | Entità, zone, dialoghi, oggetti, abilità, stati: creati dall'autore |
| **AI Studio** | Livello Ollama opzionale: creazione di progetti iniziali, analisi critica, bilanciamento, ottimizzazione, esperimenti |

---

## Sistema di combattimento

Cinque azioni (attacco, difesa, disimpegno, preparazione, riposizionamento), quattro stati di combattimento (difensivo, sbilanciato, esposto, in fuga), quattro stati di coinvolgimento (coinvolto, protetto, retroguardia, isolato). Tre dimensioni statistiche guidano ogni formula, quindi un duellante veloce gioca in modo diverso rispetto a un guerriero corpulento o a un sentinella equilibrata.

Gli avversari controllati dall'IA utilizzano una valutazione decisionale unificata: le azioni e le abilità di combattimento competono in un'unica valutazione, con soglie configurabili per evitare l'uso eccessivo di abilità marginali.

Gli autori dei pacchetti utilizzano `buildCombatStack()` per collegare il combattimento a una mappa delle statistiche, un profilo delle risorse e tag di preferenza. Consulta la [Panoramica del combattimento](site/src/content/docs/handbook/49a-combat-overview.md) e la [Guida per gli autori dei pacchetti](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Abilità

Sistema di abilità nativo del genere, con costi, controlli delle statistiche, tempi di ricarica ed effetti tipizzati (danno, guarigione, applicazione di stato, rimozione dello stato). Gli effetti di stato utilizzano un vocabolario semantico a 11 tag con profili di resistenza/vulnerabilità. I punteggi di selezione consapevoli dell'IA valutano i percorsi auto/AoE/bersaglio singolo.

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
| [`@ai-rpg-engine/core`](packages/core) | Runtime di simulazione deterministico: stato del mondo, eventi, RNG, cicli, risoluzione delle azioni |
| [`@ai-rpg-engine/modules`](packages/modules) | Oltre 30 moduli componibili: combattimento, percezione, cognizione, fazioni, voci, movimento, compagni, autonomia dei PNG, mappa strategica, riconoscimento degli oggetti, opportunità emergenti, rilevamento dell'arco narrativo, trigger di fine gioco |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e validatori canonici per i contenuti del mondo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progressione del personaggio, ferite, traguardi, reputazione |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell'archetipo, generazione della build, equipaggiamento iniziale |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipi di equipaggiamento, provenienza degli oggetti, crescita delle reliquie |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti sulle relazioni, stato della campagna |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo di vita delle voci, meccaniche di mutazione, tracciamento della diffusione |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schema del piano narrativo, contratti di rendering, profili vocali |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Pianificazione dei segnali, priorità, attenuazione, logica dei tempi di ricarica |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifesti del pacchetto audio, registro indirizzabile in base al contenuto |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registrazione del pacchetto, valutazione della rubrica, scoperta del pacchetto |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Archiviazione indirizzata in base al contenuto per ritratti, icone, media |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generazione di ritratti senza interfaccia utente con provider collegabili |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione automatica opzionale: creazione di progetti iniziali, analisi critica, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: esegui giochi, crea progetti iniziali, ispeziona salvataggi |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderer terminale e livello di input |

### Esempi di progetto iniziale

I 10 mondi di esempio sono **esempi di composizione**: dimostrano come combinare i moduli del motore in giochi completi. Ognuno mostra schemi diversi (mappe delle statistiche, profili delle risorse, configurazioni di coinvolgimento, set di abilità). Consulta il file README di ogni progetto iniziale per "Schemi dimostrati" e "Cosa prendere in prestito".

| Progetto iniziale | Genere | Modelli chiave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Dark fantasy | Combattimento minimo, guidato dal dialogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Risorse, ruoli di coinvolgimento |
| [`starter-detective`](packages/starter-detective) | Mistero vittoriano | Prima di tutto l'aspetto sociale, con molta attenzione alla percezione |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Navale + corpo a corpo, multi-zona |
| [`starter-zombie`](packages/starter-zombie) | Sopravvivenza agli zombie | Scarsità, risorsa dell'infezione |
| [`starter-weird-west`](packages/starter-weird-west) | Weird west | Preferenze del pacchetto, recupero della zona sicura |
| [`starter-colony`](packages/starter-colony) | Colonia fantascientifica | Punti di strozzatura, zone di imboscata |
| [`starter-ronin`](packages/starter-ronin) | Giappone feudale | Passaggi nascosti, più ruoli protettivi |
| [`starter-vampire`](packages/starter-vampire) | Horror vampiresco | Risorsa del sangue, manipolazione sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiatore storico | Combattimento nell'arena, favore della folla |

---

## Documentazione

| Risorsa | Descrizione |
|----------|-------------|
| [Create Your Own Starter](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crea un nuovo gioco: percorso CLI o modello manuale |
| [Composition Guide](site/src/content/docs/handbook/57-composition-guide.md) | Costruisci il tuo gioco componendo i moduli del motore |
| [Plug-in Profiles](site/src/content/docs/handbook/59-plugin-profiles.md) | Risoluzione delle regole per entità: combattimento con stili di gioco misti, `applyProfile`, modelli di profilo, la CLI `profile` |
| [Combat Overview](site/src/content/docs/handbook/49a-combat-overview.md) | Sei pilastri del combattimento, cinque azioni, stati a colpo d'occhio |
| [Pack Author Guide](site/src/content/docs/handbook/55-combat-pack-guide.md) | Costruzione passo dopo passo di `buildCombatStack`, mappa delle statistiche, profili delle risorse |
| [Handbook](site/src/content/docs/handbook/index.md) | Manuale completo: ogni sistema, più 4 appendici |
| [Composition Model](docs/composition-model.md) | I 6 livelli riutilizzabili e come si compongono |
| [Examples](docs/examples/) | Esempi TypeScript eseguibili (con controllo dei tipi + test del comportamento in CI): per entità con gruppo misto, profili condivisi, tra mondi diversi, da zero |
| [Design Document](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline delle azioni, verità rispetto alla presentazione |
| [Philosophy](PHILOSOPHY.md) | Mondi deterministici, progettazione basata sull'evidenza, IA come assistente |
| [Changelog](CHANGELOG.md) | Cronologia delle versioni |

---

## Roadmap

### Dove siamo ora

Il tempo di esecuzione della simulazione, la struttura per la composizione dei combattimenti e il percorso iniziale per la creazione sono completi: 3613 test su 193 file, tutti i 10 personaggi iniziali in `buildCombatStack`, riproduzione deterministica byte-per-byte identica, valutazione completa delle decisioni dell'IA e un comando CLI per creare una struttura di base. **La versione 2.5 offre la risoluzione delle regole per entità: la funzionalità principale dei Plug-in Profiles: un combattente "might" e un mistico "will" risolvono il combattimento in un unico scontro, ciascuno leggendo le statistiche tramite la propria mappatura.**

**Ciclo di rilascio recente (v2.3.3–v2.6.0):**
- v2.3.3–v2.3.7: prova dell'artefatto per l'utente finale, miglioramento della stabilità del Combat Stack, tutti i 10 personaggi iniziali in `buildCombatStack`, modello iniziale pubblicato, CLI `create-starter`.
- v2.4.0: combattimento di gruppo (targeting degli alleati / cura / potenziamento / rianimazione, effetto di stato (modificatori + DoT/HoT + trigger reattivi), fase 1 dei Plug-in Profiles, CLI per la convalida e la creazione del contenuto (`validate`/`scaffold`).
- **v2.5.0: risoluzione delle regole per entità (combattimento con stili di gioco misti), il caricatore `applyProfile` + abilità per entità, modelli di profilo + CLI `profile` e una revisione completa della salute (correzione della riproduzione byte-per-byte identica, miglioramento della correttezza, implementazione dei controlli di qualità).**

### Avanti

- Multiplayer: due giocatori *umani* che condividono un mondo (un livello di rete, volutamente posticipato; i profili condivisi con un singolo controller sono disponibili oggi come [`shared-profiles.ts`](docs/examples/shared-profiles.ts)).
- Override delle formule serializzabili: ottimizzazione delle formule per profilo (in attesa di un DSL per le formule; i profili contengono oggi mappature delle statistiche, non closure).
- Sincronizzazione della documentazione API: assicurarsi che ogni pagina del manuale rifletta le API v2.5.

### Destinazione: Plug-in Profiles

L'obiettivo finale del motore è quello di offrire **profili definiti dall'utente**: pacchetti portatili che possono essere inseriti in qualsiasi gioco. Un profilo include una mappatura delle statistiche, il comportamento delle risorse, i tag di bias dell'IA e le abilità in un'unica unità importabile. A partire dalla versione 2.5, le entità in un mondo possono avere ciascuna il proprio profilo e risolvere il combattimento per entità: un combattente "might" e un mistico "will" condividono una squadra, ognuno apportando il proprio stile di gioco.

Lo schema, il caricatore `applyProfile`, la risoluzione delle abilità per entità e la convalida tra profili sono tutti disponibili. Ciò che resta è il multiplayer: consentire a due giocatori *umani* (e non solo a due entità) di condividere un mondo, il che richiede un livello di rete. Consultare [Profile Roadmap](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) per la progettazione.

---

## Filosofia

L'AI RPG Engine è costruito su tre idee:

1. **Mondi deterministici:** i risultati della simulazione devono essere riproducibili.
2. **Progettazione basata sull'evidenza:** le meccaniche del mondo dovrebbero essere testate tramite la simulazione.
3. **IA come assistente, non come autorità:** gli strumenti di IA aiutano a generare e valutare i progetti, ma non sostituiscono i sistemi deterministici.

Consultare [PHILOSOPHY.md](PHILOSOPHY.md) per la spiegazione completa.

---

## Sicurezza

Il motore principale è una **libreria di simulazione locale:** nessun telemetria, nessuna rete, nessun segreto. I file di salvataggio vengono salvati in `.ai-rpg-engine/` solo quando richiesto esplicitamente. Il livello di IA **opzionale** (`@ai-rpg-engine/ollama`) comunica con un daemon Ollama **locale**: la sua funzione `webfetch` (per RAG) è l'unica connessione di rete in uscita ed è limitata da una protezione SSRF (blocca loopback/link-local/CGNAT/cloud-metadata e le equivalenti IPv6), quindi non si può accedere a meno che non venga esplicitamente invocata. Consultare [SECURITY.md](SECURITY.md) per i dettagli.

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
