# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dois papéis, exatamente um por Usuário (`leitor` | `bibliotecario`):

- **Leitor** — usuário final do acervo. Visita o site semanalmente, pega até 3 Livros por mês, navega ~25 Livros antes de reservar. Está em casa ou no trabalho, decidindo se vale a pena se deslocar até a biblioteca. Job: descobrir um Livro e garantir que ele estará separado ao chegar.
- **Bibliotecário** — funcionário no balcão, com o Leitor presente do outro lado. Trabalha em **desktop widescreen com teclado e mouse, sessão aberta o dia inteiro**. Job: efetivar Empréstimo e Devolução em segundos e localizar rapidamente Reservas por Leitor.

Escala de referência: 10.000 Leitores ativos, 250.000 Livros no acervo.

## Product Purpose

Sistema web híbrido de catálogo, Reservas e Empréstimos. A Reserva acontece on-line; a retirada é **sempre presencial**. O produto é o elo entre esses dois momentos: garante que a Cópia reservada esteja separada quando o Leitor chegar, e que ela volte ao acervo se ele não aparecer em 12 horas.

Sucesso do produto: > 70% de conversão Reserva → Empréstimo, < 20% de Reservas expiradas sem retirada, < 3 s por operação de balcão, > 50% dos Leitores ativos usando Reserva on-line em 6 meses.

Sucesso **deste build**: é um **entregável de hackathon**, avaliado por juízes em pouco tempo de tela. O fluxo híbrido (Leitor reserva on-line → Bibliotecário efetiva no balcão) precisa ficar legível de imediato para quem nunca viu o sistema.

## Positioning

A disponibilidade tem **fonte única de verdade**: o que o Leitor vê no site é o mesmo estado que o Bibliotecário vê no balcão, no nível da Cópia física — não um contador aproximado no Livro. É isso que torna a promessa "seu livro estará separado" verificável, e o que um catálogo de biblioteca comum não consegue afirmar com honestidade.

## Operating Context

- **Fluxo do Leitor:** Catálogo → detalhe do Livro (disponibilidade + Avaliações) → Reserva → "Minhas Reservas" com prazo de expiração → retirada presencial.
- **Fluxo do Bibliotecário:** painel de Reservas (filtrável por Leitor) → efetivar Empréstimo com o Leitor no balcão → painel de Empréstimos → registrar Devolução.
- **Padrão de carga: ~25:1 de leitura sobre escrita.** ~750 mil visualizações de detalhe por mês contra ~30 mil Reservas. A tela de detalhes do Livro é o caminho crítico.
- **Volume absoluto baixo** (poucas requisições por segundo): o desafio é latência, não throughput.
- Avaliações são poucas: ~6 mil escritas por mês, no máximo 5 exibidas por Livro.
- Expiração de 12 h gera trabalho de fundo contínuo de liberação de Cópias.

## Capabilities and Constraints

**Leitor:** navegar o Catálogo (paginado, com busca por título ou autor), ver detalhes do Livro (título, autor, sinopse, gênero, capa, Disponibilidade, 5 Avaliações mais recentes), criar Reserva, ver Reservas ativas, ver Empréstimos com vencimento, ver página do Autor com todos os seus Livros.

**Bibliotecário:** ver Reservas ativas de um Livro com data de expiração, listar Empréstimos ativos com vencimento, filtrar Reservas e Empréstimos por Leitor, efetivar Empréstimo, registrar Devolução.

**Regras de negócio invioláveis:**

- Reserva expira automaticamente em **12 horas** (RN-1) e libera a Cópia (RN-5).
- Reserva é on-line; Empréstimo só é efetivado **presencialmente por Bibliotecário** (RN-2, RN-7).
- Reserva exige ao menos uma Cópia com status disponível no momento (RN-3).
- Cópia reservada fica bloqueada para outros Leitores (RN-4).
- Só Reserva ativa converte em Empréstimo (RN-6).
- Ciclo de vida da Cópia: `disponível → reservada → emprestada → disponível`, toda transição explícita.

