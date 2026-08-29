# Lorenzo Office — brief de redesign

Este diretório é o pacote de entrega para redesenhar a interface. O código continua
onde está; aqui ficam o contexto, o inventário e as regras que o redesign precisa
respeitar para continuar funcionando.

---

## O que é o produto

Um substituto do terminal do Claude Code, rodando em `localhost:4141`. O usuário é o
Lorenzo, dono de uma agência de tráfego pago, e este é o programa onde ele passa o dia:
ele parou de usar o Terminal do macOS por causa dele.

Cada **mesa** é uma sessão real do Claude Code. Várias rodam em paralelo, cada uma com
sua pasta de trabalho, modelo, especialidade e histórico próprio. O usuário conversa com
um agent por vez, mas vê o estado de todos.

O tom certo é **ferramenta de trabalho de programador**: densa, técnica, escura, rápida
de ler. Não é um app de consumo. Referências que o usuário citou: Obsidian (o grafo),
e interfaces "de programador" em geral.

---

## Superfícies a redesenhar

### 1. Coluna esquerda (largura arrastável, padrão 860px)

| Bloco | O que mostra |
|---|---|
| Cabeçalho | "Lorenzo · Office" e a contagem de mesas / rodando / esperando |
| **Grafo mental** | Canvas com simulação de força: a mesa no centro, subagents, ferramentas e arquivos como nós conectados |
| Chips das mesas | Faixa horizontal rolável, uma pílula por mesa com ponto de status |
| **Monitor de uso** | Dois cartões (janela de 5 horas e de 7 dias) com percentual, barra segmentada, horário do reset e contagem regressiva |

### 2. Coluna direita — a conversa

| Bloco | O que mostra |
|---|---|
| Barra superior | Ponto de status, nome da mesa, pasta, pílula do git, seletor de modelo, modo de permissão, botão Parar, Fechar |
| Linha do tempo | Mensagens do usuário, respostas em markdown, blocos de raciocínio, cartões de ferramenta expansíveis, pedidos de permissão, rodapé de cada turno |
| Compositor | Campo de texto que cresce, bandeja de anexos, botão de anexar, dica de estado, botão Enviar |

### 3. Modais

- **Nova mesa** — nome, especialidade, navegador de pastas, modelo, modo de permissão
- **Monitor de uso** (completo) — métricas grandes, gráfico de 7 dias, tabelas por modelo e por mesa
- **Controle de versão** — abas Mudanças/Histórico, listas preparado/alterado, diff colorido, commit, pull, push, sync

---

## Estados que precisam de desenho

Cada um destes já existe e é visível no uso normal:

**Mesa:** `idle` · `thinking` (ponto pulsando) · `waiting_permission` (amarelo, pulsando
rápido) · `error` (vermelho) · `closed`

**Conversa:** vazia (escritório sem mesas) · carregando histórico · streaming de texto ·
streaming de raciocínio · ferramenta rodando · ferramenta com erro · pedido de permissão
aberto · permissão resolvida · contexto compactado · erro de processo

**Anexos:** enviando (com contador) · imagem · vídeo com player · áudio com player ·
PDF · arquivo genérico · erro de upload · arrastando sobre a janela

**Git:** fora de repositório · árvore limpa · com alterações · sem upstream · à frente /
atrás do remoto · conflito · erro de comando

**Uso:** sem dados · janela vazia · percentual baixo/médio/alto (verde/amarelo/vermelho)

---

## O que NÃO pode mudar

Isto não é preferência estética, é o que mantém o programa funcionando:

1. **Atalhos precisam de captura na janela.** Uma extensão no navegador do usuário
   interrompe a propagação de `keydown` antes de chegar no elemento. Handlers do React
   e listeners no próprio elemento **não recebem a tecla**. Use
   `window.addEventListener("keydown", fn, { capture: true })` filtrando por `e.target`.

2. **Enter envia, Shift+Enter quebra linha**, com guarda de composição para acentos
   (teclado ABNT usa dead keys).

3. **Colar e arrastar arquivos funciona em qualquer lugar da janela**, não só no campo.

