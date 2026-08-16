# AGENTS.md — Índice da documentação (`docs/`)

Mapa dos documentos deste diretório. Leia o material relevante **antes** de
implementar features ou criar arquivos novos. Termos de domínio seguem o
[glossário](produto/glossario.md) — use-os exatamente no código.

## Produto

- [PRD — Sistema de Biblioteca](prd-sistema-biblioteca.md) — visão, escopo,
  regras de negócio (RN-*) e requisitos funcionais (RF-*). **Leia antes de
  implementar qualquer feature.**
- [PRODUCT.md](produto/PRODUCT.md) — usuários, propósito, posicionamento,
  capacidades, restrições e princípios do produto. **Leia antes de gerar
  qualquer UI ou copy.**
- [Glossário do Domínio](produto/glossario.md) — termos canônicos
  (`Livro`, `Cópia`, `Leitor`, `Bibliotecário`, `Reserva`, `Empréstimo`,
  `Devolução`, `Disponibilidade`, `Avaliação`). Use **exatamente** no código.
- [User Stories](produto/user-stories.md) — histórias do Leitor (US/RF-L*) e
  do Bibliotecário (RF-B*), com critérios de aceite.

## Arquitetura

- [Arquitetura C4 — Contexto](arquitetura/c4-contexto.md) — diagrama de
  contexto e limites do sistema.

## Decisões de Arquitetura (ADRs)

- [ADR-0001 — Linguagem e framework](decisoes/0001-linguagem-e-framework.md)
- [ADR-0002 — Banco de dados e estratégia de migrations](decisoes/0002-banco-de-dados-e-migrations.md)
- [ADR-0003 — Autenticação e autorização](decisoes/0003-autenticacao-e-autorizacao.md)
- [ADR-0004 — Estratégia de deploy e ambientes](decisoes/0004-deploy-e-ambientes.md)
- [ADR-0005 — Arquitetura: monolito modular](decisoes/0005-monolito-modular.md)
- [ADR-0006 — Estratégia de testes](decisoes/0006-estrategia-de-testes.md)
- [ADR-0007 — Observabilidade: OpenTelemetry e stack local](decisoes/0007-observabilidade.md)

## Design

- [Design System](../DESIGN.md) — tokens, componentes, mapeamento de status e
  regras do mundo visual. **Leia antes de gerar qualquer UI.**
  ([design/design-system.md](design/design-system.md) descreve o mundo anterior
  e hoje só redireciona para cá.)
- [Fluxos do Usuário](design/fluxos.md) — jornadas de Leitor e Bibliotecário.

## API

- [openapi.yaml](openapi.yaml) — especificação OpenAPI dos endpoints da API
  (contrato de request/response).

## Operação

- [Observabilidade](observabilidade.md) — logs, métricas e traces do backend via
  OpenTelemetry; métricas customizadas e dashboards. **Leia antes de adicionar
  métrica, span ou log novo.**

## Guias

- [Aplicação Web do Zero com Agentes de Codificação](guias/guia-app-web-do-zero-com-agentes.md)
  — guia de construção do projeto com agentes.
