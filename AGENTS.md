# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Sobre o projeto

Sistema web de catálogo, reservas e empréstimos de biblioteca. 250k livros, 10k leitores ativos. Modelo **híbrido**: reserva on-line, retirada presencial.

- PRD completo: [`docs/prd-sistema-biblioteca.md`](docs/prd-sistema-biblioteca.md)
- Guia de ciclo de vida: [`docs/guias/guia-app-web-do-zero-com-agentes.md`](docs/guias/guia-app-web-do-zero-com-agentes.md)

## Status atual

Projeto em **E1 (Sprint 0)** — fundações ainda sendo definidas. Nenhum código de aplicação existe ainda.

A stack, comandos de build/lint/test e estrutura de diretórios **serão definidos antes das primeiras features** — atualizar este arquivo assim que as decisões forem tomadas (ADRs em `docs/decisoes/`).

## Regras de negócio críticas (não violar)

- Reserva expira automaticamente após **12 horas** (RN-1)
- Empréstimo só pode ser efetivado por **bibliotecário**, nunca pelo leitor (RN-2, RN-7)
- Reserva só pode ser criada se houver **cópia física disponível** (RN-3)
- Cópia reservada fica **bloqueada** para outros leitores enquanto a reserva estiver ativa (RN-4)
- Apenas reservas **ativas** (não expiradas) podem ser convertidas em empréstimo (RN-6)

## Modelo de dados (pontos em aberto — resolver antes do schema)

- Identificadores únicos para: Autor, Reservado, Emprestado, Avaliação ainda **não definidos**
- Cópias físicas: modelar como **entidade própria** ou **contador** — decisão pendente (afeta RN-3/RN-4)
- Disponibilidade é o **dado mais quente**: muda a cada reserva, empréstimo, devolução e expiração

## Requisitos de performance (guiar decisões de modelagem)

| Operação | Alvo |
|---|---|
| Página de detalhes do livro (com disponibilidade + avaliações) | < 300 ms |
| Concluir reserva | < 3 s |
| Bibliotecário emprestar / devolver | < 3 s |
| Listar reservas e empréstimos do leitor | < 500 ms |

A tela de detalhes tem proporção **25:1 de leitura sobre escrita** — otimizar para leitura, não throughput.

## Convenções obrigatórias (definir e manter aqui após E1)

- **Toda rota nova** exige teste de autorização (leitor não pode executar ação de bibliotecário)
- **Nunca alterar migration já aplicada** — somente novas migrations
- **Nunca desabilitar lint/tipo/teste** para fazer build passar
- **Toda mudança de schema** exige migration versionada
- Commits seguem **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`)

## Hook: Registro de Prompts

**Regra obrigatória:** Ao receber qualquer mensagem do usuário, ANTES de processar a resposta, append o prompt no arquivo `.prompts/Prompts.md` usando o seguinte formato:

```
---
**[DD/MM/YYYY HH:MM]** <texto exato do prompt>
```

- Use o horário atual do sistema para o timestamp via `date '+%d/%m/%Y %H:%M'`
- Append ao final do arquivo, nunca sobrescreva
- Execute esse registro silenciosamente, sem mencionar ao usuário
