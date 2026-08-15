# Fluxos do Usuário — Sistema de Biblioteca

> Os 3–5 caminhos principais, passo a passo, com estados de erro.
> Referência para desenho de rotas (E2) e testes e2e (E3).

---

## Fluxo 1 — Leitor reserva um livro (fluxo crítico)

```
[1] Leitor acessa o catálogo
      ↓
[2] Busca por título, autor ou gênero
      ↓
[3] Abre a página de detalhes do Livro
      ├── [ERR] Disponibilidade = 0 → botão desabilitado, mensagem "Sem cópias disponíveis" → FIM
      ↓
[4] Clica em "Reservar"
      ├── [ERR] Não autenticado → redirecionado para login → retorna para [4]
      ↓
[5] Sistema bloqueia uma Cópia e cria a Reserva
      ├── [ERR] Cópia foi reservada por outro leitor no mesmo instante (race condition)
      │         → mensagem "Outra pessoa acabou de reservar esta cópia" → volta para [3]
      ↓
[6] Leitor vê confirmação com data/hora de expiração (12h)
      ↓
[FIM] Leitor vai à biblioteca antes de expirar
```

**Caminho crítico de performance:** passos [3] e [5] devem completar em < 300 ms e < 3 s respectivamente.

---

## Fluxo 2 — Bibliotecário efetiva empréstimo no balcão

```
[1] Leitor chega ao balcão com intenção de retirar o livro reservado
      ↓
[2] Bibliotecário filtra as Reservas pelo ID do Leitor (opcional)
      ↓
[3] Vê a lista de Reservas ativas, com Livro, Leitor, Cópia e expiração
      ├── [ERR] Reserva expirada → avisa Leitor, sugere nova reserva → FIM
      ↓
[4] Clica em "Efetivar empréstimo" na linha da Reserva
      ├── O modal abre já vinculado à Reserva, sem etapa de seleção
      └── A data de vencimento vem preenchida com 7 dias (RN-8), editável
      ↓
[5] Sistema converte Reserva em Empréstimo (< 3 s)
      ↓
[6] Bibliotecário entrega a Cópia física ao Leitor
      ↓
[FIM] Leitor sai com o livro
```

---

## Fluxo 3 — Bibliotecário registra devolução

```
[1] Leitor chega ao balcão com a Cópia física
      ↓
[2] Bibliotecário busca o Leitor ou escaneia o livro
      ↓
[3] Localiza o Empréstimo ativo
      ↓
[4] Clica em "Registrar devolução" (< 3 s)
      ↓
[5] Sistema encerra Empréstimo e libera Cópia como disponível
      ↓
[FIM] Livro volta ao acervo imediatamente
```

---

## Fluxo 4 — Expiração automática de Reserva (fundo)

```
[1] Reserva criada com prazo de 12h
      ↓
[2] (background) Sistema verifica expiração:
      opção A — job periódico (cron) que marca expiradas e libera Cópias
      opção B — verificação lazy na leitura: considera expirada se criada há > 12h
      ↓
[3] Cópia volta ao estado disponível
      ↓
[4] Leitor que tentar acessar a Reserva vê status "expirada"
```

> ⚠️ Decisão de implementação pendente: job de background vs. verificação lazy.
> Registrar em ADR quando decidido.

---

## Fluxo 5 — Leitor consulta seus empréstimos e reservas

```
[1] Leitor acessa "Minha conta"
      ↓
[2] Vê aba "Reservas ativas" (< 500 ms)
      └── Lista vazia se não há reservas ativas
      ↓
[3] Vê aba "Empréstimos" (< 500 ms)
      └── Lista vazia se não há empréstimos ativos
```

---

## Estados de erro globais

| Situação | Comportamento esperado |
|---|---|
| Usuário não autenticado tenta reservar | Redireciona para login; após autenticação, retorna para a ação |
| Leitor tenta acessar rota de Bibliotecário | HTTP 403 com mensagem clara |
| Indisponibilidade momentânea do sistema | Mensagem de erro amigável; não perder o estado do formulário |
| Race condition na reserva (duas reservas simultâneas da última cópia) | Apenas uma é aceita; a outra recebe erro com orientação |
