/**
 * seed-perf.ts — dados de PERFORMANCE em massa para os testes K6
 * Executa: `npm run db:seed:perf` (em packages/api)
 *
 * Popula o acervo na escala do PRD (~250k Livros) para que a busca do catálogo
 * (`ILIKE '%termo%'` sobre `books.title` / `authors.name`) seja exercitada em
 * condições realistas — só assim o índice trigram (pg_trgm) tem efeito mensurável.
 *
 * Estratégia: bulk insert via `INSERT ... SELECT FROM generate_series(...)` para
 * evitar centenas de milhares de round-trips. Todos os registros usam o prefixo
 * `PERF-` (isbn/code) e `autor-perf-` (slug) para não colidir com o seed de dev
 * e permitir limpeza seletiva.
 *
 * Variáveis de ambiente:
 * - PERF_BOOKS   (default 250000) — total de Livros a inserir
 * - PERF_AUTHORS (default 5000)   — total de Autores a inserir
 *
 * Flags:
 * - --reset — remove os dados PERF- existentes antes de inserir
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BOOKS = Number(process.env['PERF_BOOKS'] ?? 250_000);
const AUTHORS = Number(process.env['PERF_AUTHORS'] ?? 5_000);
const RESET = process.argv.includes('--reset');

// Vocabulário para compor títulos pesquisáveis (a busca do catálogo casa por
// substring case-insensitive; ex.: `search=amor` retorna milhares de Livros).
const TITLE_WORDS = [
  'Amor',
  'Cidade',
  'Silêncio',
  'Memória',
  'Tempo',
  'Sombra',
  'Luz',
  'Rio',
  'Casa',
  'Vento',
  'Mar',
  'Estrela',
];

const GENRES = ['Romance', 'Ficção', 'Poesia', 'Conto', 'Ensaio', 'Biografia'];

/** Monta um literal de array SQL a partir de strings (com escape de aspas). */
function sqlArray(items: string[]): string {
  const escaped = items.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
  return `ARRAY[${escaped}]`;
}

async function reset(): Promise<void> {
  console.info('🧹 Removendo dados PERF- existentes…');
  // Ordem respeita as FKs (loans → reservations → copies → books → authors).
  await prisma.$executeRawUnsafe(
    `DELETE FROM loans WHERE "copyId" IN (SELECT id FROM copies WHERE code LIKE 'PERF-%')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM reservations WHERE "copyId" IN (SELECT id FROM copies WHERE code LIKE 'PERF-%')`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM reviews WHERE "bookId" IN (SELECT id FROM books WHERE isbn LIKE 'PERF-%')`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM copies WHERE code LIKE 'PERF-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM books WHERE isbn LIKE 'PERF-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM authors WHERE slug LIKE 'autor-perf-%'`);
}

async function main(): Promise<void> {
  console.info(`🌱 Seed de performance: ${BOOKS} livros, ${AUTHORS} autores…`);

  if (RESET) {
    await reset();
  } else {
    const existing = await prisma.book.count({ where: { isbn: { startsWith: 'PERF-' } } });
    if (existing > 0) {
      console.error(
        `❌ Já existem ${existing} livros PERF-. Rode com --reset para recriar ` +
          `(ex.: npm run db:seed:perf -- --reset).`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const words = sqlArray(TITLE_WORDS);
  const genres = sqlArray(GENRES);
  const nWords = TITLE_WORDS.length;
  const nGenres = GENRES.length;

  // ------------------------------------------------------------------
  // Autores
  // ------------------------------------------------------------------
  console.info('  → inserindo autores…');
  await prisma.$executeRawUnsafe(`
    INSERT INTO authors (id, name, slug, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'Autor Perf ' || g, 'autor-perf-' || g, now(), now()
    FROM generate_series(1, ${AUTHORS}) g
  `);

  // ------------------------------------------------------------------
  // Livros (autor distribuído por módulo; título de vocabulário pesquisável)
  // ------------------------------------------------------------------
  console.info('  → inserindo livros…');
  await prisma.$executeRawUnsafe(`
    WITH ord_authors AS (
      SELECT id, row_number() OVER (ORDER BY slug) AS rn
      FROM authors
      WHERE slug LIKE 'autor-perf-%'
    )
    INSERT INTO books (id, isbn, title, genre, "authorId", "createdAt", "updatedAt")
    SELECT
      gen_random_uuid()::text,
      'PERF-' || g,
      (${words})[(g % ${nWords}) + 1] || ' ' || (${words})[((g / ${nWords}) % ${nWords}) + 1] || ' #' || g,
      (${genres})[(g % ${nGenres}) + 1],
      a.id,
      now(),
      now()
    FROM generate_series(1, ${BOOKS}) g
    JOIN ord_authors a ON a.rn = (g % ${AUTHORS}) + 1
  `);

  // ------------------------------------------------------------------
  // Cópias (2 por Livro, todas disponíveis)
  // ------------------------------------------------------------------
  console.info('  → inserindo cópias (2 por livro)…');
  await prisma.$executeRawUnsafe(`
    INSERT INTO copies (id, code, status, "bookId", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, b.isbn || '-' || c, 'available'::"CopyStatus", b.id, now(), now()
    FROM books b
    CROSS JOIN generate_series(1, 2) c
    WHERE b.isbn LIKE 'PERF-%'
  `);

  // ------------------------------------------------------------------
  // ANALYZE — atualiza as estatísticas do planner após o bulk insert
  // (sem isso o Postgres pode ignorar índices e escolher planos ruins).
  // ------------------------------------------------------------------
  console.info('  → ANALYZE (estatísticas do planner)…');
  await prisma.$executeRawUnsafe('ANALYZE authors, books, copies');

  // ------------------------------------------------------------------
  // Resumo
  // ------------------------------------------------------------------
  const [authors, books, copies] = await Promise.all([
    prisma.author.count({ where: { slug: { startsWith: 'autor-perf-' } } }),
    prisma.book.count({ where: { isbn: { startsWith: 'PERF-' } } }),
    prisma.copy.count({ where: { code: { startsWith: 'PERF-' } } }),
  ]);

  console.info('\n✅ Seed de performance concluído.');
  console.info(`   ${authors} autores`);
  console.info(`   ${books} livros`);
  console.info(`   ${copies} cópias (todas disponíveis)`);
}

main()
  .catch((err: unknown) => {
    console.error('❌ Erro no seed de performance:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
