# Aplicação Web do Zero com Agentes de Codificação

Guia de implementação organizado em dois eixos paralelos: **Produto/Design** e **Engenharia**.

---

## Como ler este guia

Os dois eixos não são sequenciais. Correm em paralelo, respondem a perguntas diferentes e se encontram em pontos de sincronização definidos.

| | Eixo Produto/Design | Eixo Engenharia |
|---|---|---|
| **Pergunta** | Isso resolve o problema e é usável? | Isso é construível, seguro e sustentável? |
| **Risco que mitiga** | Construir a coisa errada | Construir errado a coisa |
| **Artefato central** | `design-system.md` | `AGENTS.md` |
| **Ciclo** | Divergir → prototipar → validar → convergir | Especificar → implementar → verificar → entregar |
| **Descartável?** | Wireframes e protótipos, sim | PoCs e spikes, sim; o resto, não |

Confundir os eixos é a origem dos dois erros mais caros de greenfield: começar a codificar sem saber o que se está construindo, e prototipar indefinidamente sem nunca colocar nada em produção.

### Princípio orientador para trabalho com agentes

Com agentes de codificação, o gargalo deixa de ser **escrever código** e passa a ser **especificar, revisar e verificar**.

| Sem agentes | Com agentes |
|---|---|
| Documentação é overhead | Documentação é entrada do sistema de produção |
| Testes provam que funciona | Testes são o contrato que impede o agente de quebrar o que já existe |
| Revisão de código é opcional em time pequeno | Revisão é o único ponto onde erro é interceptado |
| Protótipo custa caro, então pula-se | Protótipo custa minutos, então pular é injustificável |
| Código é o artefato caro | Especificação e verificação são os artefatos caros |

Consequência prática: **o agente produz mais rápido do que você revisa.** Guardrails determinísticos — no eixo de engenharia (tipos, lint, testes, CI) e no eixo de design (design system, tokens, componentes canônicos) — precisam existir *antes* da primeira feature.

---

# Parte I — Eixo de Produto e Design

## P0. Enquadramento

**Objetivo:** definir o que será construído antes de abrir um editor.

**Você faz:** decide o problema, o usuário e o corte do MVP.
**O agente faz:** estrutura sua descrição solta, questiona ambiguidades, deriva user stories do escopo.

### Artefatos

| Artefato | Conteúdo mínimo |
|---|---|
| `docs/produto/prd.md` | Problema, usuário-alvo, escopo do MVP, **fora de escopo explícito**, métrica de sucesso |
| `docs/produto/glossario.md` | Termos do domínio com definição única (linguagem ubíqua) |
| `docs/produto/user-stories.md` | Histórias com critério de aceite testável (Given/When/Then) |

> **Por que o glossário importa mais com agentes:** o agente não intui que "pedido", "ordem" e "compra" são a mesma entidade no seu domínio. Se você não fixar, ele cria três modelos — e o eixo de engenharia herda a ambiguidade como três tabelas.

**Checkpoint:** cada história tem critério de aceite que um teste automatizado conseguiria verificar. Se não conseguir, a história está vaga demais para ser delegada a um agente.

---

## P1. Fluxos e prototipação

**Objetivo:** responder "é usável e desejável?" antes de existir backend.

**Você faz:** define os fluxos principais, julga o resultado, decide o que fica.
**O agente faz:** gera variações de wireframe e protótipo navegável em minutos, itera sob crítica.

### Fidelidade proporcional ao risco

| Situação | Fidelidade adequada |
|---|---|
| Fluxo crítico, ambíguo ou inédito | Protótipo navegável, testado com usuário real |
| Tela com muita regra de negócio | Wireframe + fluxo escrito |
| CRUD interno, tela administrativa | Nenhuma — vá direto ao código |

Prototipar o que não tem ambiguidade é a versão de design da PoC desnecessária: procrastinação disfarçada de diligência.

### Artefatos

| Artefato | Conteúdo mínimo |
|---|---|
| `docs/design/fluxos.md` | Os 3–5 fluxos principais do usuário, passo a passo, com estados de erro |
| Wireframes de baixa fidelidade | Estrutura antes de estética; descartáveis |
| Protótipo navegável | Figma ou código de fachada, sem backend real |
| `docs/design/decisoes-ux.md` | Por que o fluxo é esse, o que foi descartado e por quê |

