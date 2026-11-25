<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

Un set di strumenti TypeScript per creare simulazioni di giochi di ruolo deterministiche. Si definiscono le statistiche, si selezionano i moduli, si configura una sequenza di combattimento e si crea il contenuto. Il motore gestisce lo stato, gli eventi, il generatore di numeri casuali, la risoluzione delle azioni e il processo decisionale dell'IA. Ogni esecuzione è riproducibile.

Questo è un **motore di composizione**, non un gioco completo. I 12 mondi iniziali sono esempi: modelli scomponibili da cui si può imparare e da cui si possono ricavare nuove idee. Il gioco utilizza qualsiasi sottoinsieme del motore necessario.

---

## Cos'è

- Una **libreria di moduli** — oltre 30 moduli del motore che coprono combattimento, percezione, cognizione, fazioni, voci, movimento, compagni e altro
- Un **set di strumenti di composizione** — `buildCombatStack()` configura il combattimento in circa 7 righe; `new Engine({ modules })` avvia il gioco
- Un **ambiente di simulazione** — cicli deterministici, registri di azioni riproducibili, generatore di numeri casuali con seme
- Uno **studio di progettazione dell'IA** (opzionale) — scheletro, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti tramite Ollama
- Un **livello opzionale sulla blockchain** — `@ai-rpg-engine/ledger-adapter` supporta la valuta e gli oggetti commerciabili di un gioco con token XRPL reali sulla **testnet**, con regolamenti effettuati in punti di controllo, completamente al di fuori del nucleo deterministico (opzionale; un'esecuzione è identica a livello di byte senza di esso)
- Un **host visivo opzionale** — `@ai-rpg-engine/sidecar` più il client Godot 4 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage). Il motore non genera comunque immagini. Lo stage disegna un porto dimetrico in scala 2:1 e riproduce l'audio `felt`. L'occupazione rimane un ID di zona.

## Cos'è che non è

- Non è un singolo gioco finito: include 12 mondi iniziali giocabili che puoi avviare con `run` già oggi come esempi, e il motore è il kit di strumenti con cui componi il *tuo* gioco
- Non è un motore grafico: produce eventi strutturati, non pixel. Il disegno spetta all'host (il terminale o Godot)
- Non è un generatore di storie: simula mondi; la narrazione emerge dalle meccaniche

---

## Stato attuale (v3.12.2)

**Cosa funziona ed è testato:**
- Il nucleo di simulazione: tick deterministici, RNG con seme, replay identico byte per byte, e salvataggio e ripresa
- Il combattimento di gruppo: bersagli alleati, effetti di stato, attacchi ad area che risparmiano gli alleati, e nemici che agiscono secondo i propri profili di intenzione IA
- Un mondo che reagisce: fazioni, voci, un'economia commerciale, compagni, PNG con nome e obiettivi propri, e conseguenze per ciò che fai
- Tutti i 12 mondi iniziali, giocabili oggi con `run`
- I pacchetti World Forge, caricati come contenuto
- L'host Godot 4 [`ai-rpg-stage`](https://github.com/mcp-tool-shop-org/ai-rpg-stage), tramite il sidecar, con i segnali audio `felt`
- Il livello di registro sulla testnet XRPL, attivo solo se lo scegli (opt-in)

**Cosa è ancora grezzo o incompleto:**
- Lo studio di progettazione IA (Ollama) è opzionale ed è testato meno del nucleo di simulazione
- Non c'è un backend audio nel terminale: solo lo stage Godot riproduce suoni
- Il multigiocatore (due giocatori umani nello stesso mondo) non è stato realizzato
- `replay --replay` ripristina il salvataggio invece di ri-simulare, per scelta progettuale
- Alcune pagine del manuale sono indietro rispetto alle API più recenti

La cronologia completa delle versioni è in [CHANGELOG.md](CHANGELOG.md).

---

## Come si presenta

L'interfaccia utente terminale inclusa compone ogni turno in sezioni etichettate: scena, stato, registro e azioni, con un'interfaccia utente di facile consultazione. L'output è testo semplice per impostazione predefinita e aggiunge colori semantici su un terminale (danni in rosso, guarigioni in verde, rifiuti in giallo), rispettando `NO_COLOR` e i canali non-terminale; ogni segnale è incluso anche nel testo, non solo nel colore.

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

