# Lorenzo · Office

Terminal do Lorenzo, com rosto. Roda em `http://localhost:4141`.

## Abrir

Duplo-clique em **`Lorenzo Office.command`**.
Ou: `npm run start` (produção) / `npm run dev` (desenvolvimento).

## Como funciona

Cada **mesa** é uma sessão real do Claude Code rodando via `@anthropic-ai/claude-agent-sdk`
— o mesmo motor do terminal. Por isso herda, sem configuração extra: o login da conta,
as skills de `~/.claude/skills`, os subagents, os plugins, os servidores MCP, os
`CLAUDE.md` e as regras de permissão.

## Anexos

Cole (`⌘V`), arraste pra janela, ou use o `+`. Vale em qualquer lugar da tela.

| Tipo | Como chega no agent |
|---|---|
| Imagem até 3,5 MB (png, jpg, gif, webp) | inline — ele vê a imagem |
| Imagem maior, svg, heic | por caminho — ele abre com `Read` |
| PDF até 20 MB | inline — ele lê o conteúdo |
| Vídeo (mp4, mov, webm…) | por caminho — `ffprobe`/`ffmpeg` |
| Áudio (mp3, wav, m4a…) | por caminho — `ffprobe`/`ffmpeg` |
| Texto, código, CSV, JSON | por caminho — ele abre com `Read` |

O modelo não enxerga vídeo nem ouve áudio diretamente; trabalha neles por ferramenta,
igual no terminal. No chat, vídeo e áudio ganham player.

Limite de 2 GB por arquivo. O upload vai direto pro disco em streaming, então um vídeo
grande não passa pela memória. Arquivos ficam em `~/.lorenzo-office/uploads/<mesa>/`.

## Monitor de uso

Botão na barra lateral. Mostra horas trabalhadas, uso de hoje, uso dos 7 dias,
gasto de tokens e modelo mais usado, com gráfico diário e quebra por modelo e por mesa.

Tokens contam **também o cache** (leitura e criação) — é onde fica a maior parte do
volume real. O custo em dólar só aparece se houver uma API key em uso; na assinatura
não há cobrança por turno, então ele é omitido.

Os dados vêm de `~/.lorenzo-office/usage.jsonl`, uma linha por turno.

## Permissões

Por mesa, no topo: perguntar · aceitar edições · autonomia total · só planejar.
Quando o agent pede permissão, o card aparece no chat com *Permitir*,
*Sempre nesta mesa* e *Negar*, e ele fica parado até você responder.

## Atalhos

- `⌘K` — nova mesa
- `Enter` envia · `Shift+Enter` quebra linha
- `Esc` — interrompe a mesa que está trabalhando

## Estado

Fica em `~/.lorenzo-office/`: `desks.json`, `logs/*.jsonl`, `uploads/`, `usage.jsonl`.
As sessões retomam pelo `sessionId` do Claude Code, então fechar e reabrir não perde contexto.

## Estrutura

```
lib/office.ts      mesas: fila de entrada, permissões, eventos, blocos de mídia
lib/media.ts       decide o que vai inline e o que vai por caminho
lib/usage.ts       registro e agregação do uso
lib/timeline.ts    dobra o log de eventos em blocos renderizáveis
app/api/…          REST + SSE por mesa, upload em streaming, arquivo com Range
components/…       casca, conversa, ferramentas, anexos, monitor, markdown
```

## Serviços (inicialização automática)

Três agentes do launchd sobem sozinhos no login e reiniciam se caírem:

| Agente | Porta | O quê |
|---|---|---|
| `com.lorenzo.office` | 4141 | o Office (este projeto) |
| `com.lorenzo.viz-backend` | 8000 | API do escritório pixel, recebe os hooks |
| `com.lorenzo.viz-frontend` | 3000 | build estático do escritório pixel |

Plists em `~/Library/LaunchAgents/com.lorenzo.*.plist`, logs em
`~/Library/Logs/lorenzo-office/`.

```bash
launchctl list | grep lorenzo                        # estado
launchctl kickstart -k gui/$(id -u)/com.lorenzo.office   # reiniciar um
launchctl bootout  gui/$(id -u)/com.lorenzo.office       # desligar um
```

A chave da API do visualizador é fixa em `~/.claude/claude-office-config.env`
e espelhada em `claude-office/backend/.env`, então não muda a cada reinício.

## Layout

Duas colunas, ambas sempre visíveis:

- **Esquerda** — o escritório pixel (sempre à vista, mostra os agents trabalhando),
  a lista de mesas com o estado de cada uma, e o monitor de uso no rodapé.
  A largura é arrastável pela borda e fica guardada no navegador.
- **Direita** — o chat da mesa selecionada, com anexos de mídia.

## Widget de uso

No rodapé da coluna esquerda, com duas janelas rolantes:

- **5 horas** — mesma janela do limite de sessão do Claude Code
- **Semana** — janela de 7 dias

Cada uma mostra a porcentagem da janela que você passou **efetivamente trabalhando**,
uma barra, o horário do reset e quanto falta. Clicar abre o monitor completo.

O percentual não é a cota da Anthropic: esse número não fica salvo em lugar nenhum
na máquina, o Claude Code busca da API em tempo real. O que está aqui é medido dos
turnos reais das suas mesas.