> **Protótipo é descartável.** Código de protótipo gerado por agente é especialmente tentador de promover, porque já *parece* funcionar. Não tem validação, autorização, tratamento de erro nem testes. Promovê-lo é nascer com dívida técnica no dia zero — no único momento em que ela era evitável.

**Checkpoint:** você consegue percorrer os fluxos críticos ponta a ponta no protótipo e explicar cada tela sem hesitar.

---

## P2. Design system

**Objetivo:** fixar a linguagem visual antes que o agente a improvise.

Este é o artefato que mais falta em projetos com agentes. Sem ele, cada sessão inventa espaçamento, cor e comportamento de formulário — e você descobre a inconsistência só quando já tem vinte telas.

### Artefatos

| Artefato | Conteúdo mínimo |
|---|---|
| `docs/design/design-system.md` | Tokens (cor, tipografia, espaçamento, raio, sombra), regras de uso |
| Componentes canônicos implementados | Um exemplo real de botão, input, formulário, tabela, modal |
| Padrões de estado | Loading, vazio, erro, sucesso, desabilitado — definidos uma vez |
| Padrões de acessibilidade | Contraste, foco visível, navegação por teclado, rótulos |

### `design-system.md` — a constituição da interface

É para o frontend o que o `AGENTS.md` é para o backend: o documento que o agente lê antes de gerar UI.

```markdown
# Design System

## Tokens
- Cores: [paleta, com nome semântico — primary, danger, surface...]
- Tipografia: [escala, pesos, famílias]
- Espaçamento: [escala, ex.: 4/8/12/16/24/32]
- Raio e sombra: [valores permitidos]

## Regras
- Nunca usar valor de cor ou espaçamento fora dos tokens
- Todo formulário segue o padrão em [caminho do componente canônico]
- Todo estado de carregamento usa [componente]
- Toda mensagem de erro aparece em [posição e formato]

## Acessibilidade obrigatória
- Contraste mínimo AA
- Foco visível em todo elemento interativo
- Todo input tem label associado

## Componentes canônicos
[lista com caminho no repositório — o agente copia o padrão que encontra]
```

**Checkpoint:** existe um componente real no repositório para cada padrão descrito. Documento sem implementação de referência não é seguido pelo agente.

---

## P3. Validação contínua

**Objetivo:** manter o eixo de produto vivo depois do primeiro release.

Roda em paralelo ao loop de engenharia (E4), não depois dele.

### Artefatos

| Artefato | Descrição |
|---|---|
| Métrica de sucesso instrumentada | A definida no PRD, medida de verdade |
| Registro de feedback de usuário | Fonte das próximas histórias |
| Backlog priorizado | Vivo, revisado a cada ciclo |
| Atualização do `design-system.md` | Sempre que um padrão novo se estabelecer |

---

# Parte II — Eixo de Engenharia

## E0. Decisões técnicas e spikes

**Objetivo:** eliminar incógnitas técnicas e registrar escolhas.

**Você faz:** define stack, hospedagem, banco, modelo de autenticação.
**O agente faz:** compara opções, gera PoCs descartáveis para cada risco, escreve os ADRs a partir da conversa.

### Artefatos

| Artefato | Conteúdo mínimo |
|---|---|
| `docs/decisoes/NNNN-titulo.md` | Um ADR por decisão relevante: contexto, opções, decisão, consequências |
| `docs/arquitetura/c4-contexto.md` | Diagrama C4 nível 1 e 2 em Mermaid (versionável; o agente lê e atualiza) |
| `docs/riscos.md` | Riscos técnicos abertos e como cada um foi ou será resolvido |

### ADRs mínimos para uma app web

1. Linguagem e framework (backend e frontend)
2. Banco de dados e estratégia de migrations
3. Autenticação e autorização
4. Estratégia de deploy e ambientes
5. Monolito modular vs. serviços separados (comece monolito, salvo prova em contrário)
6. Estratégia de testes (o que é unitário, integração, e2e)

> **PoC é descartável, como o protótipo.** Se o spike do agente "deu certo", jogue fora e reimplemente dentro das fundações. Nem todo projeto precisa de PoC: sem incógnita técnica real, ela é procrastinação.

### Três artefatos de arquitetura, três funções

São frequentemente confundidos. Nenhum substitui o outro.

