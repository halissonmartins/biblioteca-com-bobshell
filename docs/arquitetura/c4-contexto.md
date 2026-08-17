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
  System_Ext(capasFonte, "Google Books / Open Library", "Origem das capas de Livro. Acessados só na ingestão manual (make capas), nunca em runtime — ADR-0008.")

  Rel(leitor, biblioteca, "Navega, reserva, consulta", "HTTPS")
  Rel(bibliotecario, biblioteca, "Empresta, devolve, filtra reservas", "HTTPS")
  Rel(biblioteca, email, "Notifica expiração de reserva (v2)", "SMTP")
  Rel(biblioteca, capasFonte, "Baixa capas por ISBN (ingestão única, fora do caminho do usuário)", "HTTPS")
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
    Container(api, "API REST", "Node.js 20 + Express + TypeScript", "Regras de negócio e acesso ao banco via Prisma. Resource server: valida o token do Keycloak, nunca o emite — ADR-0009.")
    Container(keycloak, "Keycloak", "Keycloak 26 (OIDC)", "Provedor de identidade: login, auto-cadastro, papéis e emissão de token. Guarda a credencial — a API não. Realm versionado em keycloak/.")
    ContainerDb(db, "Banco de Dados", "PostgreSQL 15", "Livros, Cópias, Usuários, Reservas, Empréstimos, Avaliações.")
    Container(capas, "Servidor de Capas", "nginx (local) / CDN (produção)", "Serve /capas/{isbn}.jpg a partir de assets/capas/. Não fala com a API nem com o banco — ADR-0008.")
  }

  Container_Boundary(obs, "Observabilidade (perfil `obs`, local)") {
    Container(collector, "OTel Collector", "opentelemetry-collector-contrib", "Recebe os três sinais por OTLP e faz o fan-out por destino.")
    ContainerDb(prom, "Prometheus", "Prometheus 3", "Métricas raspadas do Collector.")
    ContainerDb(jaeger, "Jaeger", "Jaeger 2", "Traces.")
    ContainerDb(graylog, "Graylog", "Graylog 7", "Logs estruturados.")
    Container(grafana, "Grafana", "Grafana 13", "Dashboards versionados em observabilidade/grafana/dashboards/.")
  }

  Rel(leitor, web, "Usa", "HTTPS")
  Rel(bibliotecario, web, "Usa", "HTTPS")
  Rel(web, api, "Chama", "HTTPS / JSON")
  Rel(web, capas, "Carrega a capa do Livro", "HTTPS / imagem")
  Rel(web, keycloak, "Autentica e obtém token", "OIDC — Authorization Code + PKCE")
  Rel(api, keycloak, "Busca as chaves públicas do realm", "JWKS / HTTPS")
  Rel(api, db, "Lê e escreve", "Prisma / TCP")
  Rel(api, collector, "Logs, métricas e traces", "OTLP / gRPC")
  Rel(prom, collector, "Raspa métricas", "HTTP :8889")
  Rel(prom, keycloak, "Raspa eventos de login e cadastro", "HTTP :9000")
  Rel(collector, jaeger, "Exporta traces", "OTLP / gRPC")
  Rel(collector, graylog, "Exporta logs", "OTLP / gRPC")
  Rel(grafana, prom, "Consulta", "PromQL")
  Rel(grafana, jaeger, "Consulta", "HTTP")
```

> O Keycloak **sobe** com `docker compose up -d`: sem ele ninguém autentica. A
> senha nunca atravessa a nossa origem — o navegador fala com ele diretamente, e
> a API só recebe o token pronto.
>
> A stack de observabilidade **não sobe** com `docker compose up -d` — vive no
> perfil `obs` e é ferramenta de desenvolvimento, não parte do produto entregue.
> Detalhes em [ADR-0007](../decisoes/0007-observabilidade.md) e
> [observabilidade.md](../observabilidade.md).

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