4. **A linha do tempo segue o streaming**, mas para de seguir assim que o usuário rola
   para cima.

5. **Pedidos de permissão bloqueiam o agent** até a resposta. As três ações são
   Permitir / Sempre nesta mesa / Negar.

6. **Custo em dólar só aparece quando há API key real.** Na assinatura não há cobrança
   por turno; mostrar valor seria mentir sobre o plano.

---

## Sistema visual atual

Definido em `app/globals.css` como variáveis CSS. Serve de ponto de partida, não de
restrição — o redesign pode trocar tudo, desde que mantenha contraste em tela escura.

```
--bg        #0a0c0f    fundo
--panel     #101419    painéis
--panel-2   #151a21    elementos sobre painel
--border    #1d242d    bordas
--text      #dce3ea    texto principal
--text-dim  #8b96a5    texto secundário
--text-faint #5d6773   texto terciário
--accent    #e8935c    laranja (marca, ações, mesa ativa)
--green     #6bbf7b    sucesso, adições, arquivos
--red       #e5715f    erro, remoções
--blue      #6ba8e5    ferramentas, links
--purple    #a78bda    subagents
--yellow    #d7bb63    aguardando permissão
```

Tipografia: sistema (`-apple-system`) para texto, monoespaçada para tudo que é técnico
(caminhos, comandos, métricas, diffs). Base 13,5px — a densidade é intencional.

**Cores do grafo:** mesa laranja, agent roxo, ferramenta azul, arquivo verde.

---

## Inventário

| Arquivo | Linhas | Papel |
|---|---|---|
| `components/Office.tsx` | 419 | Casca: estado das mesas, SSE, anexos, atalhos |
| `components/Brain.tsx` | 357 | Grafo de força em canvas |
| `components/GitPanel.tsx` | 338 | Controle de versão |
| `components/UsageMonitor.tsx` | 191 | Monitor de uso completo |
| `components/Markdown.tsx` | 191 | Renderizador de markdown sem dependências |
| `components/NewDeskDialog.tsx` | 149 | Criação de mesa |
| `components/ToolCard.tsx` | 139 | Cartão de chamada de ferramenta |
| `components/Timeline.tsx` | 132 | Fluxo da conversa |
| `components/Attachments.tsx` | 123 | Bandeja e players de mídia |
| `components/LeftPanel.tsx` | 111 | Coluna esquerda |
| `components/UsageWidget.tsx` | 106 | Cartões de uso compactos |
| `components/GitPill.tsx` | 44 | Pílula de branch na barra |
| `app/globals.css` | 560 | Todo o estilo |

Contratos de dados em `lib/types.ts` (mesas e eventos), `lib/timeline.ts` (blocos
renderizáveis), `lib/git.ts` e `lib/usage.ts`. **Leia estes antes de desenhar**: eles
dizem exatamente quais campos existem para mostrar.

---

## Problemas conhecidos do desenho atual

Ditos pelo usuário ou observados, para o redesign atacar de propósito:

- A hierarquia entre grafo, chips e monitor na coluna esquerda é frouxa — os três
  competem por atenção sem uma ordem clara.
- O monitor de uso tem visual de painel administrativo, não de ferramenta.
- O cartão de ferramenta expande num bloco de texto cru; falta desenho para diff,
  saída longa e erro.
- Não há estado vazio desenhado para a conversa de uma mesa nova.
- Modais são todos a mesma caixa; o de git precisa de mais largura e ritmo próprio.
- Só existe tema escuro. Claro não foi pedido, mas nada impede.
- Não há responsividade abaixo de ~1100px de largura.

---

## Como rodar para ver

```bash
cd ~/lorenzo-office
npm install
npm run dev      # localhost:4141
```

O serviço de produção já sobe no login via `~/Library/LaunchAgents/com.lorenzo.office.plist`.
Para ver a interface com dados de verdade, crie uma mesa e peça a ela para delegar:
*"lance 3 agents Explore em paralelo para mapear este projeto"* — isso preenche o grafo
com subagents, ferramentas e arquivos de uma vez.