| Artefato | Pergunta que responde | Natureza | Atualização |
|---|---|---|---|
| **ADR** | *Por que* decidimos assim? | Imutável, ponto no tempo | Nunca se edita; supersede-se |
| **C4** | Como o sistema se relaciona com o mundo e quais são os contêineres? | Visual, nível de sistema, olha para fora | Quando muda um contêiner |
| **`ARCHITECTURE.md`** | *Onde* eu mexo para fazer X? | Mapa do código, olha para dentro | Uma ou duas vezes por ano |

O terceiro é criado em E1, preenchido em E3 e mantido em E4.

---

## E1. Fundações do repositório (Sprint 0)

**Objetivo:** montar os trilhos antes de qualquer feature. **É a fase mais importante do eixo de engenharia.**

### Artefatos

| Artefato | Função |
|---|---|
| `README.md` | Como rodar o projeto em 3 comandos |
| `AGENTS.md` / `CLAUDE.md` | Constituição técnica do projeto (ver abaixo) |
| `ARCHITECTURE.md` | Mapa do código e invariantes; versão esquelética nesta fase (ver abaixo) |
| `.editorconfig`, linter, formatter | Padrão de código não negociável |
| Tipagem estrita (ex.: `tsconfig.json` com `strict: true`) | Primeiro filtro contra código alucinado |
| `docker-compose.yml` | Banco e dependências locais idênticos a produção |
| `.env.example` | Todas as variáveis, nenhum segredo real |
| `Makefile` ou scripts | `setup`, `dev`, `test`, `lint`, `build`, `migrate` |
| `.github/workflows/ci.yml` | Lint + tipos + testes + build a cada PR, bloqueante |
| Pre-commit hooks | Bloqueia commit que não passa no lint |
| Estrutura de pastas com 1 exemplo por camada | O agente copia o padrão que encontra |
| `.gitignore` + scanner de segredos | Evita chave de API commitada pelo agente |

### `AGENTS.md` — a constituição técnica

```markdown
# Instruções do projeto

## Stack
[linguagens, frameworks, versões]

## Comandos
- Instalar: `make setup`
- Rodar: `make dev`
- Testar: `make test`
- Lint: `make lint`

## Onde as coisas ficam
- Leia `ARCHITECTURE.md` antes de criar arquivo novo
- Não duplicar aqui o que está lá

## Convenções
- Padrão de nomenclatura
- Como escrever testes (framework, localização, padrão de nome)
- Padrão de tratamento de erro
- Padrão de commit

## Design
- Toda UI segue `docs/design/design-system.md`
- Nunca introduzir valor de cor ou espaçamento fora dos tokens

## Regras invioláveis
- Nunca commitar segredos
- Nunca alterar migration já aplicada
- Nunca desabilitar regra de lint ou teste para fazer o build passar
- Toda mudança de schema exige migration
- Toda rota nova exige teste de autorização

## Fora de escopo
[o que o agente não deve tocar sem autorização explícita]
```

### `ARCHITECTURE.md` — o mapa do código

Responde "onde eu mexo para fazer X?", não "como o módulo Y funciona por dentro". Nesta fase nasce esquelético: bird's eye view, estrutura pretendida e os invariantes que já saíram dos ADRs. É preenchido de verdade em E3.

```markdown
# Arquitetura

## Visão geral
[Um parágrafo: o que este sistema faz e qual problema resolve.]

## Bird's eye view
[1–3 parágrafos: como o dado atravessa o sistema, do request ao banco e de volta.]

## Code map
[Por módulo/pasta: o que faz e o que NÃO faz. Cite nomes, não links — links envelhecem.]

- `src/domain/` — regras de negócio puras. Não conhece HTTP nem banco.
- `src/api/` — rotas e validação de entrada. Não contém regra de negócio.
- `src/infra/` — acesso a banco e serviços externos.
- ...

## Invariantes arquiteturais
[O mais valioso do documento. Escreva as PROIBIÇÕES.]

- A camada de domínio não importa nada de `infra/`
- Nenhum acesso ao banco fora de `infra/repositories/`
- Nenhuma rota acessa o banco diretamente
- ...

## Fronteiras entre camadas
[Onde estão as costuras e o que atravessa cada uma.]

## Pontos de entrada
[Arquivos por onde começar a ler.]
```

> **Por que isso importa dobrado com agentes:** o problema que o documento resolve — "sou novo aqui, onde fica a coisa que faz X?" — é a situação do agente em **toda sessão nova**. Sem o mapa, ele busca por palavra-chave, acha um padrão qualquer e cria o arquivo no lugar errado.
>
> E os invariantes são o item que mais falta: são expressos como a *ausência* de algo, e o agente não consegue inferir uma proibição a partir da falta de exemplos. Se não estiver escrito, ele viola.

