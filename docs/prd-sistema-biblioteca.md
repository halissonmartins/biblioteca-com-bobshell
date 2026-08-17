# PRD — Sistema de Biblioteca

| Campo | Valor |
| --- | --- |
| Produto | Sistema de catálogo, reservas e empréstimos de biblioteca |
| Versão | 1.0 |
| Status | Rascunho |
| Data | 14/08/2026 |

---

## 1. Visão geral

Uma biblioteca com **250 mil livros** e **10 mil leitores ativos** precisa de um sistema web que permita aos leitores descobrir o acervo, consultar disponibilidade e reservar livros on-line, e aos bibliotecários gerenciar o ciclo de empréstimo e devolução no balcão.

O modelo de operação é **híbrido**: a reserva acontece on-line, mas a retirada do livro é sempre presencial. O sistema é o elo entre esses dois momentos — ele garante que o livro reservado esteja separado quando o leitor chegar, e que a reserva seja liberada se ele não aparecer.

## 2. Problema e oportunidade

Hoje o leitor não tem como saber se um livro está disponível antes de ir até a biblioteca, e o bibliotecário não tem visibilidade centralizada de quem reservou o quê. Isso gera deslocamentos inúteis, livros parados em reserva informal e filas no balcão.

## 3. Objetivos

- Permitir que o leitor confirme a disponibilidade de um livro e garanta sua retirada sem ir até a biblioteca.
- Reduzir o tempo de atendimento no balcão para operações de empréstimo e devolução.
- Dar ao bibliotecário visão única e filtrável de reservas e empréstimos ativos.
- Sustentar a descoberta do acervo por catálogo, autor e avaliações de outros leitores.

### Não-objetivos (fora de escopo v1)

- Empréstimo ou leitura de livros digitais.
- Pagamento de multas ou cobrança on-line.
- Renovação automática de empréstimos.
- Recomendação personalizada por algoritmo.
- Aplicativo móvel nativo.

## 4. Personas

| Persona | Descrição | Necessidade principal |
| --- | --- | --- |
| **Leitor** | Usuário final do acervo. Visita o site semanalmente e pega até 3 livros por mês. | Descobrir livros e garantir a retirada antes de se deslocar. |
| **Bibliotecário** | Funcionário no balcão. Opera empréstimos e devoluções com o leitor presente. | Executar operações em segundos e localizar rapidamente reservas por usuário. |

## 5. Requisitos funcionais

### 5.1 Leitor

| ID | Requisito |
| --- | --- |
| RF-L1 | Navegar pelo catálogo de livros. |
| RF-L2 | Ver os detalhes estendidos de um livro: título, autor, sinopse, cópias físicas disponíveis e avaliações dos leitores. |
| RF-L3 | Reservar um livro quando houver disponibilidade. |
| RF-L4 | Ver suas reservas ainda não expiradas. |
| RF-L5 | Listar os livros que pegou emprestado e as respectivas datas de vencimento. |
| RF-L6 | Visualizar os detalhes de um autor, incluindo todos os livros que ele publicou. |
| RF-L7 | Criar a própria conta e entrar no sistema. Fase 1: **qualquer e-mail, sem verificação**; quem se cadastra nasce leitor (RN-7). Ver [ADR-0009](decisoes/0009-identidade-com-keycloak.md) e [seguranca.md](seguranca.md). |

### 5.2 Bibliotecário

| ID | Requisito |
| --- | --- |
| RF-B1 | Visualizar todas as reservas de um livro, incluindo sua data de expiração. |
| RF-B2 | Listar os livros emprestados, incluindo seus vencimentos. |
| RF-B3 | Filtrar reservas e livros emprestados por usuário. |
| RF-B4 | Emprestar livros para leitores. |
| RF-B5 | Marcar um livro como devolvido. |

## 6. Regras de negócio

| ID | Regra |
| --- | --- |
| RN-1 | Uma reserva **expira automaticamente 12 horas** após ser criada. |
| RN-2 | Reservas podem ser feitas **on-line**; o empréstimo só pode ser efetivado **presencialmente**, por um bibliotecário. |
| RN-3 | Uma reserva só pode ser criada se houver ao menos uma cópia física disponível no momento. |
| RN-4 | Uma cópia reservada não fica disponível para outros leitores enquanto a reserva estiver ativa. |
| RN-5 | Ao expirar, a reserva libera a cópia de volta ao acervo disponível. |
| RN-6 | Só reservas ativas (não expiradas) podem ser convertidas em empréstimo. |
| RN-7 | Um usuário tem função de **leitor** ou **bibliotecário**; ações de balcão são restritas a bibliotecários. |
| RN-8 | O empréstimo vence em **7 dias corridos** a partir da efetivação. O bibliotecário pode ajustar a data no balcão. |

## 7. Requisitos de performance

| ID | Requisito | Alvo |
| --- | --- | --- |
| RNF-1 | Carregamento da página de detalhes do livro, com disponibilidade e avaliações recentes | < **300 ms** |
| RNF-2 | Leitor concluir a reserva de um livro | < **3 s** |
| RNF-3 | Bibliotecário emprestar um livro ou marcá-lo como devolvido | < **3 s** |
| RNF-4 | Leitor ver a lista de suas reservas e livros emprestados | < **500 ms** |

