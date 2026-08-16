/**
 * packages/api/src/infra/telemetry/metrics.ts
 * Registro ÚNICO dos instrumentos de métrica customizados.
 *
 * ⚠️ Só pode ser carregado DEPOIS de infra/telemetry/otel.ts — ver REGRA DE OURO lá.
 *
 * Sem SDK ativo (testes), o @opentelemetry/api devolve um NoopMeter e todo
 * .add()/.record() é no-op. Importar este módulo é seguro em qualquer contexto.
 *
 * ⚠️ Cardinalidade: NUNCA usar id de Livro, Leitor ou Reserva como atributo de
 * métrica — cada valor distinto vira uma série no Prometheus. Ids são atributo
 * de span, não de métrica. Todos os atributos abaixo têm no máximo 3 valores.
 *
 * Ver a tabela completa em docs/observabilidade.md.
 */

import { metrics } from '@opentelemetry/api';
import type { Counter, Histogram } from '@opentelemetry/api';

export const meter = metrics.getMeter('biblioteca.api', '0.0.0');

// ── Reservas ────────────────────────────────────────────────────────────────

/** Atributo `resultado`: 'criada' | 'sem_copia' (RN-3 barrando a Reserva). */
export const reservasCriadas: Counter = meter.createCounter('biblioteca.reservas.criadas', {
  description: 'Tentativas de criação de Reserva (RF-L3, RN-3)',
  unit: '{reserva}',
});

export const reservasExpiradas: Counter = meter.createCounter('biblioteca.reservas.expiradas', {
  description: 'Reservas expiradas pelo job de fundo (RN-1, RN-5)',
  unit: '{reserva}',
});

/**
 * Alimenta a métrica de produto "conversão Reserva → Empréstimo > 70%" (PRD §11).
 * Fronteiras cobrem a janela de 12 h da RN-1: 5 min … 12 h.
 */
export const conversaoDuracao: Histogram = meter.createHistogram(
  'biblioteca.reserva.conversao.duracao',
  {
    description: 'Tempo entre a criação da Reserva e a efetivação do Empréstimo',
    unit: 's',
    advice: {
      explicitBucketBoundaries: [300, 900, 1800, 3600, 7200, 14400, 21600, 32400, 43200],
    },
  },
);

// ── Empréstimos e Devoluções ────────────────────────────────────────────────

export const emprestimosEfetivados: Counter = meter.createCounter(
  'biblioteca.emprestimos.efetivados',
  {
    description: 'Empréstimos efetivados por Bibliotecário no balcão (RF-B4, RN-2)',
    unit: '{emprestimo}',
  },
);

/** Atributo `situacao`: 'em_dia' | 'atrasado' (em relação ao dueAt — RN-8). */
export const devolucoes: Counter = meter.createCounter('biblioteca.devolucoes', {
  description: 'Devoluções registradas, em dia ou em atraso (RF-B5, RN-8)',
  unit: '{devolucao}',
});

// ── Catálogo ────────────────────────────────────────────────────────────────

/** Atributo `busca_vazia`: 'true' | 'false'. */
export const catalogoBuscas: Counter = meter.createCounter('biblioteca.catalogo.buscas', {
  description: 'Buscas no catálogo (RF-L1)',
  unit: '{busca}',
});

export const catalogoResultados: Histogram = meter.createHistogram(
  'biblioteca.catalogo.resultados',
  {
    description: 'Número de Livros retornados por busca do catálogo',
    unit: '{livro}',
    advice: { explicitBucketBoundaries: [0, 1, 5, 10, 25, 50, 100, 500, 1000, 10000] },
  },
);

// ── Autenticação e autorização ──────────────────────────────────────────────

/** Atributos `papel_requerido` e `papel_usuario` — visibilidade sobre RN-2/RN-7. */
export const autorizacaoNegacoes: Counter = meter.createCounter(
  'biblioteca.autorizacao.negacoes',
  {
    description: 'Acessos negados por papel insuficiente (RN-2, RN-7)',
    unit: '{negacao}',
  },
);

/** Atributo `motivo`: 'sem_token' | 'expirado' | 'invalido'. */
export const autenticacaoFalhas: Counter = meter.createCounter('biblioteca.autenticacao.falhas', {
  description: 'Requisições rejeitadas na autenticação JWT',
  unit: '{falha}',
});

/** Atributo `resultado`: 'sucesso' | 'falha'. */
export const logins: Counter = meter.createCounter('biblioteca.logins', {
  description: 'Tentativas de login',
  unit: '{login}',
});

// ── Infraestrutura ──────────────────────────────────────────────────────────

/**
 * Nome da semconv estável (db.client.operation.duration) em vez de um nome
 * próprio: dashboards e alertas prontos da comunidade funcionam sem tradução.
 * Atributos: db.system.name, db.operation.name, db.collection.name.
 */
export const dbOperationDuration: Histogram = meter.createHistogram(
  'db.client.operation.duration',
  {
    description: 'Duração das operações do Prisma',
    unit: 's',
    advice: {
      explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    },
  },
);

/**
 * Atributos `nome_job` e `resultado` ('sucesso' | 'erro').
 *
 * ⚠️ O atributo NÃO pode se chamar `job`: o exporter Prometheus do Collector já
 * usa `job` como label (derivado de service.name) e descarta a série inteira
 * com "duplicate label names in constant and variable labels".
 */
export const jobExecucoes: Counter = meter.createCounter('biblioteca.job.execucoes', {
  description: 'Execuções de jobs de fundo',
  unit: '{execucao}',
});

export const jobDuracao: Histogram = meter.createHistogram('biblioteca.job.duracao', {
  description: 'Duração das execuções de jobs de fundo',
  unit: 's',
  advice: { explicitBucketBoundaries: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 60] },
});
