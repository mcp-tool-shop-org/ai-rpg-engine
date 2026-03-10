<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/ai-rpg-engine/readme.png" width="300" alt="AI RPG Engine">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ai-rpg-engine/audio-director"><img src="https://img.shields.io/npm/v/@ai-rpg-engine/audio-director.svg" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-rpg-engine/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# @ai-rpg-engine/audio-director

Motor de agendamento determinístico de sinais de áudio para o [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

Faz parte do **Immersion Runtime** — converte planos de narração em comandos de áudio temporizados e priorizados.

## Instalação

```bash
npm install @ai-rpg-engine/audio-director
```

## O que ele faz

O Audio Director recebe um `NarrationPlan` e produz um array ordenado de `AudioCommand[]` — pronto para ser executado por qualquer sistema de áudio. Ele gerencia:

- **Prioridade**: Voz > Efeitos sonoros > Música > Ambiente (configurável)
- **Atenuação**: O volume do ambiente/música diminui automaticamente quando a voz é reproduzida.
- **Tempo de espera**: Evita o excesso de efeitos sonoros (configurável para cada recurso).
- **Sincronização**: Sincroniza os sinais de áudio com a duração da fala.
- **Rastreamento de camadas**: Sabe quais camadas de ambiente estão ativas.

## Uso

```typescript
import { AudioDirector } from '@ai-rpg-engine/audio-director';
import type { NarrationPlan } from '@ai-rpg-engine/presentation';

const director = new AudioDirector({
  defaultCooldownMs: 2000,
});

// Schedule commands from a narration plan
const commands = director.schedule(plan);

// Execute commands through your audio backend
for (const cmd of commands) {
  await audioBackend.execute(cmd);
}

// Check cooldowns
director.isOnCooldown('alert_warning'); // true if recently played

// Clear cooldowns on scene change
director.clearCooldowns();
```

## Regras de atenuação padrão

| Gatilho | Alvo | Nível de atenuação |
|---------|--------|-----------|
| Voz | Ambiente | 30% de volume |
| Voz | Música | 40% de volume |
| Efeitos sonoros | Ambiente | 60% de volume |

## Faz parte do AI RPG Engine

Este pacote faz parte do repositório monolítico [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine). Consulte o arquivo README principal para a arquitetura completa.

## Licença

MIT
