<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

> **Exemple de composition** — Ce module de démarrage illustre comment créer un jeu dont la mécanique principale est la poursuite, et dont la véritable monnaie est celle qui détermine si une partie de la ville vous ouvrira encore ses portes. Il s’agit d’un exemple à partir duquel apprendre, et non d’un modèle à copier. Consultez le [Guide de composition](../../docs/handbook/57-composition-guide.md) pour créer votre propre jeu.

**Cri d’alarme** — Vous êtes un chasseur de voleurs dans une ville sans force de police et où personne n’en souhaite une. Il n’y a pas de loi ici. Il y a un prix, et il y a vous.

Fait partie du catalogue de modules de démarrage [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Thème

*Cri d’alarme* est la véritable institution : le devoir légal de chaque témoin de se joindre à une poursuite une fois celle-ci lancée. C’est également, précisément, la doctrine de ce moteur exprimée dans un langage approprié à l’époque : **la tension détermine si le monde prête attention en ce moment ; la persistance détermine s’il s’en souvient par la suite.** Le module est conçu autour de cette doctrine plutôt que pour l’appliquer. Il n’ajoute pas de deuxième chronomètre de poursuite.

La ville a deux moitiés qui paient toutes les deux pour obtenir des informations. Le bureau des primes paie à la tête et vous fournit la couverture légale nécessaire pour en capturer une. Le monde souterrain paie pour le silence, pour les objets volés et pour un homme qui ne témoigne pas. Jonathan Quill — qui se fait appeler Général Chasseur de Voleurs — a découvert que l’on peut mener les deux opérations simultanément. C’est lui le chef de ce module, et il n’est pas un monstre ; c’est vous, quatre ans plus tard, sur la même voie.

## Démarrage rapide

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

## Mécaniques illustrées

- **Une boucle de poursuite sans deuxième chronomètre** — `pursuitState` est une simple dérivation par rapport au propre `player_heat` du moteur et à l’alerte des factions. `HUNTED_HEAT` *est* le `HEAT_ESCALATION_THRESHOLD` du cycle mondial, de sorte que le joueur n’a jamais deux chiffres qui se contredisent quant au fait qu’il est ou non pourchassé.
- **Une réputation à double facette comme pression du module** — `warrant` est une couverture légale ; `infamy` est la perception que le monde souterrain a de vous. Le développement de l’une augmente sa valeur et diminue celle de l’autre. Aucune n’est un indicateur de ruine ; il n’y a pas de perte de valeur, seulement une direction vers laquelle vous dérivez.
- **Le refus comme mécanique** — `collar` nécessite une couverture légale *et* une cible déjà affaiblie, et explique pourquoi en cas de refus. Une capture qui ne prouve rien est un jet de dégâts avec une récompense associée.
- **La doctrine comme verbe du joueur** — `lay-low` transforme le calme que le moteur récompense déjà en quelque chose que vous choisissez, et refuse lorsque personne ne regarde, car un verbe qui fonctionne toujours n’apprend rien.
- **Un contenu conçu à rebours des règles de génération** — Le commis Hesper est allié et avide parce que c’est la seule forme de PNJ dont le moteur `contract` offrira du travail. La zone de Rookery est conçue comme pauvre et incontrôlée, car c’est ce que dictent les règles du quartier.
- **Un module spécifique au module** — `pursuit-core` se trouve à l’intérieur du module de démarrage plutôt que dans `@ai-rpg-engine/modules`, car il n’a qu’un seul utilisateur. À promouvoir lors de la deuxième utilisation.

## Mécaniques uniques

| Verbe | Ce qu’il fait |
|------|--------------|
| `collar` | Capture une cible **vivante** en vertu d’un mandat. Nécessite une couverture légale et une cible déjà affaiblie ; refuse sinon, en indiquant la raison. Produit un enregistrement, pas un paiement. |
| `impeach` | Témoigne contre une cible que vous détenez. Transforme la capture en condamnation : le mandat est maintenu, l’infamie diminue. Le bureau fait confiance à un chasseur de voleurs qui mène ses missions jusqu’au bout. |
| `informant` | Achète des informations sur les allées et venues d’une cible. Le prix est une fonction imprimée de votre propre réputation auprès du monde souterrain — les étrangers paient le double — et le simple fait de demander est un signal, ce qui augmente l’infamie. |
| `post-bounty` | Fixe son propre prix pour une personne, en dépensant la crédibilité du bureau pour ce faire. Votre rancune devient le travail des autres. |
| `fence` | Fait passer les biens récupérés par le marché noir. Nécessite une **personne**, pas un menu. Paie mal intentionnellement : vous n’êtes pas là pour l’argent. |
| `lay-low` | Passe une journée hors de vue et laisse le cri d’alarme s’éteindre. Refusé lorsque personne ne regarde. |

**L’état de la poursuite** est `COLD` / `SEARCHED` / `HUNTED`, et chaque état contient le nombre qui l’a causé. Une faction en alerte 60 ou plus vous poursuit pendant une semaine calme, car l’alerte est la mémoire et la tension est l’attention — ce qui est la doctrine, exprimée dans le vocabulaire propre du module.

## Contenu

- **7 zones** réparties dans 3 quartiers : le Ward (bureau et audiences), les Shambles (marché et mur des morts) et la zone de Rookery — pauvre, incontrôlée et sensiblement plus difficile pour obtenir une réponse claire.
- **4 PNJ** — Le commis Hesper, Mère Slack, le sergent Pike (pouvant être recruté), l’écrivain.
- **3 ennemis + 1 boss** — Jonathan Quill ne devient pas plus fort lorsqu’il perd. Il devient plus franc.
- **3 quêtes** — Le premier billet, Argent sale, Le général chasseur de voleurs.
- **6 objets**, dont le Tyburn Ticket : un véritable certificat transférable qui valait historiquement plus que la récompense pour laquelle il était donné.

## Statistiques et ressources

| Statistique | Rôle |
|------|------|
| `grip` | Ce que vous pouvez faire à un homme qui ne veut pas être capturé |
| `nose` | Lire une pièce, un registre, un mensonge — le véritable métier du chasseur de voleurs. |
| `authority` | Si la pièce croit que vous avez le droit d’agir ainsi. |

| Ressource | Comportement |
|----------|-----------|
| `hp` | 32 maximum — vous capturez des gens pour gagner votre vie. |
| `stamina` | Ce qu’une poursuite coûte. Le combat en consomme ; `lay-low` la restaure. |
| `coin` | Ce que les informateurs veulent. |
| `warrant` | Couverture légale. Dépensée par `collar` et `post-bounty`, restaurée par `impeach`. |
| `infamy` | La perception qu’a l’autre moitié de la ville de vous. **Pas** un indicateur de ruine. |

Les cartes de combat sont `attack → grip`, `precision → nose`, `resolve → authority`. La violence n’est pas interdite ici — elle est **bruyante**, et elle consomme l’endurance dont vous avez besoin pour la prochaine capture.

## Ce qu’il faut emprunter

La dérivation d’état de poursuite, si votre jeu comporte une séquence de poursuite : trois mots clés, déterminisme, chaque transition indiquant son déclencheur et aucun état que le moteur ne possède pas déjà. La réputation à deux facettes, si votre jeu comporte des factions qui souhaitent obtenir des choses incompatibles d’une même personne. Et `anti-inert.test.ts` — chaque verbe propre au paquet se voit attribuer une ligne prouvant qu’il modifie quelque chose *et* une ligne prouvant que son refus est un rejet structuré plutôt qu’un simple silence.

## Licence

MIT
