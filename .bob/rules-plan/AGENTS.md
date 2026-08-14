# AGENTS.md — Modo Plan (Planejamento)

This file provides guidance to agents when working with code in this repository.

## Restrições arquiteturais que guiam o planejamento

### Performance — tela de detalhes é o caminho crítico

- **25:1 leitura/escrita** — a tela de detalhes do livro é chamada ~25× mais que o fluxo de reserva
- Alvo de **300 ms** exige que disponibilidade e avaliações recentes estejam acessíveis **sem joins em cascata**
- Planejar a estrutura de leitura da tela de detalhes antes do schema — essa decisão determina a modelagem

### Disponibilidade é estado compartilhado — planejar consistência

- Disponibilidade muda em 4 eventos: reserva criada, reserva expirada, empréstimo efetivado, devolução
- Leitor e bibliotecário devem ver o **mesmo valor** (fonte única de verdade)
- Expiração de 12h gera escrita de fundo — planejar mecanismo antes da implementação

### Decisões bloqueantes antes do E2 (contratos)

1. **Modelagem de cópias físicas** — entidade própria ou contador no livro (afeta RN-3, RN-4 e RNF-1)
2. **Identificadores únicos** de Autor, Reservado, Emprestado, Avaliação
3. **Mecanismo de expiração** — job de background (cron) ou verificação lazy na leitura
4. **Stack** — definir antes de qualquer scaffold

### Próximos passos pelo guia (ordem obrigatória)

Seguir a ordem de `docs/guias/guia-app-web-do-zero-com-agentes.md` Parte VI:

1. **E0** — ADRs das 6 decisões estruturantes + diagrama C4
2. **E1** (em paralelo com P2) — scaffold, linter, CI, `docker-compose.yml`, `.env.example`
3. **E2** — schema do banco + migrations + contrato de API (OpenAPI) + tipos gerados
4. **E3** — walking skeleton: uma feature ponta a ponta já em produção

Não iniciar E3 sem design system definido (P2).
