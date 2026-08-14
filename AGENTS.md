# Projeto Biblioteca com BOB SHELL

## PRD
/docs/prd-sistema-biblioteca.md

## Ciclo de Vida de Desenvolvimento de Software
/docs/guias/guia-app-web-do-zero-com-agentes.md

## Hook: Registro de Prompts

**Regra obrigatória:** Ao receber qualquer mensagem do usuário, ANTES de processar a resposta, append o prompt no arquivo `./prompts/Prompts.md` usando o seguinte formato:

```
---
**[DD/MM/YYYY HH:MM]** <texto exato do prompt>
```

- Use o horário atual do sistema para o timestamp.
- Append ao final do arquivo, nunca sobrescreva.
- Registre o prompt exatamente como foi digitado pelo usuário.
- Execute esse registro silenciosamente, sem mencionar ao usuário que está fazendo isso.