**Alvos de performance (parte do produto, não detalhe técnico):** detalhe do Livro < 300 ms; Reserva < 3 s; Empréstimo/Devolução < 3 s; listas do Leitor < 500 ms.

**Fora de escopo na v1:** livros digitais, multas/pagamento, renovação automática de Empréstimo, recomendação algorítmica, app móvel nativo.

**Terminologia obrigatória** (`docs/produto/glossario.md` é a autoridade): Livro, Cópia, Acervo, Autor, Leitor, Bibliotecário, Usuário, Disponibilidade, Reserva, Reserva ativa, Reserva expirada, Empréstimo, Devolução, Avaliação, Catálogo. Proibidos: "exemplar", "aluguel", "reservação", "membro", "cliente", "retorno", "livro disponível".

**Idioma:** interface e conteúdo em **português do Brasil**, locale único — inferido de toda a copy e documentação existentes; nenhuma exigência de i18n foi estabelecida.

**Em aberto:** limite de Reservas ativas por Leitor (levantado como risco no PRD, não decidido).

## Brand Commitments

Nenhum. Não existe instituição real por trás deste build, e o nome "Biblioteca" é um **placeholder** — trabalho visual futuro pode substituí-lo livremente.

O sistema visual atual (sinalização cívica esmaltada, documentado em [`DESIGN.md`](../../DESIGN.md)) é uma decisão de design tomada e implementada, não um compromisso de marca: nada obriga um redesign futuro a preservá-lo.

Autoridade de linguagem: os termos do glossário são vinculantes na UI, na copy e no código, mesmo quando a identidade visual mudar.

## Evidence on Hand

- **Produto real e funcional**, não maquete: API Express + Prisma/PostgreSQL e SPA React com 8 páginas implementadas (`packages/web/src/pages/`), suíte Vitest e E2E Playwright que dirigem a UI real.
- Capturas de tela geradas da UI real via Playwright: `assets/images/` (catálogo, detalhe de Livro e Autor, login, reservas e empréstimos do Leitor e do Bibliotecário, confirmação de Reserva).
- Documentação de produto: PRD (`docs/prd-sistema-biblioteca.md`), glossário, user stories com critérios Gherkin, ADRs (`docs/decisoes/`), fluxos (`docs/design/fluxos.md`).
- Suíte de carga K6 em `perf/` e seed de performance com 250k Livros.
- **Não existe:** biblioteca cliente real, usuários reais, depoimentos, métricas de uso em produção, benchmarks de campo. As métricas de sucesso do PRD são alvos, não resultados medidos — nunca apresentá-las como observadas.

## Product Principles

1. **Disponibilidade é uma só.** Leitor e Bibliotecário leem o mesmo estado da Cópia. Nenhuma tela pode exibir um número que o balcão desminta.
2. **O prazo de 12 horas é informação de primeira classe.** Reserva sem hora de expiração visível é uma promessa sem contrato — a expiração aparece onde a Reserva aparece.
3. **A tela de detalhes do Livro é o caminho crítico.** É 25× mais acessada que qualquer escrita e tem orçamento de 300 ms; nenhuma decisão de produto pode custar esse orçamento.
4. **O balcão é medido em segundos.** Toda operação do Bibliotecário compete com o Leitor esperando de pé na frente dele.
5. **O glossário manda.** Um termo fora do glossário na UI é um defeito de produto, não de estilo.

## Accessibility & Inclusion

Sem padrão formal exigido e sem auditoria de conformidade. Prática interna vinculante, já implementada nos componentes canônicos e a não regredir: contraste AA garantido pelos tokens, foco visível em todo elemento interativo, todo campo com label associado, `role="alert"` / `aria-live` em erros e alertas, navegação por teclado em Modal, `aria-busy` durante carregamento.

Nenhum usuário de leitor de tela foi confirmado; não há requisito de teste com tecnologia assistiva.
