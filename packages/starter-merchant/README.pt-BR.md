<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

> **Exemplo de Composição** — Este pacote inicial demonstra como criar um jogo cujo ciclo principal é a obrigação, e não o combate. É um exemplo para aprender, não um modelo para copiar. Consulte o [Guia de Composição](../../docs/handbook/57-composition-guide.md) para criar seu próprio jogo.

**Livro Razão da Estrada Salgada** — Você é um agente de uma pequena casa comercial. Você não é proprietário dos bens que transporta; você tem dívidas com eles. Cada moeda que lhe devem é uma faca que outra pessoa está segurando.

Parte do catálogo de pacotes iniciais do [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Pressão comercial, sarcástica e depois arruinadora. Nada na Estrada Salgada é escasso — a restrição é o que você prometeu. `liquidity` é o que você pode usar sem gerar uma dívida; `lien` acumula-se quando você não pode, e aos 70, a Guilda de Avaliação toma posse de um ativo em consignação. Aos 90, ela toma seu selo.

O combate existe e é deliberadamente um **mau negócio**. O HP atinge o máximo de 24, o menor limite do catálogo, e o perfil de recursos de combate tem uma matriz `gains` vazia — nenhuma linha em lugar nenhum recompensa a violência. Atacar gasta liquidez, receber dano esgota-a e vencer esgota mais 5, porque você acabou de danificar a propriedade de alguém.

## Início Rápido

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

## Padrões Demonstrados

- **Um ciclo principal não baseado em combate** — cinco verbos comerciais impulsionam o jogo; o conjunto de combate está conectado, mas com um preço que funciona como uma penalidade.
- **Um perfil de recursos invertido** — `CombatResourceProfile` sem `gains`, então a IA força um agente com baixa liquidez a se afastar.
- **Um módulo local do pacote** — `contract-core` reside dentro do pacote inicial em vez de em `@ai-rpg-engine/modules`, porque tem exatamente um consumidor. Promova no segundo nível.
- **Operações injetadas em vez de novas dependências** — o mecanismo de status e o avaliador de reconhecimento são passados, a mesma estrutura que `createEquipmentCore` usa.
- **Instrumentos que limitam as mecânicas, não os atributos** — o Selo da Guilda concede `consign` e o Livro Razão concede `audit`, então uma apreensão remove um verbo.
- **Um distrito descontrolado como uma mecânica** — The Warrens não tem nenhuma facção controladora, o que o torna o único lugar sem depósito de garantia e sem recurso legal.

## Mecânicas Únicas

| Verbo | O que ele faz |
|------|--------------|
| `appraise` | Lê o valor real, a raridade e a proveniência em relação ao preço pedido. Um `ledger` melhor estreita a faixa. |
| `haggle` | Contesta um preço. Custa liquidez; a margem obtida é depositada contra essa contraparte e consumida pelo seu próximo `consign` com ela. |
| `consign` | Entrega bens em troca de pagamento futuro, criando uma obrigação com uma data de vencimento. Os bens saem do seu inventário imediatamente — essa lacuna é todo o risco. |
| `underwrite` | Assume o risco de outra parte por uma taxa. Liquidez agora; se a parte que você garantiu não cumprir, a reivindicação é acionada e a garantia é aplicada. |
| `audit` | Reconcilia seus livros e relata as discrepâncias. Requer o Livro Razão — você não pode fazer uma auditoria apenas com a memória. |

O **relógio da obrigação** funciona com base no movimento, em vez de um temporizador. As consignações vencidas acumulam garantia em `overdueTicks × value ÷ 10`. A apreensão na garantia 70 toma posse da obrigação cujo ID do item é o menor — determinístico, nunca aleatório.

## Conteúdo

- **8 zonas** em 4 distritos: Saltgate (o mercado legal), Dockward (tarifas e atrasos), The Warrens (dinheiro na mão) e a High Counting House.
- **4 NPCs** — Assay Master Corvane, Harbourmaster Drell, Broker Inaya, Exchequer Null.
- **3 hostis + 1 chefe** — The Standing Account não é uma criatura, mas um acerto de contas, com fases baseadas em quão sobrecarregado você chega.
- **3 missões** — Open the Books, The Late Caravan, The Standing Account.
- **14 itens** divididos em bens comerciais fungíveis e cinco instrumentos exclusivos.

## Atributos e Recursos

| Atributo | Função |
|------|------|
| `ledger` | Aritmética, memória, detecção de fraude |
| `tongue` | Negociação e dissimulação |
| `standing` | Quem garante você |

| Recurso | Comportamento |
|----------|-----------|
| `hp` | 24 máximo — o menor do catálogo |
| `stamina` | Economia de ação padrão |
| `coin` | O que você possui |
| `liquidity` | O que você pode usar sem gerar uma dívida |
| `lien` | **Inverso** — começa vazio e se enche até a apreensão |

Os mapas de combate `attack → tongue`, `precision → ledger`, `resolve → standing`: um agente que acaba lutando o faz intimidando e apoiando, nunca superando alguém em força.

## Jogo no Livro Razão (opcional)

Este é o pacote de referência para `@ai-rpg-engine/ledger-adapter`. Ele não tem nenhuma dependência dele — um teste afirma que nunca terá — mas suas mecânicas são aquelas para as quais o adaptador foi criado: `consign` é uma primitiva de liquidação vestida com um dispositivo de enredo, `audit` é o verificador externo como um verbo jogável e uma apreensão de garantia é o compensador de queima nomeado que aparece na ficção. Consulte [Capítulo 60](../../docs/handbook/60-xrpl-ledger-adapter.md) e [Capítulo 61](../../docs/handbook/61-xrpl-nft-gear.md).

## O que usar

O ciclo de vida da obrigação, se o seu jogo tiver dívidas. O padrão de operações injetadas, se o seu pacote precisar de um sistema sem criar uma dependência. E a auditoria anti-inercial em `anti-inert.test.ts` — ela rastreia cada mecânica principal por meio de uma sessão real e encontrou seis que estavam conectadas, com esquema válido, aprovadas nas unidades e inativas.

## Licença

MIT