## 8. Dimensionamento e padrão de uso

### Premissas

| Métrica | Valor |
| --- | --- |
| Leitores ativos | 10.000 |
| Livros no acervo | 250.000 |
| Frequência de visita ao site | Semanal |
| Frequência de empréstimo | Mensal |
| Livros reservados/pegos por leitor | Até 3 por mês |
| Livros navegados antes de reservar | 25 |
| Avaliações lidas por livro | Raramente mais de 5 |
| Avaliações escritas | 1 a cada 5 livros lidos |

### Consequências para o produto

- **Volume de leitura de detalhes:** ~25 livros navegados × 3 reservas × 10k leitores ≈ **750 mil visualizações de detalhe por mês**, contra ~30 mil reservas — uma carga aproximadamente **25:1 de leitura sobre escrita**. A tela de detalhes do livro é o caminho crítico do produto.
- **Volume absoluto é baixo:** a média fica na casa de poucas requisições por segundo. O desafio de RNF-1 é de **latência**, não de throughput — o alvo de 300 ms deve ser atingido por modelagem e leitura eficiente, não por escala horizontal.
- **Avaliações são poucas e lidas em pequena quantidade:** ~6 mil avaliações escritas por mês e no máximo 5 exibidas por livro. Basta manter as avaliações mais recentes acessíveis junto ao livro; não é necessário paginar profundamente na v1.
- **Disponibilidade é o dado mais quente:** aparece na tela de detalhes, muda a cada reserva, empréstimo, devolução e expiração de reserva. Precisa ser consistente com o que o bibliotecário vê no balcão.
- **Expiração em 12h gera trabalho de fundo:** ~30 mil reservas/mês, das quais uma fração expira, exigem um mecanismo de liberação automática (expiração por tempo ou verificação na leitura).

## 9. Modelo de dados

### Entidades

| Entidade | Propriedades | Id único |
| --- | --- | --- |
| **Livro** | Título, autor, gênero, imagem da capa, sinopse | ISBN |
| **Usuário** | Nome, endereço, função (leitor ou bibliotecário) | Email / número de usuário |
| **Autor** | Nome, apelido | — (a definir) |
| **Reservado** | Livro, usuário, data de reserva, data de retorno/expiração | — (a definir) |
| **Emprestado** | Livro, usuário, data de empréstimo, data de retorno | — (a definir) |
| **Avaliação** | Texto da avaliação, classificação, nome do avaliador, livro | — (a definir) |

### Relacionamentos

- Um **autor** publica muitos **livros**; um livro tem um ou mais autores (RF-L6).
- Um **livro** tem muitas **avaliações**; uma avaliação pertence a um livro e a um usuário.
- Uma **reserva** liga um usuário a um livro, com prazo de 12h.
- Um **empréstimo** liga um usuário a um livro, com data de vencimento.

### Pontos em aberto

- Definir identificadores únicos para Autor, Reservado, Emprestado e Avaliação.
- Modelar **cópias físicas** como entidade própria ou como contador de disponibilidade no livro — decisão que afeta diretamente RN-3, RN-4 e a precisão de RF-L2.
- Definir se avaliações recentes são embutidas junto ao livro para atender RNF-1.

## 10. Critérios de aceite

- [ ] Todos os requisitos RF-L1 a RF-L7 e RF-B1 a RF-B5 implementados e testados.
- [ ] Reserva criada expira e libera a cópia automaticamente após 12h (RN-1, RN-5).
- [ ] Tentativa de reserva sem cópia disponível é bloqueada com mensagem clara (RN-3).
- [ ] Leitor não consegue efetivar empréstimo sozinho; apenas bibliotecário (RN-2, RN-7).
- [ ] RNF-1 a RNF-4 verificados em teste de carga com volume equivalente a 10k leitores ativos e 250k livros.
- [ ] Disponibilidade exibida ao leitor reflete o estado visto pelo bibliotecário.
- [ ] Visitante cria conta com qualquer e-mail, entra como leitor e consegue reservar (RF-L7).
- [ ] Conta recém-criada não consegue executar ação de balcão (RN-2, RN-7).

## 11. Métricas de sucesso

| Métrica | Alvo |
| --- | --- |
| Taxa de conversão reserva → empréstimo | > 70% (indica que a reserva evita deslocamento inútil) |
| Taxa de reservas expiradas sem retirada | < 20% |
| p95 de carregamento da página de detalhes | < 300 ms |
| Tempo médio de atendimento no balcão | < 3 s por operação |
| Adoção: leitores que usam reserva on-line | > 50% dos leitores ativos em 6 meses |

## 12. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Disponibilidade dessincronizada entre site e balcão | Leitor vai à biblioteca e não encontra o livro | Fonte única de verdade para o estado da cópia; validação no ato do empréstimo |
| Reservas especulativas ocupando cópias | Acervo artificialmente indisponível | Expiração de 12h; avaliar limite de reservas ativas por leitor |
| Alvo de 300 ms na página de detalhes | Requisito central não atendido | Modelar disponibilidade e avaliações recentes junto ao livro; evitar múltiplas consultas em cascata |
| Ausência de id único para 4 entidades | Bloqueia implementação | Resolver na fase de modelagem, antes do desenvolvimento |