**Limite de tamanho:** algumas centenas de linhas, não milhares. Peça a um agente para gerar este arquivo e ele produz 800 linhas descrevendo cada função — o que envelhece em uma semana e vira ruído.

Referência canônica: https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html

**Checkpoint:** clone limpo em máquina nova roda com um comando e o CI está verde. Só então comece features.

---

## E2. Contratos antes do código

**Objetivo:** fixar as fronteiras onde o agente mais improvisa.

### Artefatos

| Artefato | Por quê |
|---|---|
| Schema do banco + primeira migration | Sem schema fixo, cada sessão inventa colunas |
| `openapi.yaml` ou schema equivalente | Contrato entre frontend e backend; permite gerar tipos |
| Tipos gerados a partir do schema | Erro de contrato vira erro de compilação, não bug em produção |
| Seed de dados de desenvolvimento | Ambiente reproduzível para você e para o agente |

> Contratos explícitos são o mecanismo mais eficaz contra deriva de arquitetura em sessões longas — o equivalente técnico do que os tokens fazem pela UI.

---

## E3. Walking skeleton

**Objetivo:** uma fatia vertical fina, ponta a ponta, **já em produção**.

Escolha a funcionalidade mais simples que atravesse todas as camadas — normalmente cadastro/login ou um CRUD único — e leve até o deploy real antes de construir largura.

### Artefatos

| Artefato | Descrição |
|---|---|
| Feature completa: UI → API → banco | Uma só, a mais simples, já usando o design system |
| Pipeline de deploy funcionando | Merge na main publica em staging |
| Ambiente de produção provisionado | Ainda que vazio |
| 1 teste e2e do fluxo crítico | O canário do pipeline |
| Health check + log estruturado | Prova que a observabilidade funciona |
| `ARCHITECTURE.md` preenchido | Code map real, agora que existe código de verdade em cada camada |

**Checkpoint:** você vai de commit a produção sem intervenção manual. Adiar isso é o erro mais caro de greenfield — quanto mais código existir antes do primeiro deploy, mais doloroso ele será.

---

## E4. Loop de implementação

A partir daqui, repetição do mesmo ciclo por feature.

```
Issue com critério de aceite (vem de P0) + referência de design (vem de P1/P2)
        ↓
Agente propõe plano  →  você aprova/corrige o PLANO, não o código
        ↓
Agente escreve teste que falha
        ↓
Agente implementa até o teste passar
        ↓
CI: lint + tipos + testes + build
        ↓
Você revisa o diff  →  aprova ou devolve
        ↓
Merge → deploy automático
```

### Regras operacionais

- **Uma issue, um PR, uma sessão.** Sessões longas acumulam contexto ruim e o agente passa a contradizer decisões anteriores.
- **PR pequeno.** Se você não revisa em 15 minutos, o escopo estava errado. Diff grande não é revisado — é aprovado no escuro.
- **Aprove o plano, não só o resultado.** Corrigir direção custa uma frase; corrigir 800 linhas custa uma tarde.
- **Nunca faça merge de código que você não leu.**
- **Teste antes da implementação.** Se o agente escreve o teste depois, ele escreve um teste que passa — não um teste que verifica o critério de aceite.
- **Verifique o teste contra a história, não contra o código.**

### Artefatos por ciclo

| Artefato | Descrição |
|---|---|
| Issue com critério de aceite | A especificação da tarefa |
| PR com descrição do que muda e por quê | Rastreabilidade |
| Testes novos cobrindo o critério de aceite | Automáticos |
| ADR, quando a mudança for arquitetural | Só decisões, não toda feature |
| Atualização de `AGENTS.md` ou `design-system.md` | Sempre que um padrão novo se estabelecer |
| Atualização de `ARCHITECTURE.md` | Só quando surge módulo novo, fronteira nova ou invariante novo — não a cada feature |

---

## E5. Segurança e observabilidade

Não é fase final — corre em paralelo desde E3. Listada separadamente porque é o que agentes mais omitem, já que raramente está no critério de aceite.

### Artefatos

