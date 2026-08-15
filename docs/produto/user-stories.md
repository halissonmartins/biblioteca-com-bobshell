# User Stories — Sistema de Biblioteca

> Histórias com critério de aceite testável (Given/When/Then).
> Derivadas de RF-L1 a RF-L6 e RF-B1 a RF-B5 do PRD.
> **Cada critério deve ser verificável por um teste automatizado** — se não for, a história está vaga.

---

## US-01 — Navegar pelo catálogo (RF-L1)

**Como** Leitor  
**Quero** navegar pelo catálogo de livros  
**Para** descobrir obras disponíveis no acervo

### Critérios de aceite

```gherkin
Dado que acesso a página do catálogo
Quando a página carrega
Então vejo uma lista paginada de Livros com título, autor e imagem da capa
E cada Livro exibe se tem Disponibilidade > 0 ou não

Dado que digito um termo na busca
Quando confirmo a busca
Então vejo apenas Livros cujo título ou nome do autor contém o termo
```

---

## US-02 — Ver detalhes de um livro (RF-L2)

**Como** Leitor  
**Quero** ver os detalhes completos de um Livro  
**Para** decidir se quero reservá-lo

### Critérios de aceite

```gherkin
Dado que acesso a página de detalhes de um Livro
Quando a página carrega (alvo: < 300 ms)
Então vejo título, autor, sinopse, gênero e imagem da capa
E vejo o número de Cópias disponíveis no momento
E vejo as 5 Avaliações mais recentes com nota e texto

Dado que o Livro tem Disponibilidade = 0
Quando a página carrega
Então o botão "Reservar" está desabilitado com mensagem "Sem cópias disponíveis"
```

---

## US-03 — Reservar um livro (RF-L3, RN-1, RN-3, RN-4)

**Como** Leitor autenticado  
**Quero** reservar um Livro disponível  
**Para** garantir que ele estará separado quando eu chegar

### Critérios de aceite

```gherkin
Dado que sou um Leitor autenticado
E o Livro tem Disponibilidade >= 1
Quando clico em "Reservar"
Então uma Reserva ativa é criada vinculando uma Cópia à minha conta
E a Disponibilidade do Livro é decrementada imediatamente
E recebo confirmação com data e hora de expiração (12h a partir de agora)

Dado que sou um Leitor autenticado
E o Livro tem Disponibilidade = 0
Quando tento reservar
Então recebo erro "Sem cópias disponíveis" e nenhuma Reserva é criada

Dado que tenho uma Reserva ativa para um Livro
Quando outra pessoa tenta reservar a mesma Cópia
Então ela recebe erro ou encontra Disponibilidade = 0
E minha Reserva não é afetada

Dado que tenho uma Reserva ativa
Quando passam 12 horas sem que o Bibliotecário efetive o empréstimo
Então a Reserva expira automaticamente
E a Cópia volta ao estado disponível
```

---

## US-04 — Ver minhas reservas (RF-L4)

**Como** Leitor autenticado  
**Quero** ver minhas Reservas ativas  
**Para** saber quais livros estou aguardando retirar

### Critérios de aceite

```gherkin
Dado que sou um Leitor autenticado com Reservas ativas
Quando acesso "Minhas reservas" (alvo: < 500 ms)
Então vejo apenas as Reservas não expiradas
E cada Reserva exibe título do Livro e data/hora de expiração

Dado que todas as minhas Reservas expiraram
Quando acesso "Minhas reservas"
Então vejo a lista vazia com mensagem informativa
```

---

## US-05 — Ver meus empréstimos (RF-L5)

**Como** Leitor autenticado  
**Quero** ver os livros que estou com emprestados  
**Para** controlar as datas de devolução

### Critérios de aceite

```gherkin
Dado que sou um Leitor com Empréstimos ativos
Quando acesso "Meus empréstimos" (alvo: < 500 ms)
Então vejo cada Livro emprestado com data de vencimento
E empréstimos próximos do vencimento estão destacados visualmente
```

