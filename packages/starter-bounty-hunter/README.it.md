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

# @ai-rpg-engine/starter-bounty-hunter

> **Esempio di composizione** — Questo pacchetto iniziale dimostra come creare un gioco in cui il ciclo principale è l'inseguimento e la vera valuta è determinare quale metà della città continuerà a spalancarti le porte. È un esempio da cui imparare, non un modello da copiare. Consulta la [Guida alla composizione](../../docs/handbook/57-composition-guide.md) per creare il tuo gioco.

**Allarme generale** — Sei un cacciatore di ladri in una città senza forze dell'ordine e senza desiderio che ne abbia. Qui non ci sono leggi. C'è un prezzo, e sei tu a doverlo riscuotere.

Parte del catalogo dei pacchetti iniziali [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

*Allarme generale* è la vera istituzione: il dovere legale di ogni passante di unirsi a un inseguimento una volta che questo sia stato lanciato. È anche, esattamente, la dottrina del "calore" di questo motore espressa in linguaggio d'epoca: **il calore determina se il mondo sta prestando attenzione in questo momento; la persistenza determina se lo ricorderà in seguito.** Il pacchetto è costruito attorno a questa dottrina, piuttosto che basato su di essa. Non aggiunge un secondo contatore per l'inseguimento.

La città ha due metà, entrambe disposte a pagare per ottenere informazioni. L'ufficio dei cacciatori di taglie paga in base al numero di persone catturate e ti fornisce la copertura legale per farlo. Il sottobosco paga per il silenzio, per oggetti rubati e per un uomo che non testimonia. Jonathan Quill — che si fa chiamare Generale dei Cacciatori di Ladri — ha scoperto che puoi gestire entrambe le cose contemporaneamente. È il capo di questo pacchetto, e non è un mostro; è te, quattro anni più avanti lungo lo stesso percorso.

## Avvio rapido

```typescript
import { createGame, pursuitState, formatPursuitForNarrator } from '@ai-rpg-engine/starter-bounty-hunter';

const engine = createGame(71);

// Sign for a ticket — the office now owns what you do next
engine.submitAction('speak', { targetIds: ['clerk-hesper'] });
engine.submitAction('choose', { parameters: { choiceId: 'sign' } });

// Buy a word, walk it down, take him breathing
engine.submitAction('informant', { targetIds: ['nightman'] });
engine.submitAction('move', { targetIds: ['shambles'] });
engine.submitAction('move', { targetIds: ['rookery'] });
engine.submitAction('collar', { targetIds: ['rookery-runner'] });

// Then choose a side, for today
engine.submitAction('impeach', { targetIds: ['rookery-runner'] });  // the office
// ...or take the other road entirely
engine.submitAction('fence', { toolId: 'stolen-plate' });           // the ward

console.log(formatPursuitForNarrator(engine.world));
// [SEARCHED] Somebody raised the cry. Faces turn when you pass. (heat 12 — 10+ and the cry is up)
```

## Modelli dimostrati

- **Un ciclo di inseguimento senza un secondo contatore** — `pursuitState` è una pura derivazione rispetto al `player_heat` del motore e all'allerta della fazione. `HUNTED_HEAT` *è* il `HEAT_ESCALATION_THRESHOLD` del "tick" del mondo, quindi il giocatore non ha mai due numeri che si contraddicono sull'essere o meno braccato.
- **Una reputazione a due facce come pressione del pacchetto** — `warrant` è la copertura legale; `infamy` è la percezione che il sottobosco ha di te. Lavorare su uno aumenta questo valore e diminuisce l'altro. Nessuno dei due è un indicatore di "rovina"; non c'è una perdita di valore, solo una direzione verso cui ti stai muovendo.
- **Il rifiuto come meccanica** — `collar` richiede la copertura legale *e* un bersaglio già indebolito e spiega perché si rifiuta. Un arresto che non verifica nulla è un tiro per infliggere danni con un compenso allegato.
- **La dottrina come verbo del giocatore** — `lay-low` trasforma il silenzio, che il motore già premia, in qualcosa che scegli tu, e si rifiuta quando nessuno sta guardando, perché un verbo che funziona sempre non insegna nulla.
- **Contenuti creati a partire dalle regole di generazione** — Il commesso Hesper è alleato e avido perché quella è l'unica forma NPC da cui il `contract` del motore può offrire lavoro. Il quartiere malfamato è stato creato come povero e incontrollabile perché è quello che suggeriscono le regole del distretto.
- **Un modulo specifico per il pacchetto** — `pursuit-core` si trova all'interno del pacchetto iniziale anziché in `@ai-rpg-engine/modules`, perché ha esattamente un solo utente. Promuovilo al secondo livello.

## Meccaniche uniche

| Verbo | Cosa fa |
|------|--------------|
| `collar` | Prende un bersaglio **vivo** in base a un mandato. Richiede la copertura legale e un bersaglio già indebolito; altrimenti, si rifiuta, spiegando il motivo. Produce una registrazione, non un pagamento. |
| `impeach` | Testimonia contro un bersaglio che hai catturato. Trasforma l'arresto in una condanna: il mandato rimane attivo, la fama diminuisce. L'ufficio si fida di un cacciatore di ladri che porta a termine il lavoro. |
| `informant` | Acquista informazioni sulla posizione di un bersaglio. Il prezzo è una funzione calcolata in base alla tua reputazione nel quartiere: gli estranei pagano il doppio, e chiedere le informazioni è di per sé un segnale, quindi la fama aumenta. |
| `post-bounty` | Applica il tuo prezzo a un nome, spendendo i crediti dell'ufficio per farlo. Il tuo rancore diventa il lavoro di altre persone. |
| `fence` | Trasporta la merce recuperata attraverso il mercato nero. Richiede una **persona**, non un menu. Paga male intenzionalmente: tu non sei qui per i soldi. |
| `lay-low` | Passa un giorno fuori dalla vista e lascia che l'allarme si affievolisca. Si rifiuta quando nessuno sta guardando. |

Lo **stato di inseguimento** è `COLD` / `SEARCHED` / `HUNTED`, e ogni stato porta con sé il numero che lo ha causato. Una fazione in allerta 60 o superiore ti dà la caccia anche durante una settimana tranquilla, perché l'allerta è memoria e il calore è attenzione: questa è la dottrina, espressa nel linguaggio del pacchetto stesso.

## Contenuti

- **7 zone** in 3 distretti: il Quartiere (ufficio e tribunali), il Mercato (mercato e il muro dei morti) e il Quartiere Malfamato: povero, incontrollabile e misurabilmente più difficile da ottenere risposte chiare.
- **4 PNG** — Il commesso Hesper, Madre Slack, il sergente Pike (reclutabile), lo scrivano
- **3 nemici + 1 boss** — Jonathan Quill non diventa più forte quando perde. Diventa solo più sincero.
- **3 missioni** — Il primo biglietto, Denaro sporco, Il Generale dei Cacciatori di Ladri
- **6 oggetti**, incluso il Biglietto di Tyburn: un certificato reale e trasferibile che storicamente valeva più della ricompensa per cui era stato emesso.

## Statistiche e risorse

| Statistica | Ruolo |
|------|------|
| `grip` | Cosa puoi fare a un uomo che non vuole essere catturato |
| `nose` | Leggere una stanza, un registro contabile, una bugia: il vero mestiere del cacciatore di ladri |
| `authority` | Se la stanza crede che tu abbia il diritto di fare questo |

| Risorsa | Comportamento |
|----------|-----------|
| `hp` | 32 massimo: catturi persone per vivere |
| `stamina` | Cosa costa un inseguimento. Combattere lo consuma; `lay-low` lo ripristina |
| `coin` | Cosa vogliono gli informatori |
| `warrant` | Copertura legale. Spesa da `collar` e `post-bounty`, ripristinata da `impeach` |
| `infamy` | La percezione che l'altra metà della città ha di te. **Non** un indicatore di "rovina" |

Le mappe del combattimento sono `attack → grip`, `precision → nose`, `resolve → authority`. La violenza non è proibita qui: è solo **rumorosa**, e consuma la resistenza necessaria per il prossimo arresto.

## Cosa prendere in prestito

Nel caso di un gioco che preveda inseguimenti, la derivazione dello stato di inseguimento deve rispettare questi criteri: tre parole chiave, deterministico, ogni transizione deve indicare il suo elemento scatenante e non devono esserci stati che il motore di gioco non gestisca già. Nel caso di un gioco con fazioni che desiderano ottenere cose incompatibili dalla stessa persona, è necessario implementare un sistema di reputazione a due facce. E `anti-inert.test.ts`: ogni verbo nativo del pacchetto deve avere una riga che dimostri che modifica qualcosa e una riga che dimostri che il suo rifiuto rappresenta un diniego strutturato piuttosto che un semplice silenzio.

## Licenza

MIT