| Artefato | Conteúdo |
|---|---|
| `docs/seguranca/threat-model.md` | O que protege, de quem, como |
| Checklist OWASP Top 10 aplicado | Verificado manualmente, feature a feature |
| Gestão de segredos | Cofre ou variáveis de ambiente; nunca no repositório |
| Scan de dependências no CI | Alerta de vulnerabilidade em pacote |
| Logs estruturados + correlação de requisição | Sem isso não há diagnóstico em produção |
| Rastreamento de erro | Você descobre o bug antes do usuário |
| Rotina de backup **testada** | Backup não restaurado não é backup |

> **Ponto cego mais comum com agentes:** autorização. O agente implementa a rota, o teste passa, e não há verificação de que o usuário A não acessa o dado do usuário B. Trate "teste de autorização" como item obrigatório da definition of done.

---

## E6. Release e medição

### Artefatos

| Artefato | Descrição |
|---|---|
| `CHANGELOG.md` | Gerado a partir dos commits |
| Runbook de operação | Como fazer rollback, restaurar backup, quem acionar |
| Métricas de entrega | Frequência de deploy, lead time, taxa de falha, tempo de recuperação |

As métricas de produto ficam no outro eixo (P3).

---

# Parte III — Sincronização entre os eixos

## Linha do tempo

```
PRODUTO/DESIGN   P0 ──── P1 ──── P2 ─────────────── P3 ────────────►
                  │       │       │                  ▲
                  │       │       │                  │
              [glossário][fluxos][tokens]        [feedback]
                  │       │       │                  │
                  ▼       ▼       ▼                  │
ENGENHARIA       E0 ── E1 ── E2 ── E3 ────── E4 ─────┘
                                              │
                                        E5 ───┴─── E6
```

Regra prática: **P0 → P1 → P2 precedem E3.** Você pode fazer E0, E1 e E2 em paralelo à prototipação — decidir stack e montar CI não depende do design final. Mas não construa o walking skeleton sem tokens definidos, ou a primeira tela já nasce fora do padrão.

## Pontos de contato

| Artefato produzido em | Consumido em | Consequência de pular |
|---|---|---|
| `glossario.md` (P0) | E2 — schema do banco | Três tabelas para a mesma entidade |
| `user-stories.md` (P0) | E4 — issues e testes | Testes que verificam o código, não o requisito |
| `fluxos.md` (P1) | E2 — desenho das rotas | API que não atende o fluxo real |
| `design-system.md` (P2) | E3 e E4 — toda UI | Cada sessão do agente inventa espaçamento e cor |
| Métricas (E6) | P3 — priorização | Backlog dirigido por opinião |
| Feedback (P3) | E4 — próximas issues | Produto que não evolui |

## Os documentos que o agente lê em toda sessão

São três, e há uma distinção importante entre eles:

**Prescritivos — dizem o que fazer**

- **`AGENTS.md`** — como escrever código neste projeto
- **`design-system.md`** — como desenhar interface neste projeto

**Descritivo — diz o que existe**

- **`ARCHITECTURE.md`** — onde as coisas ficam e quais fronteiras não se atravessa

Os dois primeiros são imperativos; o terceiro é indicativo. Por isso o `AGENTS.md` deve **referenciar** o `ARCHITECTURE.md`, nunca duplicá-lo — duas fontes para a mesma informação divergem em uma semana.

Os três precisam de **implementação de referência** no repositório. Regra escrita sem exemplo canônico não é seguida pelo agente: ele copia o que encontra no código, não o que está no documento.

---

# Parte IV — Artefatos mínimos

## Eixo Produto/Design

- [ ] PRD com escopo e fora-de-escopo
- [ ] Glossário do domínio
- [ ] User stories com critério de aceite testável
- [ ] Fluxos dos 3–5 caminhos principais, com estados de erro
- [ ] Wireframes ou protótipo navegável dos fluxos críticos
- [ ] `design-system.md` com tokens e regras
- [ ] Componentes canônicos implementados
- [ ] Padrões de estado (loading, vazio, erro, sucesso)
- [ ] Requisitos de acessibilidade definidos
- [ ] Métrica de sucesso instrumentada

## Eixo Engenharia

**Decisões**
- [ ] ADRs das 6 decisões estruturantes
- [ ] Diagrama C4 nível 1 e 2

**Repositório**
- [ ] `README.md` (rodar em 3 comandos)
- [ ] `AGENTS.md`
- [ ] `ARCHITECTURE.md` com code map e invariantes declarados
- [ ] Linter + formatter + tipagem estrita
- [ ] `docker-compose.yml` e `.env.example`
- [ ] Scripts padronizados
- [ ] CI bloqueante

