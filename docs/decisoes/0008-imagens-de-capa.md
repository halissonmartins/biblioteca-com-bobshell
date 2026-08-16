# ADR-0008 — Imagens de capa de Livro

| Campo | Valor |
|---|---|
| Status | **Aceito** |
| Data | 16/08/2026 |

## Contexto

O Catálogo exibia toda capa como placa tipográfica gerada (`BookPlate`), porque o acervo não tinha imagem nenhuma — a alternativa da época era um emoji repetido em 65% da tela. O produto agora quer a capa real no card.

O encanamento já existia: `Book.coverUrl` está no schema desde a primeira migration, os repositórios já o selecionam e `packages/shared/src/types/domain.ts` já o expõe. O que faltava era **origem dos bytes** e **quem preenche o campo**.

Restrições que decidiram a escolha:

- Precisa funcionar no ambiente local via Docker, e o `docker-compose.yml` já roda no orçamento de 6 GB do WSL2 (Postgres + Graylog + OpenSearch + Jaeger + Prometheus)
- `make e2e` e o CI não podem depender de rede externa — toda fonte pública de capa impõe cota por IP (Open Library: 100 requisições a cada 5 minutos; Google Books API: ~100 por dia sem chave), e uma única página de Catálogo com 20 cards estoura isso sob refresh
- O acervo real tem 250 mil Livros; a maioria nunca terá arte

## Decisão

**Servidor de arquivos estáticos (`nginx:1.29-alpine` no `docker-compose.yml`) + ingestão única e offline a partir de fontes públicas de capa.**

1. As capas vivem em `assets/capas/<isbn>.jpg`, **versionadas no repositório** — é isso que torna Catálogo, e2e e CI determinísticos sem rede.
2. O serviço `capas` do compose monta essa pasta em `/capas/` e escuta em `localhost:8080`. Fica fora de qualquer profile: sobe com `docker compose up -d`, como o Postgres.
3. `packages/api/scripts/baixar-capas.ts` (`make capas`) baixa, por ISBN, apenas as capas ausentes, tentando as fontes em ordem. É **manual e raro** — só ao acrescentar Livro novo.
4. `seed.ts` preenche `coverUrl` **só quando o arquivo existe** em `assets/capas/`. Livro sem arquivo fica `null` e o Catálogo desenha a placa.
5. `coverUrl` guarda **caminho relativo** (`/capas/<isbn>.jpg`), nunca URL absoluta: o mesmo dump de banco serve dev, e2e e produção, que só diferem em quem atende `/capas/`. Em desenvolvimento quem atende é o proxy do Vite (`vite.config.ts`) apontando para a porta 8080; em produção é a mesma origem da SPA ou um CDN à frente dela.

Não há upload de capa pelo Bibliotecário, nem rota de imagem na API.

### Fontes, em ordem

| # | Fonte | Por que nesta posição |
|---|---|---|
| 1 | **Google Books, URL direta por ISBN** (`books/content?vid=ISBN…&printsec=frontcover&img=1&zoom=N`) | Não passa pela API JSON, então **não gasta cota nenhuma**. `zoom` é o tamanho (4 ≈ 575–800px, 3 ≈ 320px, 1 ≈ 128px) e pedimos o maior primeiro. Cobertura irregular |
| 2 | **Google Books, API JSON** (`volumes?q=isbn:` → `imageLinks`) | Resolve o ISBN até o volume e devolve a capa que ele realmente tem — pega o que a URL direta não acha. Custa cota: **~100 consultas/dia por IP sem chave** (medido: 429 num IP compartilhado), 1000/dia com `GOOGLE_BOOKS_API_KEY` |
| 3 | **Open Library** (`covers.openlibrary.org/b/isbn/…-L.jpg?default=false`) | Era a fonte original e ficou fora do ar; permanece como reserva. `default=false` para receber 404 em vez de um pixel cinza |

**Descartadas:**

- **WorldCat (OCLC)** — as capas não são API pública: exigem afiliação institucional e chave (WSKey), e os termos limitam o uso a instituições membro. Não serve a um repositório aberto que qualquer um clona.
- **Library Genesis** — é biblioteca-sombra de obras pirateadas: espelhos instáveis, domínios derrubados com frequência, nenhum contrato de API estável, e proveniência que não se quer num acervo versionado.

### Como se separa capa de recusa

Nenhuma das fontes responde 404 de forma confiável — elas devolvem **200 com uma imagem que não é a capa**. Sem isso o repositório encheria de lixo com cara de acervo. O script recusa, nesta ordem:

1. **Assinaturas de recusa conhecidas** — a chapa cinza do Google (uma por nível de `zoom`, hashes documentados no script) e o que cada fonte devolve para um ISBN inexistente, consultado uma vez por execução.
2. **Piso e teto de bytes** — abaixo de 5 KB é placeholder; acima de 1 MB a candidata fica reservada e só entra se nenhuma menor servir (medido: "A Paixão Segundo G.H." só existe acima do teto).
3. **Proporção** — no `zoom` maior o Google devolve, para alguns volumes, uma **tira do topo da capa** (medido: 800×128 em Kafka). Fora da faixa 0,5–0,9 de largura/altura, recusa.
4. **Duplicatas na mesma execução** — dois Livros não têm a mesma capa. Bytes repetidos são recusa com rosto novo; os arquivos envolvidos são apagados. É esta rede que segura o dia em que os hashes do item 1 mudarem.

### ISBNs do seed

A ingestão expôs um defeito nos dados de desenvolvimento: vários ISBNs do `seed.ts` não correspondiam à obra (um deles trouxe a capa de *The Temple of Dawn*, de Mishima, para "O Amor nos Tempos do Cólera") e outros eram de edições sem capa em nenhuma fonte. Seis foram corrigidos para edições reais e **conferidos visualmente, capa a capa**. Quatro Livros seguem sem capa de propósito — inclusive "O Nome de Deus", que é um título inventado pelo próprio seed e por isso nunca terá arte. É a demonstração viva de que a placa não é fallback triste: metade do Catálogo de desenvolvimento vive dela.

## Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Arquivos em `packages/web/public/capas/` | Não escala além do seed e mistura acervo com bundle da SPA |
| **MinIO** (S3-compatível) no compose | Maior paridade com produção, mas ~200 MB de RAM, SDK, credenciais e provisionamento de bucket para servir arquivo estático — o projeto ainda não tem upload que justifique (YAGNI). É o caminho natural **se** upload de capa entrar no roadmap |
| Hotlink direto para a fonte (Open Library ou Google Books) | Exige internet em runtime, e o rate limit torna Catálogo e e2e instáveis |
| BLOB no Postgres + rota `GET /books/:id/cover` | Infla o banco, põe I/O de imagem no processo da API e ameaça o RNF-1 (detalhes < 300 ms) |

## Consequências

- O `DESIGN.md` muda: a placa tipográfica deixa de ser o padrão único e passa a ser **o que se desenha quando não há capa** — inclusive quando a imagem falha em carregar (`onError` no `BookPlate`). O `Don't` sobre imagem como identidade de Livro foi reescrito, não removido: ícone e emoji continuam proibidos.
- A chapa continua **2:3** e a imagem entra com `object-cover`: preenche sem distorcer, cortando o excedente quando a proporção do arquivo não bate. A grade não perde o alinhamento e não há CLS, porque o wrapper `aspect-[2/3]` reserva o espaço antes do carregamento.
- Com capa, o card perderia o `<h3>` que a placa desenhava; o `BookPlate` passa a emitir um `h3` `sr-only` junto da imagem para não regredir a árvore de acessibilidade.
- `seed-perf.ts` (250 mil Livros) não recebe capa: o cenário de performance continua exercitando a placa, que é o caso majoritário do acervo real.
- Capa nova exige: baixar (`make capas`), commitar o `.jpg` e rodar `make seed`.
- **O servidor de capas passa a ser dependência da suíte E2E.** Com `coverUrl` preenchido e o container `capas` fora do ar, o proxy do Vite devolve 502 por imagem e as requisições da API ficam atrás delas no limite de 6 conexões por origem do Chromium: `catalogo.spec.ts` falha por timeout no filtro de busca, não por fallback. Medido em 3 testes vermelhos. Por isso o job `e2e-ci` sobe o serviço explicitamente, e não basta o `services: postgres` do GitHub Actions.
- O mesmo mecanismo é um risco de produção: origem de imagem lenta atrasa as chamadas de API da mesma origem. HTTP/2 no edge (multiplexação, sem o limite de 6 conexões) é o que remove o risco quando isto sair do local.

## Quando revisar esta decisão

- Se o Bibliotecário passar a subir capa pela interface → migrar para MinIO/S3 com URL assinada
- Se o volume de imagens deixar de caber confortavelmente no repositório
- Se surgir necessidade de múltiplas resoluções (`srcset`) — hoje se grava um arquivo só por Livro, de 575 a 800px de largura, suficiente para o card (~370px em tela 2x) e para o hero
- Se a cobertura ficar baixa demais: com chave do Google (`GOOGLE_BOOKS_API_KEY`) a fonte 2 passa a valer de verdade, e é o próximo passo antes de procurar fonte nova
