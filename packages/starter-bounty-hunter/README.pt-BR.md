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

# @ai-rpg-engine/starter-bounty-hunter

> **Exemplo de Composição** — Este pacote inicial demonstra como criar um jogo cujo ciclo principal é a perseguição, e cuja verdadeira moeda é qual metade da cidade ainda abrirá uma porta para você. É um exemplo para aprender, não um modelo para copiar. Consulte o [Guia de Composição](../../docs/handbook/57-composition-guide.md) para criar seu próprio jogo.

**Alerta Geral** — Você é um caçador de ladrões em uma cidade sem força policial e sem desejo de tê-la. Não há lei aqui. Há um preço, e você está disposto a pagá-lo.

Parte do catálogo de pacotes iniciais do [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

*Alerta geral* é a verdadeira instituição: o dever legal de cada transeunte de se juntar a uma perseguição, assim que ela for iniciada. É também, exatamente, a doutrina de "alerta" deste motor, em linguagem da época — **o alerta determina se o mundo está prestando atenção agora; a reputação determina se ele se lembrará depois.** O pacote foi criado com essa doutrina, e não ao seu redor. Ele não adiciona um segundo contador de perseguição.

A cidade tem duas metades que cobram por informações. O escritório de recompensas paga por cabeça e lhe concede a proteção legal para capturar alguém. O submundo paga pelo silêncio, por objetos roubados e por um homem que não testemunhará. Jonathan Quill — que se autodenomina Caçador-Geral de Ladrões — descobriu que você pode gerenciar os dois ao mesmo tempo. Ele é o chefe deste pacote, e não é um monstro; ele é você, quatro anos mais tarde, seguindo o mesmo caminho.

## Início Rápido

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

## Padrões Demonstrados

- **Um ciclo de perseguição sem um segundo contador** — `pursuitState` é uma derivação pura do próprio `player_heat` e do alerta da facção. `HUNTED_HEAT` *é* o `HEAT_ESCALATION_THRESHOLD` do "tick" mundial, então o jogador nunca tem dois números que discordem sobre se ele está sendo caçado.
- **Uma reputação de duas faces como a pressão do pacote** — `warrant` é proteção legal; `infamy` é a avaliação do submundo sobre você. Trabalhar em um aumenta e gasta o outro. Nenhum deles é um medidor de ruína; não há perda de valor, apenas um lado para o qual você está se inclinando.
- **Recusa como uma mecânica** — `collar` requer proteção legal *e* um alvo já enfraquecido, e diz por que recusa caso contrário. Uma captura que não verifica nada é um teste com uma recompensa anexada.
- **A doutrina como um verbo do jogador** — `lay-low` transforma o silêncio, que o motor já recompensa, em algo que você escolhe, e se recusa quando ninguém está olhando, porque um verbo que sempre funciona não ensina nada.
- **Conteúdo criado de forma inversa às regras de geração** — O escrivão Hesper é aliado e ganancioso porque essa é a única forma de NPC da qual o `contract` do motor oferecerá trabalho. O Rookery foi criado como pobre e descontrolado porque é isso que as regras do distrito indicam.
- **Um módulo local do pacote** — `pursuit-core` vive dentro do pacote inicial, em vez de em `@ai-rpg-engine/modules`, porque tem exatamente um consumidor. Promova no segundo uso.

## Mecânicas Únicas

| Verbo | O que ele faz |
|------|--------------|
| `collar` | Captura um alvo **vivo** sob mandado. Requer proteção legal e um alvo já enfraquecido; recusa caso contrário, com a razão. Produz um registro, não um pagamento. |
| `impeach` | Testemunha contra um alvo que você tem em custódia. Converte a captura em uma condenação: mandado mantido, infâmia reduzida. O escritório confia em um caçador de ladrões que cumpre o prometido. |
| `informant` | Compra informações sobre o paradeiro de um alvo. O preço é uma função impressa do seu próprio status na rua — estranhos pagam o dobro — e perguntar é, por si só, um sinal, então a infâmia aumenta. |
| `post-bounty` | Coloca seu próprio preço em um nome, gastando o crédito do escritório para fazê-lo. Sua vingança se torna o trabalho de outras pessoas. |
| `fence` | Move mercadorias recuperadas pelo mercado negro. Precisa de uma **pessoa**, não de um menu. Paga mal de propósito: você não está aqui pelo dinheiro. |
| `lay-low` | Passa um dia fora da vista e deixa o alvoroço diminuir. Recusado quando ninguém está olhando. |

**O estado de perseguição** é `COLD` / `SEARCHED` / `HUNTED`, e cada estado carrega o número que o causou. Uma facção em alerta 60 ou acima caça você durante uma semana tranquila, porque o alerta é memória e o "heat" é atenção — que é a doutrina, expressa no vocabulário do pacote.

## Conteúdo

- **7 zonas** em 3 distritos: o Bairro (escritório e sessões), o Mercado (mercado e a parede dos mortos) e o Rookery — pobre, descontrolado e mensuravelmente mais difícil de obter uma resposta direta.
- **4 NPCs** — Escrivão Hesper, Mãe Slack, Sargento Pike (recrutável), o Escriba
- **3 hostis + 1 chefe** — Jonathan Quill não fica mais forte ao perder. Ele se torna mais sincero.
- **3 missões** — O Primeiro Bilhete, Dinheiro Sangrento, O Caçador-Geral de Ladrões
- **6 itens**, incluindo o Bilhete de Tyburn: um certificado real e transferível que historicamente valia mais do que a recompensa pela qual foi dado.

## Estatísticas e Recursos

| Estatística | Função |
|------|------|
| `grip` | O que você pode fazer com um homem que não quer ser capturado |
| `nose` | Ler uma sala, um livro-razão, uma mentira — o verdadeiro ofício do caçador de ladrões |
| `authority` | Se a sala acredita que você tem o direito de estar fazendo isso |

| Recurso | Comportamento |
|----------|-----------|
| `hp` | 32 máximo — você captura pessoas para viver |
| `stamina` | O custo de uma perseguição. Lutar gasta; `lay-low` restaura |
| `coin` | O que os informantes querem |
| `warrant` | Proteção legal. Gasto por `collar` e `post-bounty`, restaurado por `impeach` |
| `infamy` | A outra metade da avaliação da cidade sobre você. **Não** é um medidor de ruína |

Mapas de combate `attack → grip`, `precision → nose`, `resolve → authority`. A violência não é proibida aqui — ela é **alta**, e gasta a energia que você precisa para a próxima captura.

## O que pegar emprestado

A derivação do estado de perseguição, se o seu jogo tiver uma sequência de perseguição: três palavras, determinística, cada transição nomeando o seu gatilho e nenhum estado que o motor não possua já. A reputação bilateral, se o seu jogo tiver facções que desejam coisas incompatíveis da mesma pessoa. E `anti-inert.test.ts` — cada verbo nativo do conjunto recebe uma linha comprovando que ele altera algo *e* uma linha comprovando que a sua recusa é uma rejeição estruturada, e não apenas silêncio.

## Licença

MIT
