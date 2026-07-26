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

# @ai-rpg-engine/starter-merchant

> **Esempio di composizione** — Questo pacchetto iniziale dimostra come creare un gioco in cui il ciclo principale è basato sull'obbligo piuttosto che sul combattimento. È un esempio da cui imparare, non un modello da copiare. Consulta la [Guida alla composizione](../../docs/handbook/57-composition-guide.md) per creare il tuo gioco.

**Registro della Via del Sale** — Sei un agente di una piccola casa commerciale. Non possiedi le merci che trasporti; sei in debito per esse. Ogni moneta che ti è dovuta è un coltello che qualcun altro sta stringendo.

Parte del catalogo dei pacchetti iniziali [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Pressione mercantile, inizialmente sottile e poi distruttiva. Nulla sulla Via del Sale è scarso: il limite è ciò che hai promesso. `liquidity` è ciò che puoi utilizzare senza dover far fronte a un debito; `lien` si accumula quando non puoi farlo, e al valore di 70 la Gilda dei Periti prende in custodia un bene affidato. Al valore di 90 prende il tuo sigillo.

Il combattimento esiste ed è deliberatamente una **cattiva scelta**. I punti vita raggiungono un massimo di 24, il limite più basso del catalogo, e il profilo delle risorse di combattimento ha un array `gains` vuoto: nessuna riga premia la violenza. Attaccare consuma liquidità, subire danni la prosciuga e vincere ne prosciuga altre 5, perché hai appena danneggiato la proprietà di qualcuno.

## Avvio rapido

```typescript
import { createGame } from '@ai-rpg-engine/starter-merchant';

const engine = createGame(71);

// Register with the Assay Guild — the seal is what makes consignment possible
engine.submitAction('speak', { targetIds: ['assay-master-corvane'] });
engine.submitAction('choose', { parameters: { choiceId: 'register' } });

// Read the goods, contest the terms, then hand them over
engine.submitAction('appraise', { parameters: { itemId: 'bale-of-flax' } });
engine.submitAction('move', { targetIds: ['long-quay'] });
engine.submitAction('move', { targetIds: ['crooked-stair'] });
engine.submitAction('haggle', { targetIds: ['broker-inaya'] });
engine.submitAction('consign', { parameters: { itemId: 'bale-of-flax' }, targetIds: ['broker-inaya'] });

// Reconcile your own books
engine.submitAction('audit');
```

## Modelli dimostrati

- **Un ciclo principale non basato sul combattimento** — cinque verbi commerciali guidano il gioco; lo schema del combattimento è presente ma ha un costo elevato, fungendo da penalità.
- **Un profilo delle risorse invertito** — `CombatResourceProfile` senza `gains`, quindi l'IA spinge un agente con poca liquidità verso la disimpegno.
- **Un modulo locale al pacchetto** — `contract-core` si trova all'interno del pacchetto iniziale anziché in `@ai-rpg-engine/modules`, perché ha esattamente un solo utente. Promuoverlo nella seconda fase.
- **Operazioni iniettate invece di nuove dipendenze** — il meccanismo dello stato e l'analizzatore di riconoscimento vengono passati, utilizzando lo stesso schema che utilizza `createEquipmentCore`.
- **Strumenti che regolano le meccaniche, non le statistiche** — il Sigillo della Gilda concede `consign` e il Registro concede `audit`, quindi una confisca rimuove un verbo.
- **Un distretto incontrollato come meccanica** — i Quartieri Bassi non hanno una fazione dominante, ed è questo che li rende l'unico luogo in cui non ci sono depositi a garanzia o possibilità di ricorso.

## Meccaniche uniche

| Verbo | Cosa fa |
|------|--------------|
| `appraise` | Valuta il valore reale, la rarità e la provenienza rispetto al prezzo richiesto. Un `ledger` migliore restringe l'intervallo. |
| `haggle` | Contesta un prezzo. Costa liquidità; il margine vinto viene accreditato su quel controparte e consumato nel tuo prossimo `consign` con esso. |
| `consign` | Consegna le merci in cambio di un pagamento futuro, creando un obbligo con una data di scadenza. Le merci lasciano immediatamente il tuo inventario: questo divario è l'intero rischio. |
| `underwrite` | Si assume il rischio di un'altra parte in cambio di una commissione. Liquidità ora; se la parte che hai garantito non rispetta gli accordi, la richiesta viene attivata e il pegno viene applicato. |
| `audit` | Riconcilia i tuoi registri e segnala le discrepanze. Richiede il Registro: non puoi effettuare un controllo dai ricordi. |

**L'orologio degli obblighi** si basa sul movimento anziché su un timer. Gli impegni scaduti accumulano pegno a `overdueTicks × value ÷ 10`. La confisca al valore di 70 prende l'obbligo il cui ID articolo è il più basso: deterministico, mai casuale.

## Contenuto

- **8 zone** in 4 distretti: Saltgate (il mercato legale), Dockward (tariffe e ritardi), i Quartieri Bassi (pagamento immediato) e la Grande Casa di Contabilità.
- **4 PNG** — Mastro perito Corvane, Capo del porto Drell, Broker Inaya, Tesoriere Null.
- **3 nemici + 1 boss** — Il Conto Permanente non è una creatura ma un saldo, con fasi basate su quanto sei carico.
- **3 missioni** — Apri i libri, La carovana in ritardo, Il conto permanente.
- **14 oggetti** suddivisi in merci commerciali fungibili e cinque strumenti unici.

## Statistiche e risorse

| Statistica | Ruolo |
|------|------|
| `ledger` | Aritmetica, memoria, rilevamento delle frodi |
| `tongue` | Negoziazione e depistaggio |
| `standing` | Chi ti garantisce |

| Risorsa | Comportamento |
|----------|-----------|
| `hp` | 24 massimo: il più basso del catalogo |
| `stamina` | Economia di azioni standard |
| `coin` | Cosa possiedi |
| `liquidity` | Cosa puoi utilizzare senza dover far fronte a un debito |
| `lien` | **Inverso** — inizia vuoto e si riempie fino alla confisca |

Le mappe di combattimento `attack → tongue`, `precision → ledger`, `resolve → standing`: un agente che finisce per combattere lo fa intimidendo e facendo leva, mai superando gli altri con la forza.

## Gioco basato sul registro (opzionale)

Questo è il pacchetto di riferimento per `@ai-rpg-engine/ledger-adapter`. Non ha alcuna dipendenza da esso: un test afferma che non ne avrà mai, ma le sue meccaniche sono quelle per cui è stato creato l'adattatore: `consign` è una primitiva di regolamento con la forma di un elemento della trama, `audit` è il verificatore esterno come verbo giocabile e una confisca è il compensatore di costo denominato che si manifesta nella finzione. Consulta [Capitolo 60](../../docs/handbook/60-xrpl-ledger-adapter.md) e [Capitolo 61](../../docs/handbook/61-xrpl-nft-gear.md).

## Cosa prendere in prestito

Il ciclo di vita degli obblighi, se il tuo gioco ha debiti. Il modello delle operazioni iniettate, se il tuo pacchetto necessita di un sistema senza creare una dipendenza. E l'audit anti-inerzia in `anti-inert.test.ts`: traccia ogni meccanica principale attraverso una sessione di gioco reale e ne ha trovate sei che erano cablate, valide nello schema, verdi nell'unità e inutili.

## Licenza

MIT
