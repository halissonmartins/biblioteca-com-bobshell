# ADR-0006 — Estratégia de testes

| Campo | Valor |
|---|---|
| Status | **Aceito** |
| Data | 14/08/2026 |

## Contexto

Com agentes de codificação, testes são o contrato que impede o agente de quebrar o que já existe. A estratégia deve ser simples o suficiente para ser seguida consistentemente e rigorosa o suficiente para capturar regressões.

## Decisão

### Pirâmide de testes

| Camada | O que testa | Framework | Localização |
|---|---|---|---|
| **Unitário** | Regras de negócio em `domain/` | **Vitest** | Ao lado do arquivo: `*.test.ts` |
| **Integração** | Rotas HTTP com banco real | **Vitest + supertest** | `src/api/**/*.test.ts` |
| **E2E** | Fluxos críticos ponta a ponta | **Playwright** | `e2e/` na raiz do monorepo |

### Regras

- Testes unitários: **sem banco**, sem HTTP — injeção de dependência obrigatória em `domain/`
- Testes de integração: banco de teste dedicado (`DATABASE_URL_TEST`), limpo antes de cada teste
- Testes E2E: apenas os 3 fluxos críticos (reserva, empréstimo, devolução) — não cobrir tudo com E2E
- **Teste de autorização** é item obrigatório para toda rota nova

### Rodar um único teste

```bash
# Unitário / integração (Vitest)
npx vitest run src/domain/reservation.test.ts

# E2E (Playwright)
npx playwright test e2e/reservation.spec.ts
```

### Definition of done para toda feature

- [ ] Critério de aceite da user story coberto por teste
- [ ] Teste de autorização (papel errado → 403)
- [ ] CI verde (lint + typecheck + testes + build)
- [ ] Nenhum `any` explícito introduzido

## Consequências

- O agente deve escrever o teste **antes** da implementação (TDD) — teste escrito depois tende a ser ajustado para passar, não para verificar o requisito
- Cobertura de linha não é métrica — cobertura de critérios de aceite é
- Nunca desabilitar ou pular teste para fazer CI passar