**Contratos**
- [ ] Schema + migrations versionadas
- [ ] Especificação de API
- [ ] Seed de desenvolvimento

**Qualidade**
- [ ] Testes unitários das regras de negócio
- [ ] Testes de integração das rotas
- [ ] 1 a 3 testes e2e dos fluxos críticos
- [ ] Definition of done escrita

**Operação**
- [ ] Deploy automatizado com rollback
- [ ] Logs estruturados + rastreamento de erro
- [ ] Backup testado
- [ ] Runbook
- [ ] Métricas de entrega

---

# Parte V — Antipadrões

## Eixo Produto/Design

| Antipadrão | Sintoma | Mitigação |
|---|---|---|
| **Pular a prototipação** | "O agente gera a tela rápido, decido na hora" | P1 antes de E3, ao menos para fluxos críticos |
| **Protótipo promovido a produção** | Código de fachada virou base do produto | Trate como descartável, igual à PoC |
| **Prototipar o óbvio** | Três semanas de Figma para um CRUD interno | Fidelidade proporcional ao risco |
| **Design system só no papel** | Documento existe, código não segue | Componente canônico implementado para cada regra |
| **Deriva visual** | Cinco tons de cinza, quatro tamanhos de botão | Tokens + referência no `AGENTS.md` |
| **Acessibilidade como polimento final** | Descoberta na véspera do lançamento | Requisito na definition of done |

## Eixo Engenharia

| Antipadrão | Sintoma | Mitigação |
|---|---|---|
| **Fundações depois das features** | "Configuro CI quando tiver o que testar" | E1 antes de E3, sem exceção |
| **Merge no escuro** | PRs de 1500 linhas aprovados em 2 minutos | Limite de tamanho; recusar e pedir divisão |
| **Teste ajustado ao código** | Agente altera a asserção para o teste passar | Regra no `AGENTS.md`; revisar teste contra a história |
| **Dependência alucinada** | Pacote que não existe ou está abandonado | Verificar toda dependência nova manualmente |
| **Deriva de arquitetura** | Três padrões para a mesma coisa | Contratos + `AGENTS.md` + exemplo canônico |
| **Invariante não declarado** | Domínio importando infraestrutura; rota falando com o banco | Escrever as proibições no `ARCHITECTURE.md` |
| **Arquivo no lugar errado** | Agente cria pasta nova para o que já tinha lugar | `ARCHITECTURE.md` com code map, lido antes de criar arquivo |
| **`ARCHITECTURE.md` inflado** | 800 linhas descrevendo cada função, desatualizado em uma semana | Limitar a centenas de linhas; só o que muda 1–2 vezes por ano |
| **Segredo commitado** | Chave de API no histórico do git | Scanner no pre-commit e no CI |
| **Cobertura teatral** | 90% de cobertura, zero teste de autorização | Itens de segurança na definition of done |
| **Sistema que ninguém entende** | Você não sabe explicar o próprio código | Revisão real de todo diff; ADRs em dia |

## Integração entre eixos

| Antipadrão | Sintoma | Mitigação |
|---|---|---|
| **Engenharia sem produto** | Código pronto, ninguém sabe qual problema resolve | P0 antes de E0 |
| **Produto sem engenharia** | Meses de protótipo, nada em produção | Timebox em P1; E3 cedo |
| **Vocabulário divergente** | Tela diz "pedido", tabela diz `orders`, API diz `purchase` | Glossário único, consumido pelos dois eixos |
| **Design entregue tarde demais** | Skeleton construído, tokens chegam depois | P2 antes de E3 |

---

# Parte VI — Ordem de execução

1. **P0** — PRD, glossário, histórias
2. **P1** + **E0** em paralelo — prototipação e spikes técnicos, ambos descartáveis
3. **P2** + **E1** em paralelo — design system e fundações do repositório
4. **E2** — schema, contrato de API, tipos gerados
5. **E3** — walking skeleton até produção, já com tokens aplicados
6. **E4** — loop de features em PRs pequenos e revisados
7. **E5** — segurança e observabilidade, em paralelo desde o skeleton
8. **P3** + **E6** — medição de produto e de entrega, alimentando o próximo ciclo

O maior determinante de sucesso não é a stack nem a qualidade do agente. É quanto do passo 1 ao 3 você fez antes de escrever a primeira feature — porque é exatamente o trabalho que parece dispensável quando o código sai em segundos.
