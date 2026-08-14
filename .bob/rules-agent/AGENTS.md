# AGENTS.md — Modo Agent (Codificação)

This file provides guidance to agents when working with code in this repository.

## Leia antes de criar qualquer arquivo

Consulte `ARCHITECTURE.md` (quando existir) para saber **onde** o arquivo novo deve viver. Sem o mapa, não crie pasta nova.

## Invariantes arquiteturais (aplicar desde E3)

Estes serão preenchidos quando a stack for decidida. Estrutura esperada:

- Camada de domínio **não importa** nada de infra (HTTP, banco, fila)
- Nenhum acesso ao banco fora de `infra/repositories/`
- Nenhuma rota acessa o banco diretamente
- Regras de negócio ficam em `domain/` — não em controllers/handlers

## Autorização — item obrigatório em toda rota nova

- **Leitor** não pode executar ações de `bibliotecário` (RN-7)
- Todo endpoint novo precisa de **teste de autorização** na definition of done
- Agente que implementa rota sem teste de autorização está incompleto

## Expiração de reservas (RN-1)

- Reservas expiram em **12h** — implementar via verificação na leitura OU job de background
- A disponibilidade deve ser **consistente** entre leitor e bibliotecário (fonte única de verdade)
- Cuidado: expiração que atualiza disponibilidade é escrita concorrente — usar transação

## Quando a stack for definida, adicionar aqui

- Comandos: build, test (individual), lint, migrate, seed
- Padrão de nomes de arquivo e pasta
- Padrão de tratamento de erro
- Padrão de teste (framework, localização, convenção de nome)
