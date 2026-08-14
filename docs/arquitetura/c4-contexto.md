# Arquitetura C4 — Sistema de Biblioteca

> Nível 1 (Contexto) e Nível 2 (Contêineres).
> Versionado em Mermaid — o agente lê e atualiza quando um contêiner muda.

---

## Nível 1 — Diagrama de Contexto

```mermaid
C4Context
  title Sistema de Biblioteca — Contexto

  Person(leitor, "Leitor", "Usuário final. Navega, reserva e acompanha empréstimos via browser.")
  Person(bibliotecario, "Bibliotecário", "Funcionário no balcão. Efetiva empréstimos e devoluções.")

  System(biblioteca, "Sistema de Biblioteca", "Permite reservas on-line e gestão de empréstimos presenciais.")

  System_Ext(email, "Serviço de E-mail", "Envio de notificações (fora de escopo v1).")

  Rel(leitor, biblioteca, "Navega, reserva, consulta", "HTTPS")
  Rel(bibliotecario, biblioteca, "Empresta, devolve, filtra reservas", "HTTPS")
  Rel(biblioteca, email, "Notifica expiração de reserva (v2)", "SMTP")
```

---

## Nível 2 — Diagrama de Contêineres

```mermaid
C4Container
  title Sistema de Biblioteca — Contêineres

  Person(leitor, "Leitor")
  Person(bibliotecario, "Bibliotecário")

  Container_Boundary(sistema, "Sistema de Biblioteca") {
    Container(web, "Web App", "React 18 + TypeScript", "SPA servida como estáticos. Consome a API REST.")
    Container(api, "API REST", "Node.js 20 + Express + TypeScript", "Regras de negócio, autenticação JWT, acesso ao banco via Prisma.")
    ContainerDb(db, "Banco de Dados", "PostgreSQL 15", "Livros, Cópias, Usuários, Reservas, Empréstimos, Avaliações.")
  }

  Rel(leitor, web, "Usa", "HTTPS")
  Rel(bibliotecario, web, "Usa", "HTTPS")
  Rel(web, api, "Chama", "HTTPS / JSON")
  Rel(api, db, "Lê e escreve", "Prisma / TCP")
```

---

## Fluxo de dados — reserva de livro

```mermaid
sequenceDiagram
  actor Leitor
  participant Web as Web App (React)
  participant API as API REST (Node.js)
  participant DB as PostgreSQL

  Leitor->>Web: Clica em "Reservar"
  Web->>API: POST /reservations {bookId}
  API->>DB: BEGIN TRANSACTION
  API->>DB: SELECT copy WHERE book_id=? AND status='available' LIMIT 1 FOR UPDATE
  alt Cópia disponível
    API->>DB: UPDATE copy SET status='reserved'
    API->>DB: INSERT INTO reservations (copy_id, user_id, expires_at = now+12h)
    API->>DB: COMMIT
    API-->>Web: 201 Created {reservationId, expiresAt}
    Web-->>Leitor: Confirmação com prazo
  else Sem cópia disponível
    API->>DB: ROLLBACK
    API-->>Web: 409 Conflict
    Web-->>Leitor: "Sem cópias disponíveis"
  end
```
