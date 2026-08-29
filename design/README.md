# design/

Pacote de entrega para redesenhar a interface do Lorenzo Office.

| Arquivo | Para quê |
|---|---|
| [`BRIEF.md`](BRIEF.md) | O produto, as superfícies, os estados, o que não pode mudar, os problemas do desenho atual |
| [`CONTRATOS.md`](CONTRATOS.md) | Os dados disponíveis para mostrar, e as rotas que os servem |

## Ordem de leitura

1. `BRIEF.md` inteiro — principalmente **O que NÃO pode mudar** e **Problemas conhecidos**
2. `CONTRATOS.md` — antes de desenhar qualquer componente, para saber que campos existem
3. `app/globals.css` — o sistema visual atual, 560 linhas, todo em variáveis CSS
4. Rodar `npm run dev` e usar de verdade por alguns minutos

## Escopo

Redesenhar **a camada visual**: `components/*.tsx` e `app/globals.css`.

Fora de escopo: `lib/` (motor, contratos, git, uso) e `app/api/` (rotas). Se um desenho
precisar de um dado que não existe hoje, marque no entregável em vez de mudar o backend —
o dado pode ser barato ou caro de produzir, e isso se decide junto.

## Restrição principal

Este programa é o terminal de trabalho de uma pessoa, usado o dia inteiro. Densidade e
velocidade de leitura valem mais que respiro. Bonito aqui significa **legível sob carga**:
seis mesas abertas, uma delegando para quatro subagents, trezentos eventos na conversa.
