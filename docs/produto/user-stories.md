# User Stories — Sistema de Biblioteca

> Histórias com critério de aceite testável (Given/When/Then).
> Derivadas de RF-L1 a RF-L7 e RF-B1 a RF-B5 do PRD.
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

## US-03 — Reservar um livro (RF-L3, RN-1, RN-3, RN-4, RN-9, RN-10)

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

Dado que já tenho uma Reserva ativa de um Livro
Quando tento reservar o mesmo Livro outra vez
Então recebo 409 dizendo que já tenho esse Livro
E nenhuma segunda Cópia é consumida

Dado que estou com um Empréstimo em aberto de um Livro
Quando tento reservar o mesmo Livro
Então recebo a mesma recusa: a Cópia já está comigo

Dado que deixei uma Reserva expirar
Quando tento reservar aquele Livro de novo
Então a Reserva é criada normalmente — expirada não conta

Dado que tenho o número máximo de Reservas ativas
Quando tento reservar mais um Livro
Então recebo 409 com o limite e o que fazer para liberar vaga
E um Empréstimo em aberto não ocupa vaga nessa conta
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
E cada Reserva exibe título do Livro, o tempo que resta para retirar
  ("11 h 49 min") e a data/hora de expiração como referência
E o tempo restante avança sozinho, sem recarregar a página

Dado que uma Reserva minha expira em menos de 1 hora
Quando acesso "Minhas reservas"
Então a Reserva aparece destacada como "Expira em breve"
E vejo um aviso de retirada urgente nomeando o Livro, o tempo restante
  e o que acontece se eu não retirar

Dado que todas as minhas Reservas expiraram
Quando acesso "Minhas reservas"
Então vejo a lista vazia com mensagem informativa

Dado que tenho uma Reserva ativa
Quando acesso "Minhas reservas"
Então a linha dela oferece cancelar a Reserva (US-14)
E uma Reserva já encerrada não oferece ação nenhuma
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

---

## US-12 — Criar minha conta (RF-L7, ADR-0009, RN-7)

**Como** visitante  
**Quero** criar uma conta com o meu e-mail  
**Para** poder reservar Livros sem depender do balcão

> Fase 2 da identidade: o cadastro pede **e-mail verificado** — a conta nasce
> sem senha, e ela é definida ao confirmar o endereço pelo link que chega no
> Mailpit (SMTP de desenvolvimento). A tela é a do Keycloak, não nossa. O que
> cada fase deixa em aberto está em [`docs/seguranca.md`](../seguranca.md).

### Critérios de aceite

```gherkin
Dado que sou um visitante na tela de acesso
Quando escolho "Cadastre-se" e informo nome e e-mail
Então a conta é criada pendente de confirmação
E recebo um e-mail com o link de verificação (no Mailpit, em dev)
E, ao visitar o link, defino a minha senha
E entro autenticado, no Catálogo
E recebo o papel Leitor

Dado que acabei de criar minha conta
Quando consulto o meu perfil
Então existe um usuário local vinculado a ela, com papel "leitor"
E consigo reservar um Livro disponível

Dado que acabei de criar minha conta
Quando tento acessar uma tela ou rota de Bibliotecário
Então sou bloqueado (RN-7) — auto-cadastro nunca concede o papel de balcão

Dado que estou definindo a minha senha pela primeira vez
Quando informo uma senha abaixo da política do realm
Então o Keycloak recusa na tela (mínimo de 12 caracteres na Fase 2)

Dado que esqueci a minha senha
Quando peço a recuperação e sigo o link recebido por e-mail
Então defino uma nova credencial e a anterior deixa de valer
```

---

## US-13 — Entrar e sair (RF-L7, ADR-0009)

**Como** usuário cadastrado  
**Quero** entrar e sair do sistema  
**Para** que a minha sessão seja minha

### Critérios de aceite

```gherkin
Dado que não estou autenticado
Quando abro uma rota que exige sessão
Então sou encaminhado ao Keycloak
E, depois de autenticar, volto para a rota que eu tentei abrir

Dado que informo a senha errada
Quando confirmo
Então permaneço na tela do Keycloak com mensagem de credencial inválida
E a aplicação nunca chega a ver a minha senha

Dado que estou autenticado
Quando escolho "Sair"
Então a sessão termina também no Keycloak
E abrir de novo uma rota protegida pede autenticação outra vez
```

---

## US-14 — Cancelar minha reserva (RF-L8, RN-11, RN-5)

**Como** Leitor autenticado
**Quero** cancelar uma Reserva minha que ainda está ativa
**Para** liberar a Cópia quando já sei que não vou buscar o livro

> Sem isto a Reserva só saía por conversão ou pelas 12 horas de RN-1, e nenhuma
> das duas está nas mãos de quem reservou: a Cópia ficava bloqueada o prazo
> inteiro por um livro que ninguém ia retirar. Quem pagava eram os outros
> Leitores, que veem Disponibilidade zero num Livro parado na prateleira.

### Critérios de aceite

```gherkin
Dado que tenho uma Reserva ativa
Quando escolho cancelá-la e confirmo
Então a Reserva passa a cancelada e sai da minha lista
E a Cópia volta ao acervo imediatamente, sem esperar o prazo
E a Disponibilidade do Livro é incrementada na hora
E volto a poder reservar aquele Livro (RN-9 não conta Reserva cancelada)
E a vaga volta para o meu teto de Reservas ativas (RN-10)

Dado que tenho uma Reserva ativa
Quando abro a confirmação de cancelamento
Então ela me avisa que a Cópia volta ao acervo e outro Leitor pode levá-la
E consigo desistir do cancelamento sem efeito nenhum

Dado que minha Reserva já virou Empréstimo
Quando tento cancelá-la
Então recebo 409 dizendo que o livro já está comigo
E a mensagem me manda ao balcão para devolver, não para cancelar

Dado que minha Reserva expirou enquanto a aba estava aberta
Quando clico em cancelar
Então recebo 409 dizendo que ela já expirou e a Cópia já voltou
E nada é alterado

Dado que a Reserva é de OUTRO Leitor
Quando tento cancelá-la pela API
Então recebo 404, não 403 — a existência do id não é confirmada a quem não é dono

Dado que sou Bibliotecário
Quando tento cancelar a Reserva de um Leitor
Então recebo 403: cancelar é ato de quem reservou (RN-2, RN-7, RN-11)

Dado que cancelei uma Reserva
Quando o Bibliotecário olha a lista de Reservas
Então ela aparece como "Cancelada", não como "Expirada"
E ele sabe que a Cópia voltou por desistência, não por esquecimento
```
