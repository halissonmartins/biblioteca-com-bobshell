# ADR-0006 — Estratégia de testes

| Campo | Valor |
|---|---|
| Status | **Aceito** |
| Data | 14/08/2026 |
| Atualizado | 13/09/2026 — teste de mutação com StrykerJS (issue #37) · 12/09/2026 — camada unitária do `packages/web` e exceção do teste de componente (issue #27) |

## Contexto

Com agentes de codificação, testes são o contrato que impede o agente de quebrar o que já existe. A estratégia deve ser simples o suficiente para ser seguida consistentemente e rigorosa o suficiente para capturar regressões.

## Decisão

### Pirâmide de testes

| Camada | O que testa | Framework | Localização |
|---|---|---|---|
| **Unitário** | Regras de negócio em `domain/` | **Vitest** | Ao lado do arquivo: `*.test.ts` |
| **Integração** | Rotas HTTP com banco real | **Vitest + supertest** | `src/api/**/*.test.ts` |
| **Unitário (SPA)** | Camada lógica do `packages/web`: `utils/` e clientes HTTP de `api/` | **Vitest + jsdom** | Ao lado do arquivo: `src/utils/*.test.ts`, `src/api/*.test.ts` |
| **E2E** | Fluxos críticos ponta a ponta (UI) e contrato HTTP | **Playwright** | `e2e/` (dirige o navegador) e `e2e-api-rest/` (request-only, sem navegador) na raiz do monorepo |

### Regras

- Testes unitários: **sem banco**, sem HTTP — injeção de dependência obrigatória em `domain/`
- Testes de integração: banco de teste dedicado (`DATABASE_URL_TEST`), limpo antes de cada teste
- Testes E2E: apenas os 3 fluxos críticos (reserva, empréstimo, devolução) — não cobrir tudo com E2E
- **Teste de autorização** é item obrigatório para toda rota nova
- **Teste de componente é exceção, não camada.** `pages/` e `components/` se
  provam na suíte E2E, que dirige a interface real. A exceção vale quando o
  cenário **não é alcançável** em `e2e/` — a `e2e/AGENTS.md` proíbe mock, stub e
  interceptação de rede naquela suíte, então toda falha de infraestrutura
  externa (serviço de identidade fora do ar, por exemplo) fica fora do alcance
  dela. Nesses casos o teste mora em `packages/web/src/**/*.test.tsx`, dubla
  **só** a fronteira externa, e o cabeçalho do arquivo registra por que não foi
  para `e2e/`. Precedente: `pages/LoginPage.test.tsx` (issue #27)
- Teste de componente **não entra no alvo de cobertura** do `packages/web`
  (`vitest.config.ts` inclui só `utils/` e `api/`): ele existe para travar um
  comportamento específico, não para engordar a cobertura

### Teste de mutação

Cobertura diz quais linhas os testes **executam**; mutação diz se eles
**perceberiam** uma linha errada. O StrykerJS (`@stryker-mutator/vitest-runner`)
altera o código de produção — troca `>=` por `>`, apaga uma chamada, inverte um
`if` — e roda a suíte Vitest contra cada mutante. Mutante que sobrevive é regra
sem teste que a defenda (issue #37).

| Pacote | Alvo (`mutate`) | Config |
|---|---|---|
| `packages/api` | `src/domain/**` e `src/api/**` (sem `*Types.ts` e testes) | `packages/api/stryker.config.mjs` |
| `packages/web` | `src/utils/**` e `src/api/**` | `packages/web/stryker.config.mjs` |

O alvo espelha o da cobertura: `infra/repositories/**`, `infra/telemetry/**`,
`pages/` e `components/` ficam fora pelo mesmo motivo — se provam nas suítes
E2E, onde o custo por mutante seria de minutos.

- **Onde roda**: `make mutation` local e o workflow `.github/workflows/mutation.yml`
  (semanal, sob demanda e em push na `main` que toque o alvo), com relatório HTML
  como artefato. **Não** faz parte do `ci-gate`: é lenta perto do `vitest run`.
- **Modo incremental**: `reports/stryker-incremental.json` reaproveita mutantes
  cujo código e testes não mudaram; no CI, o arquivo vive no cache do Actions.
  `npx stryker run --force` refaz tudo.
- **`thresholds.break`** fixado a partir da linha de base medida. Sobe aos
  poucos; nunca desce para a execução passar.
- **Sobrevivente se trata, não se silencia.** Primeiro, escrever o teste que
  faltava, citando a RN. Só se o mutante for **equivalente** (não muda
  comportamento observável), marcar com
  `// Stryker disable next-line <mutador>: <motivo>` — sem motivo não passa na
  revisão. Desligar mutador inteiro na config exige justificativa no arquivo.

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