---

## US-06 — Ver página do autor (RF-L6)

**Como** Leitor  
**Quero** ver a página de um Autor  
**Para** descobrir outros livros do mesmo escritor

### Critérios de aceite

```gherkin
Dado que acesso a página de um Autor
Quando a página carrega
Então vejo o nome do Autor e a lista de todos os Livros que ele publicou no acervo
E cada Livro exibe Disponibilidade atual
```

---

## US-07 — Ver reservas de um livro (RF-B1)

**Como** Bibliotecário autenticado  
**Quero** ver todas as Reservas ativas de um Livro  
**Para** saber quem está aguardando e quando as reservas expiram

### Critérios de aceite

```gherkin
Dado que sou um Bibliotecário autenticado
Quando acesso as reservas de um Livro
Então vejo todas as Reservas ativas com nome do Leitor e data de expiração
E Reservas expiradas não aparecem na lista

Dado que sou um Leitor autenticado
Quando tento acessar a gestão de reservas de um Livro
Então recebo erro 403 Forbidden
```

---

## US-08 — Listar empréstimos ativos (RF-B2)

**Como** Bibliotecário autenticado  
**Quero** listar todos os Empréstimos ativos  
**Para** ter visão do acervo fora da biblioteca

### Critérios de aceite

```gherkin
Dado que sou um Bibliotecário autenticado
Quando acesso a lista de empréstimos
Então vejo todos os Empréstimos ativos com Leitor, Livro e data de vencimento

Dado que sou um Leitor autenticado
Quando tento acessar a lista de todos os empréstimos
Então recebo erro 403 Forbidden
```

---

## US-09 — Filtrar por usuário (RF-B3)

**Como** Bibliotecário autenticado  
**Quero** filtrar reservas e empréstimos por Leitor  
**Para** atender rapidamente no balcão

### Critérios de aceite

```gherkin
Dado que sou um Bibliotecário autenticado na lista de reservas/empréstimos
Quando filtro pelo nome ou email de um Leitor
Então vejo apenas os registros vinculados a esse Leitor
E o filtro pode ser limpo para voltar à lista completa
```

---

## US-10 — Emprestar um livro (RF-B4, RN-2, RN-6)

**Como** Bibliotecário autenticado  
**Quero** efetivar o empréstimo de uma Cópia para um Leitor  
**Para** registrar a saída física do livro da biblioteca

### Critérios de aceite

```gherkin
Dado que um Leitor tem uma Reserva ativa para um Livro
Quando o Bibliotecário efetiva o empréstimo a partir da linha da Reserva (alvo: < 3 s)
Então a Reserva é convertida em Empréstimo
E a Cópia muda de estado "reservada" para "emprestada"
E a data de vencimento do Empréstimo é registrada com 7 dias corridos (RN-8)
E a confirmação informa a data de devolução ao Bibliotecário

Dado que a Reserva está expirada
Quando o Bibliotecário tenta efetivar o empréstimo
Então recebe erro "A Reserva expirou e a Cópia voltou ao acervo. Peça ao Leitor para reservar novamente."
E o erro aparece no próprio modal, sem perder a Reserva selecionada
E nenhum Empréstimo é criado

Dado que sou um Leitor autenticado
Quando tento efetivar um empréstimo via API
Então recebo erro 403 Forbidden
```

---

## US-11 — Registrar devolução (RF-B5, RN-2)

**Como** Bibliotecário autenticado  
**Quero** marcar uma Cópia como devolvida  
**Para** liberar o livro para outros leitores

### Critérios de aceite

```gherkin
Dado que um Livro está com status "emprestado"
Quando o Bibliotecário registra a devolução (alvo: < 3 s)
Então o Empréstimo é encerrado com data de devolução registrada
E a Cópia volta ao estado "disponível"
E a Disponibilidade do Livro é incrementada imediatamente

Dado que sou um Leitor autenticado
Quando tento registrar uma devolução via API
Então recebo erro 403 Forbidden
```
