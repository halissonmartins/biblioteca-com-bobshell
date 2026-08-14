# ADR-0005 — Arquitetura: monolito modular

| Campo | Valor |
|---|---|
| Status | **Aceito** |
| Data | 14/08/2026 |

## Contexto

Primeiro release, time pequeno, domínio bem delimitado. A separação de serviços só se justifica quando o custo de acoplamento superar o custo de coordenação entre serviços — o que não é o caso aqui.

## Decisão

**Monolito modular**: um único processo de backend organizado em camadas com fronteiras explícitas.

```
packages/
  api/           ← processo único Node.js
    src/
      domain/    ← regras de negócio puras (sem HTTP, sem banco)
      api/       ← rotas HTTP e validação de entrada
      infra/     ← acesso a banco (Prisma), jobs de background
      shared/    ← utilitários transversais (erros, tipos internos)
  web/           ← SPA React
  shared/        ← tipos TypeScript compartilhados entre api e web
```

## Invariantes arquiteturais (não violar — agente deve checar antes de criar arquivo)

- `domain/` **não importa** nada de `infra/` nem de `api/`
- `api/` **não acessa banco** diretamente — apenas chama serviços de `domain/`
- `infra/` **não contém** regra de negócio — apenas leitura/escrita de dados
- Todo acesso ao banco passa por `infra/repositories/`
- Nenhum `import` circula entre camadas no sentido contrário ao fluxo

## Quando revisar esta decisão

- Volume de operações exigir escalonamento independente de partes do sistema
- Times separados precisarem de deploys independentes
- A v1 não é esse momento

## Consequências

- **Não criar serviços separados** sem ADR explícito que supersede este
- Módulos dentro do monolito se comunicam via chamadas de função (não HTTP interno)
- Testes unitários testam `domain/` sem banco; testes de integração testam `api/` com banco real
