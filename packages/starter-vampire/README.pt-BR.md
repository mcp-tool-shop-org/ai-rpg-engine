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

# @ai-rpg-engine/starter-vampire

**Crimson Court** — Uma mansão aristocrática em ruínas durante um baile de máscaras. Três famílias de vampiros disputam a supremacia, enquanto a sede ameaça consumi-lo.

Parte do catálogo de pacotes de inicialização do [AI RPG Engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine).

## Tema

Horror gótico + política da corte de vampiros. A sede aumenta a cada instante — se atingir 100, o jogador perde o controle. Alimentar-se reduz a sede, mas custa humanidade. Os vampiros percebem os humanos como "vasos de calor".

## Início Rápido

```typescript
import { createGame } from '@ai-rpg-engine/starter-vampire';

const engine = createGame();
engine.start();
```

## Conteúdo

- **5 zonas:** Salão de baile, Galeria Leste, Adega, Jardim à luz da lua, Torre do sino
- **3 NPCs:** Duquesa Morvaine (vampira anciã), Cassius (rival recém-transformado), Empregada Elara (humana)
- **2 inimigos:** Caçador de bruxas, Servo selvagem
- **1 árvore de diálogo:** Audiência com a Duquesa sobre política da corte e controle da sede
- **1 árvore de progressão:** Maestria Sanguínea (Vontade de Ferro → Mesmerizador → Predador Apex)
- **1 item:** Frasco de sangue (reduz a sede em 15)

## Mecânicas Únicas

| Verbo | Descrição |
|------|-------------|
| `enthrall` | Dominação social sobrenatural usando presença |
| `feed` | Drenar sangue para reduzir a sede, mas à custa da humanidade |

## Estatísticas e Recursos

| Estatística | Função |
|------|------|
| presença | Dominação social, autoridade sobrenatural |
| vitalidade | Habilidade física, eficiência na alimentação |
| astúcia | Engano, percepção, intrigas da corte |

| Recurso | Alcance | Observações |
|----------|-------|-------|
| HP | 0–30 | Saúde padrão |
| Sede | 0–100 | Pressão inversa — aumenta a cada instante, perda de controle em 100 |
| Humanidade | 0–30 | Âncora moral — abaixo de 10, bloqueia opções de diálogo |

## Licença

MIT
