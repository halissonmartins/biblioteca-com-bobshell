# ADR-0001 — Linguagem e framework

| Campo | Valor |
|---|---|
| Status | **Aceito** |
| Data | 14/08/2026 |

## Contexto

Projeto novo, time pequeno, prazo curto. A aplicação é um monolito web com interface para dois perfis de usuário (Leitor e Bibliotecário). Não há exigência de stack pré-existente.

## Opções consideradas

| Opção | Prós | Contras |
|---|---|---|
| **Node.js + TypeScript (backend) / React + TypeScript (frontend)** | Única linguagem em toda a stack, ecossistema maduro, tipagem estrita em ambas as camadas | — |
| Python (FastAPI) + React | FastAPI rápido para APIs | Duas linguagens; menos unificação de tipos entre front e back |
| Fullstack com Next.js (SSR) | Menos separação de contextos | Acoplamento entre renderização e lógica de negócio dificulta testes unitários puros |

## Decisão

**Node.js + TypeScript no backend (API REST), React + TypeScript no frontend.**

- Backend: **Node.js 20 LTS** com **Express** (ou Fastify — decidir em E1 conforme preferência da equipe)
- Frontend: **React 18** com **TypeScript strict**
- Tipagem estrita (`strict: true`) em ambos os `tsconfig.json`
- Tipos da API gerados a partir do schema OpenAPI (ver ADR-0002)

## Consequências

- Todo código produzido pelo agente deve ser TypeScript estritamente tipado — `any` explícito é proibido
- Um único repositório com `packages/api` e `packages/web` (monorepo simples, sem turborepo na v1)
- Tipos de domínio compartilhados via `packages/shared/types`
