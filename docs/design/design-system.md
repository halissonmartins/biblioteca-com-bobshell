# Design System — movido

> **Este documento foi substituído por [`DESIGN.md`](../../DESIGN.md), na raiz do repositório.**

O sistema visual do projeto foi trocado por inteiro: saiu a paleta azul padrão
do Tailwind com Inter, cantos arredondados, sombras suaves e badges em pílula;
entrou a sinalização cívica esmaltada descrita no `DESIGN.md`. Tudo que este
arquivo dizia sobre **cor, tipografia, raio, sombra e receita de componente**
descrevia o mundo anterior e estava errado a partir do commit `950d9bf`.

Para não deixar um documento que orienta errado em pé, o conteúdo foi removido
em vez de reescrito — duas descrições do mesmo sistema divergem na primeira
mudança, e o `DESIGN.md` é gerado a partir do que foi construído.

## Onde cada coisa está agora

| O que você procura | Onde está |
|---|---|
| Tokens de cor, tipografia, raio, sombra, espaçamento | [`DESIGN.md`](../../DESIGN.md) e [`packages/web/tailwind.config.js`](../../packages/web/tailwind.config.js) |
| Receitas de componente (`.btn`, `.input`, `.card`, `.badge`, `.table`, `.alert`, trilho de zona) | [`packages/web/src/index.css`](../../packages/web/src/index.css) |
| Componentes canônicos e quando usar cada um | [`DESIGN.md`](../../DESIGN.md), seção Component Specifications |
| Mapeamento de status → chip (Cópia, Reserva, Disponibilidade) | [`DESIGN.md`](../../DESIGN.md), seção Chips |
| Piso de acessibilidade e regras invioláveis | [`DESIGN.md`](../../DESIGN.md), seção Do / Don't |
| Contrato de direção do mundo (seed `60bdb166`) | comentário HTML no `<body>` de [`packages/web/index.html`](../../packages/web/index.html) |
| Termos obrigatórios na interface | [`glossário`](../produto/glossario.md) |
