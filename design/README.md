# design/

Pacote de entrega para redesenhar a interface do Lorenzo Office.

| Arquivo | Para quê |
|---|---|
| [`index.html`](index.html) | **Comece aqui.** A interface inteira num arquivo estático — abra com duplo clique |
| [`BRIEF.md`](BRIEF.md) | O produto, as superfícies, os estados, o que não pode mudar, os problemas do desenho atual |
| [`CONTRATOS.md`](CONTRATOS.md) | Os dados disponíveis para mostrar, e as rotas que os servem |

## O `index.html`

O projeto é Next.js: não existe um `index.html` de verdade, a interface é montada por
React em tempo de execução. Este arquivo é um **retrato estático** dela, com o CSS
embutido, dados realistas e zero dependência externa — nada de servidor, Node ou chave
de API. Abra no navegador e você vê exatamente o que o usuário vê.

Tem uma barra no canto superior direito (marcada "mockup estático") para alternar entre
as quatro telas: principal, controle de versão, monitor de uso e nova mesa. Essa barra
não existe no produto.

**Pode redesenhar direto nele.** Um `index.html` redesenhado é um entregável perfeito:
dele se extrai o CSS novo e a estrutura, e a migração para os componentes React é
mecânica. Só não vale mudar os nomes de classe sem avisar — eles são a ponte entre o
mockup e o código real.

## Ordem de leitura

1. Abrir `index.html` e passear pelas quatro telas
2. `BRIEF.md` inteiro — principalmente **O que NÃO pode mudar** e **Problemas conhecidos**
3. `CONTRATOS.md` — antes de desenhar qualquer componente, para saber que campos existem
4. `app/globals.css` — o sistema visual atual, 560 linhas, todo em variáveis CSS

## Escopo

Redesenhar **a camada visual**: `components/*.tsx` e `app/globals.css`.

Fora de escopo: `lib/` (motor, contratos, git, uso) e `app/api/` (rotas). Se um desenho
precisar de um dado que não existe hoje, marque no entregável em vez de mudar o backend —
o dado pode ser barato ou caro de produzir, e isso se decide junto.

## Restrição principal

Este programa é o terminal de trabalho de uma pessoa, usado o dia inteiro. Densidade e
velocidade de leitura valem mais que respiro. Bonito aqui significa **legível sob carga**:
seis mesas abertas, uma delegando para quatro subagents, trezentos eventos na conversa.