Avvia una demo o crea il tuo gioco dal terminale:

```bash
npm install -g @ai-rpg-engine/cli

ai-rpg-engine run                    # pick a starter, build a character, play
ai-rpg-engine create-starter my-game # scaffold a new game you can edit and run
ai-rpg-engine run ./my-game          # run a game you scaffolded
```

Il ciclo `run` è una vera sessione a turni: i nemici agiscono in base ai loro profili AI. Le abilità e i punti esperienza sono disponibili nel menu, puoi salvare e riprendere, e un combattimento termina con una vittoria o una sconfitta. Ogni partita è deterministica e può essere rigiocata.

Facoltativamente, lo studio di progettazione AI si installa come un comando separato:

```bash
npm install -g @ai-rpg-engine/ollama
ai chat                              # scaffold, critique, and balance content
                                     # against a local Ollama model (see Ch. 36)
```

Lo studio comunica con un daemon [Ollama](https://ollama.com) locale: esegui `ollama serve` e `ollama pull qwen2.5-coder` per prima cosa. È completamente opzionale; il motore e il ciclo `run` non necessitano di una rete.

Un'immagine container viene pubblicata su GHCR come `ghcr.io/mcp-tool-shop-org/ai-rpg-engine` per test CI e esecuzioni in ambiente isolato.

---

## Avvio rapido

Preferisci creare il tuo gioco nel codice? Assembla il motore da moduli:

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

Consulta la [Guida alla composizione](site/src/content/docs/handbook/57-composition-guide.md) per il flusso di lavoro completo, oppure crea una nuova demo:

```bash
npx @ai-rpg-engine/cli create-starter my-game
```

---

## Architettura

| Livello | Ruolo |
|-------|------|
| **Runtime principale** | Motore deterministico: stato del mondo, eventi, azioni, tick, RNG, replay |
| **Moduli** | Oltre 30 sistemi componibili: combattimento, percezione, cognizione, fazioni, movimento, compagni, ecc. |
| **Contenuti** | Entità, zone, dialoghi, oggetti, abilità, stati: creati dall'autore |
| **Studio IA** | Livello Ollama opzionale: creazione di prototipi, analisi critica, analisi dell'equilibrio, ottimizzazione, esperimenti |

---

## L'adattatore del registro XRPL (opzionale)

`@ai-rpg-engine/ledger-adapter` è un pacchetto **opzionale** che associa il **livello negoziabile di proprietà del giocatore** di un gioco (il saldo `coin` e l'inventario di oggetti consumabili che i verbi `buy`/`sell` di `trade-core` gestiscono) alla **testnet XRPL**, in modo che tali risorse possano essere supportate da token reali sul registro e regolati ai checkpoint. Un adattatore assente è esattamente il motore offline che viene fornito oggi.

**L'invariante del determinismo (il punto fondamentale).** L'adattatore è un *canale secondario*, mai parte della simulazione:

- Non viene mai invocato all'interno del tick deterministico, ma solo ai **checkpoint** (salvataggio, ingresso in città/mercato, fine del capitolo).
- Nulla in `@ai-rpg-engine/core` o `@ai-rpg-engine/modules` lo importa (la sua unica dipendenza dal motore è un `import type` in fase di compilazione).
- **Un'esecuzione è identica a livello di byte con o senza di esso.** Un test del firewall esegue il ciclo del mercante `starter-pirate` `createGame()` reale su due motori, uno con l'adattatore abilitato e che si regola a un checkpoint, e verifica che i due mondi siano identici. Il replay con seme 0 non viene modificato.

**Livelli di integrazione: un gioco lo include in profondità quanto desidera il suo design.** Il firewall è un confine del *determinismo*, non una regola anti-integrazione; l'invariante di cui sopra è valido a tutti i livelli:

| Livello | Cosa dipende dall'adattatore | Si adatta |
|-------|-----------------------------|------|
| **L0 — Osservatore esterno** | Nulla all'interno del gioco; l'adattatore si collega dall'esterno ai checkpoint e il gioco non ne è a conoscenza. | Riadattamento di un gioco esistente (la demo pirata fornita). |
| **L1: checkpoint guidati dal gioco** | Il flusso di salvataggio/città/progressione meta del gioco chiama l'adattatore in momenti definiti. | Un gioco che desidera momenti di registro deliberati. |
| **L2 — Progettazione nativa per il registro** | L'economia o l'identità del gioco sono progettate *attorno* alla proprietà on-chain (emittente persistente, mercati reali). | Un gioco di mercanti basato sul registro. |

La distinzione che mantiene il replay sicuro non è "quale pacchetto importa l'adattatore", ma "la chiamata è all'interno del tick". Un pacchetto di gioco può importare e gestire l'adattatore liberamente, purché ogni chiamata avvenga a un checkpoint al di fuori del ciclo di replay guidato dal seme.

**Tre modalità di gioco.** `offline` (predefinito: nessuna catena, il motore così come viene fornito) · `ledger` (monete/oggetti supportati dai saldi della testnet, regolati ai checkpoint) · `diary` (gioca offline, quindi ancora l'hash dello stato dell'esecuzione sul registro per una ricevuta a prova di manomissione).

**Cosa è presente nel registro.** `coin` → un impegno di valuta emessa su una linea di credito;
articoli di consumo → token fungibili; la variazione netta delle transazioni di un checkpoint → un trasferimento convalidato tramite **XLS-85 escrow di token**. Attrezzature uniche vengono rilasciate come **XLS-20 NFT**
(v3.3), con la crescita delle reliquie che fa avanzare i metadati di un NFT modificabile tramite
**XLS-46 `NFTokenModify`** — guidato da un gioco reale a partire da v3.4. L'economia distrettuale astratta (`economy-core`) *non* viene toccata — rimane una simulazione pura.

**Misure di sicurezza.** Solo testnet, con una protezione strutturale **impossibile in mainnet nel codice** (non un flag di configurazione); i seed del portafoglio sono memorizzati in un file secondario ignorato da Git, mai nel file di salvataggio; la convalida è idempotente e sicura per la conservazione nel percorso di ripetizione; le prove verificano il **memo reale sulla blockchain** (non la stringa del motore); e se la catena non è raggiungibile, l'esecuzione continua semplicemente, contrassegnata come *non ancorata*.

**Dimostrato in ambiente attivo.** Un vero ciclo di `starter-pirate`, un commerciante: vendi una sciabola, compra un proiettile di cannone — si conclude sulla testnet XRPL tramite escrow di token, quindi `reconcile()` conferma i saldi e i memo nel registro rispetto all'economia del motore (la conservazione è garantita per ogni token). Il registro è una famiglia di sistemi diversa dal motore, quindi il motore non può falsificarlo: la riconciliazione è una verifica esterna autentica. Solo testnet; gli asset sono ricevute con ambito di gioco, non titoli.

---

## Sistema di combattimento

Cinque azioni (attacco, difesa, disimpegno, preparazione, riposizionamento), quattro stati di combattimento (difeso, sbilanciato, esposto, in fuga), quattro stati di coinvolgimento (coinvolto, protetto, in seconda linea, isolato). Tre dimensioni statistiche guidano ogni formula, quindi un duellante veloce gioca in modo diverso da un combattente pesante o da un sentinella composto.

Gli avversari controllati dall'IA utilizzano un sistema di punteggio decisionale unificato: le azioni e le abilità di combattimento competono in una singola valutazione, con soglie configurabili per prevenire l'uso eccessivo di abilità marginali.

Gli autori dei pacchetti utilizzano `buildCombatStack()` per collegare il combattimento a una mappatura delle statistiche, un profilo delle risorse e tag di preferenza. Consulta la [Panoramica del combattimento](site/src/content/docs/handbook/49a-combat-overview.md) e la [Guida per gli autori dei pacchetti](site/src/content/docs/handbook/55-combat-pack-guide.md).

---

## Abilità

Sistema di abilità nativo del genere, con costi, controlli delle statistiche, tempi di ricarica ed effetti tipizzati (danno, guarigione, applicazione di stato, rimozione). Gli effetti di stato utilizzano un vocabolario semantico di 11 tag con profili di resistenza/vulnerabilità. I punteggi di selezione consapevoli dell'IA valutano i percorsi self/AoE/a bersaglio singolo.

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
| [`@ai-rpg-engine/core`](packages/core) | Runtime di simulazione deterministico: stato del mondo, eventi, RNG, tick, risoluzione delle azioni |
| [`@ai-rpg-engine/modules`](packages/modules) | Oltre 30 moduli componibili: combattimento, percezione, cognizione, fazioni, voci, attraversamento, compagni, agenzia NPC, mappa strategica, riconoscimento degli oggetti, opportunità emergenti, rilevamento dell'arco narrativo, trigger di fine gioco |
| [`@ai-rpg-engine/content-schema`](packages/content-schema) | Schemi e validatori canonici per i contenuti del mondo |
| [`@ai-rpg-engine/character-profile`](packages/character-profile) | Progressione del personaggio, ferite, traguardi, reputazione |
| [`@ai-rpg-engine/character-creation`](packages/character-creation) | Selezione dell'archetipo, generazione della build, equipaggiamento iniziale |
| [`@ai-rpg-engine/equipment`](packages/equipment) | Tipi di equipaggiamento, provenienza degli oggetti e crescita delle reliquie, incluso `item-chronicle-core`, il modulo facoltativo che registra la cronologia dell'equipaggiamento dal gioco reale in modo che gli oggetti ottengano epiteti e livelli |
| [`@ai-rpg-engine/campaign-memory`](packages/campaign-memory) | Memoria tra sessioni, effetti relazionali, stato della campagna |
| [`@ai-rpg-engine/rumor-system`](packages/rumor-system) | Ciclo di vita delle voci, meccaniche di mutazione, tracciamento della diffusione |
| [`@ai-rpg-engine/presentation`](packages/presentation) | Schema del piano narrativo, contratti di rendering, profili vocali |
| [`@ai-rpg-engine/audio-director`](packages/audio-director) | Pianificazione delle cue, priorità, attenuazione, logica del tempo di ricarica |
| [`@ai-rpg-engine/soundpack-core`](packages/soundpack-core) | Manifesti del pacchetto audio, registro indirizzabile in base al contenuto |
| [`@ai-rpg-engine/pack-registry`](packages/pack-registry) | Registrazione del pacchetto, punteggio della rubrica, scoperta del pacchetto |
| [`@ai-rpg-engine/asset-registry`](packages/asset-registry) | Archiviazione indirizzata in base al contenuto per ritratti, icone, media |
| [`@ai-rpg-engine/image-gen`](packages/image-gen) | Generazione di ritratti senza interfaccia utente con provider collegabili |
| [`@ai-rpg-engine/ollama`](packages/ollama) | Creazione di IA facoltativa: scaffolding, critica, flussi di lavoro guidati, ottimizzazione, esperimenti |
| [`@ai-rpg-engine/cli`](packages/cli) | CLI: esegui giochi, crea modelli iniziali, ispeziona i salvataggi |
| [`@ai-rpg-engine/terminal-ui`](packages/terminal-ui) | Renderer terminale e livello di input |
| [`@ai-rpg-engine/starter-merchant`](packages/starter-merchant) | Modello iniziale mercantile: il pacchetto di riferimento per l'adattatore del registro, che non dipende da esso |
| [`@ai-rpg-engine/starter-bounty-hunter`](packages/starter-bounty-hunter) | Modello iniziale cacciatore di ladri: l'inseguimento come ciclo e quale metà della città aprirà una porta per te |
| [`@ai-rpg-engine/ledger-adapter`](packages/ledger-adapter) | **Facoltativo:** convalida facoltativa della testnet XRPL per il livello negoziabile di proprietà del giocatore (monete/inventario/scambio), tramite XLS-85 escrow di token ai checkpoint, completamente al di fuori del core deterministico |

### Esempi di modelli iniziali

I 12 mondi iniziali sono **esempi di composizione**: dimostrano come combinare i moduli del motore in giochi completi. Ognuno mostra schemi diversi (mappature delle statistiche, profili delle risorse, configurazioni di coinvolgimento, set di abilità). Consulta il file README di ogni modello iniziale per "Schemi dimostrati" e "Cosa prendere in prestito".

| Modello iniziale | Genere | Schemi chiave |
|---------|-------|-------------|
| [`starter-fantasy`](packages/starter-fantasy) | Dark fantasy | Combattimento minimo, guidato dal dialogo |
| [`starter-cyberpunk`](packages/starter-cyberpunk) | Cyberpunk | Risorse, ruoli di coinvolgimento |
| [`starter-detective`](packages/starter-detective) | Mistero vittoriano | Prima di tutto l'aspetto sociale, con grande attenzione alla percezione |
| [`starter-pirate`](packages/starter-pirate) | Pirata | Navale + corpo a corpo, multi-zona |
| [`starter-zombie`](packages/starter-zombie) | Sopravvivenza agli zombie | Scarsità, risorsa dell'infezione |
| [`starter-weird-west`](packages/starter-weird-west) | Weird west | Bias dei pacchetti, recupero in zona sicura |
| [`starter-colony`](packages/starter-colony) | Colonia fantascientifica | Colli di bottiglia, zone di imboscata |
| [`starter-ronin`](packages/starter-ronin) | Giappone feudale | Passaggi nascosti, ruoli di protezione multipli |
| [`starter-merchant`](packages/starter-merchant) | Mercantile | L'obbligo come ciclo, il combattimento ha un costo come penalità |
| [`starter-bounty-hunter`](packages/starter-bounty-hunter) | Inseguimento | Caccia alle persone per soldi; la violenza è rumorosa, non proibita |
| [`starter-vampire`](packages/starter-vampire) | Horror vampiresco | Risorsa del sangue, manipolazione sociale |
| [`starter-gladiator`](packages/starter-gladiator) | Gladiatore storico | Combattimento nell'arena, favore della folla |

---

## Documentazione

| Risorsa | Descrizione |
|----------|-------------|
| [Crea il tuo mondo iniziale](site/src/content/docs/handbook/58-create-your-own-starter.md) | Crea un nuovo gioco: tramite CLI o percorso del modello manuale |
| [Guida alla composizione](site/src/content/docs/handbook/57-composition-guide.md) | Crea il tuo gioco componendo moduli del motore |
| [Profili plug-in](site/src/content/docs/handbook/59-plugin-profiles.md) | Risoluzione delle regole per entità: combattimento con stili di gioco misti, `applyProfile`, modelli di profilo, la CLI `profile` |
| [Adattatore del registro XRPL](site/src/content/docs/handbook/60-xrpl-ledger-adapter.md) | Integrazione opzionale con il registro — firewall deterministico, livelli di integrazione L0/L1/L2, modalità di gioco, misure di sicurezza e demo pirata testata dal vivo |
| [Panoramica del combattimento](site/src/content/docs/handbook/49a-combat-overview.md) | Sei pilastri del combattimento, cinque azioni, stati a colpo d'occhio |
| [Guida per gli autori di pacchetti](site/src/content/docs/handbook/55-combat-pack-guide.md) | buildCombatStack passo dopo passo, mappatura delle statistiche, profili delle risorse |
| [Client visivi](site/src/content/docs/handbook/66-visual-clients.md) | Host sidecar, payload felt, porto dimetrico di Godot: la presentazione potrebbe essere fuorviante, l'occupazione rimane un ID di zona |
| [Manuale](site/src/content/docs/handbook/index.md) | Manuale completo: ogni sistema, più 4 appendici |
| [Modello di composizione](docs/composition-model.md) | I 6 livelli riutilizzabili e come si compongono |
| [Esempi](docs/examples/) | Esempi TypeScript eseguibili (con controllo dei tipi e test del comportamento in CI) — gruppo misto per entità, profili condivisi, tra mondi, da zero |
| [Documento di progettazione](docs/DESIGN.md) | Analisi approfondita dell'architettura: pipeline delle azioni, verità contro presentazione |
| [Filosofia](PHILOSOPHY.md) | Mondi deterministici, progettazione basata sull'evidenza, IA come assistente |
| [Registro delle modifiche](CHANGELOG.md) | Cronologia delle versioni |

---

## Roadmap

### Dove siamo ora

Entrambe le strutture di composizione sono complete: **8368 test su 388 file**, tutti i 12 mondi iniziali su `buildCombatStack` **e** `buildWorldStack`, riproduzione deterministica e identica byte per byte con seed stampati, punteggio completo delle decisioni dell'IA e una CLI che crea, esegue, convalida e ispeziona. L'arco v3.x ha reso il mondo attivo (NPC con nomi, la superficie sociale con 25 verbi, economie di genere — v3.0–v3.1), ha inserito risorse di proprietà del giocatore sulla testnet XRPL come canale secondario opzionale (v3.2–v3.4), ha creato due mondi iniziali incentrati sul sistema e li ha trasformati in strumenti per migliorare il motore (v3.5–v3.6), ha illuminato e rafforzato lo strato strategico finché le conseguenze non lasciano segni reali (v3.7–v3.8), ha fornito agli host la superficie del motore di cui hanno bisogno per l'integrazione con Godot (v3.8.1), ha chiuso il ciclo di creazione in modo che una sessione di studio o un semplice pacchetto JSON producano un mondo giocabile dall'inizio alla fine (v3.9), ha portato l'intero strato strategico sui sensi del giocatore (v3.10), ha ottimizzato la profondità che questi sensi raggiungono ora (v3.11) e **ha fornito a un host di rendering la sensazione di un tick: il primo client pixel, un porto dimetrico di Godot 4, viene eseguito su tale contratto (v3.12)**.

La cronologia completa delle versioni è in [CHANGELOG.md](CHANGELOG.md).

### Prossimo

La v3.12 ha chiuso il contratto felt e il primo host di rendering. Ciò che resta è un lavoro successivo, non gli elementi rimasti di questo ciclo:

- Un sottofondo audio ambientale per la categoria tonale "prosperous" (il ponte tonale e la selezione musicale per zona sono già inclusi; a CORE manca ancora una traccia base "prosperous")
- Multiplayer: due giocatori *umani* che condividono un mondo (un livello di rete, volutamente differito; i profili condivisi a controller singolo vengono rilasciati oggi come [`shared-profiles.ts`](docs/examples/shared-profiles.ts))
- Override di formule serializzabili: messa a punto delle formule per profilo (bloccato su un DSL per formule; i profili contengono oggi mappature di statistiche, non chiusure)

### Destinazione: profili plug-in

L'obiettivo finale del motore è **profili definiti dall'utente**: pacchetti portatili che si inseriscono in qualsiasi gioco. Un profilo impacchetta una mappatura delle statistiche, il comportamento delle risorse, i tag di bias dell'IA e le abilità in un'unica unità importabile. A partire da v2.5, le entità in un mondo possono ciascuna avere il proprio profilo e risolvere il combattimento per entità: un guerriero `might` e un mistico `will` condividono un gruppo, ognuno portando il proprio stile di gioco.

Lo schema, il caricatore `applyProfile`, la risoluzione delle abilità per entità e la convalida tra profili sono tutti stati rilasciati. Ciò che resta è il multiplayer: consentire a due giocatori *umani* (non solo a due entità) di condividere un mondo, che è un livello di rete. Vedi [Roadmap del profilo](docs/profile-roadmap.md) e [feature-architecture.md](docs/feature-architecture.md) per il progetto.

---

## Filosofia

AI RPG Engine è costruito su tre idee:

1. **Mondi deterministici**: i risultati della simulazione devono essere riproducibili.
2. **Progettazione basata sull'evidenza**: la meccanica del mondo dovrebbe essere testata attraverso la simulazione.
3. **IA come assistente, non come autorità**: gli strumenti di IA aiutano a generare e a valutare i progetti, ma non sostituiscono i sistemi deterministici.

Per una spiegazione completa, consultare [PHILOSOPHY.md](PHILOSOPHY.md).

---

## Sicurezza

Il motore principale è una **libreria di simulazione esclusivamente locale**: nessun telemetria, nessuna connessione di rete, nessun dato sensibile. I file di salvataggio vengono salvati in `.ai-rpg-engine/` solo quando richiesto esplicitamente. Due **livelli opzionali** aggiungono un percorso di comunicazione in uscita, e solo quando vengono attivati:

- Il livello di intelligenza artificiale (`@ai-rpg-engine/ollama`) comunica con un daemon Ollama **locale**; la sua opzione di attivazione `webfetch` (per RAG) è limitata da una protezione SSRF (che blocca loopback/link-local/CGNAT/metadati cloud e IPv6-tunnelled equivalenti).
- Il livello del registro (`@ai-rpg-engine/ledger-adapter`) raggiunge la **testnet XRPL** — e solo la testnet: una protezione strutturale **impossibile nel codice per la mainnet** (non un flag di configurazione) rifiuta qualsiasi host non appartenente alla testnet durante la creazione. I seed del portafoglio sono memorizzati in un file secondario ignorato da Git, mai in un file di salvataggio, e il core deterministico non importa mai l'adattatore.

Per i dettagli, consultare [SECURITY.md](SECURITY.md).

## Requisiti

- Node.js >= 20
- TypeScript (moduli ESM)

## Licenza

[MIT](LICENSE)

---

Realizzato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
