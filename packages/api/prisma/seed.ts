/**
 * seed.ts — dados de desenvolvimento realistas
 * Executa: `npm run db:seed` (em packages/api)
 *
 * Cria:
 * - 5 autores
 * - 10 livros (2 por autor)
 * - 2 cópias por livro (20 no total)
 * - 2 leitores + 1 bibliotecário (senhas em texto: "senha123")
 * - 1 reserva ativa (expira em 12h a partir de agora)
 * - 1 empréstimo ativo
 * - avaliações para os livros
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, CopyStatus, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_COST = 12;
const PASSWORD_PLAIN = 'senha123';

const CAPAS_DIR = join(__dirname, '..', '..', '..', 'assets', 'capas');

/**
 * Caminho público da capa — relativo de propósito (ADR-0008): o mesmo dump de
 * banco serve dev, e2e e produção, que só diferem em quem responde /capas/.
 * Livro sem arquivo fica com `null` e o Catálogo desenha a placa tipográfica.
 */
function capaDe(isbn: string): string | null {
  return existsSync(join(CAPAS_DIR, `${isbn}.jpg`)) ? `/capas/${isbn}.jpg` : null;
}

async function main(): Promise<void> {
  console.info('🌱 Iniciando seed…');

  // ------------------------------------------------------------------
  // Limpar dados existentes (ordem importa: FK deps)
  // ------------------------------------------------------------------
  await prisma.review.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.copy.deleteMany();
  await prisma.book.deleteMany();
  await prisma.author.deleteMany();
  await prisma.user.deleteMany();

  // ------------------------------------------------------------------
  // Autores
  // ------------------------------------------------------------------
  const authors = await Promise.all([
    prisma.author.create({
      data: {
        name: 'José Saramago',
        slug: 'jose-saramago',
        bio: 'Nobel de Literatura 1998. Autor de "O Evangelho Segundo Jesus Cristo" e "Ensaio sobre a Cegueira".',
      },
    }),
    prisma.author.create({
      data: {
        name: 'Clarice Lispector',
        slug: 'clarice-lispector',
        bio: 'Uma das maiores escritoras do Brasil. Autora de "A Paixão Segundo G.H." e "A Hora da Estrela".',
      },
    }),
    prisma.author.create({
      data: {
        name: 'Machado de Assis',
        slug: 'machado-de-assis',
        bio: 'Fundador da Academia Brasileira de Letras. Autor de "Dom Casmurro" e "Memórias Póstumas de Brás Cubas".',
      },
    }),
    prisma.author.create({
      data: {
        name: 'Gabriel García Márquez',
        slug: 'gabriel-garcia-marquez',
        bio: 'Nobel de Literatura 1982. Pai do realismo mágico latino-americano.',
      },
    }),
    prisma.author.create({
      data: {
        name: 'Franz Kafka',
        slug: 'franz-kafka',
        bio: 'Escritor tcheco. Autor de "A Metamorfose" e "O Processo".',
      },
    }),
  ]);

  const [saramago, clarice, machado, garcia, kafka] = authors as [
    typeof authors[0],
    typeof authors[1],
    typeof authors[2],
    typeof authors[3],
    typeof authors[4],
  ];

  // ------------------------------------------------------------------
  // Livros (2 por autor)
  // ------------------------------------------------------------------
  const books = await Promise.all([
    // Saramago
    prisma.book.create({
      data: {
        isbn: '9780156027748',
        title: 'Ensaio sobre a Cegueira',
        genre: 'Ficção literária',
        synopsis: 'Uma epidemia de cegueira branca assola uma cidade anônima.',
        publishedAt: new Date('1995-01-01'),
        authorId: saramago.id,
      },
    }),
    prisma.book.create({
      data: {
        isbn: '9780156007498',
        title: 'O Nome de Deus',
        genre: 'Ficção literária',
        synopsis: 'Romance que interroga a fé e a identidade do homem moderno.',
        publishedAt: new Date('1984-01-01'),
        authorId: saramago.id,
      },
    }),
    // Clarice
    prisma.book.create({
      data: {
        isbn: '9780811219495',
        title: 'A Hora da Estrela',
        genre: 'Ficção brasileira',
        synopsis: 'A história de Macabéa, migrante nordestina no Rio de Janeiro.',
        publishedAt: new Date('1977-01-01'),
        authorId: clarice.id,
      },
    }),
    prisma.book.create({
      data: {
        isbn: '9780811219686',
        title: 'A Paixão Segundo G.H.',
        genre: 'Ficção brasileira',
        synopsis: 'Intensa experiência mística de uma mulher ao esmagitar uma barata.',
        publishedAt: new Date('1964-01-01'),
        authorId: clarice.id,
      },
    }),
    // Machado
    prisma.book.create({
      data: {
        isbn: '9788535910483',
        title: 'Dom Casmurro',
        genre: 'Romance clássico',
        synopsis: 'Bentinho e Capitu: o ciúme e a dúvida que permeiam um relacionamento.',
        publishedAt: new Date('1899-01-01'),
        authorId: machado.id,
      },
    }),
    prisma.book.create({
      data: {
        isbn: '9780143135036',
        title: 'Memórias Póstumas de Brás Cubas',
        genre: 'Romance clássico',
        synopsis: 'Um defunto autor narra sua própria vida com ironia e pessimismo.',
        publishedAt: new Date('1881-01-01'),
        authorId: machado.id,
      },
    }),
    // García Márquez
    prisma.book.create({
      data: {
        isbn: '9780307474728',
        title: 'Cem Anos de Solidão',
        genre: 'Realismo mágico',
        synopsis: 'A saga da família Buendía na fictícia Macondo.',
        publishedAt: new Date('1967-01-01'),
        authorId: garcia.id,
      },
    }),
    prisma.book.create({
      data: {
        isbn: '9780307387264',
        title: 'O Amor nos Tempos do Cólera',
        genre: 'Realismo mágico',
        synopsis: 'Uma história de amor que dura mais de cinquenta anos.',
        publishedAt: new Date('1985-01-01'),
        authorId: garcia.id,
      },
    }),
    // Kafka
    prisma.book.create({
      data: {
        isbn: '9780805210576',
        title: 'A Metamorfose',
        genre: 'Ficção absurda',
        synopsis: 'Gregor Samsa acorda transformado em um enorme inseto.',
        publishedAt: new Date('1915-01-01'),
        authorId: kafka.id,
      },
    }),
    prisma.book.create({
      data: {
        isbn: '9780805209983',
        title: 'O Processo',
        genre: 'Ficção absurda',
        synopsis: 'Josef K. é preso sem razão aparente e sem saber de que é acusado.',
        publishedAt: new Date('1925-01-01'),
        authorId: kafka.id,
      },
    }),
  ]);

  // ------------------------------------------------------------------
  // Capas — só para os Livros que já têm arquivo em assets/capas/
  // (baixados uma única vez por `make capas` e versionados no repositório)
  // ------------------------------------------------------------------
  for (const book of books) {
    const coverUrl = capaDe(book.isbn);
    if (coverUrl) {
      await prisma.book.update({ where: { id: book.id }, data: { coverUrl } });
    }
  }

  // ------------------------------------------------------------------
  // Cópias (2 por livro)
  // ------------------------------------------------------------------
  const allCopies: Array<{ id: string; bookId: string; status: CopyStatus }> = [];
  for (const book of books) {
    for (let i = 1; i <= 2; i++) {
      const copy = await prisma.copy.create({
        data: {
          code: `${book.isbn}-C${i}`,
          status: CopyStatus.available,
          bookId: book.id,
        },
      });
      allCopies.push(copy);
    }
  }

  // ------------------------------------------------------------------
  // Usuários
  // ------------------------------------------------------------------
  const passwordHash = await bcrypt.hash(PASSWORD_PLAIN, BCRYPT_COST);

  const leitor = await prisma.user.create({
    data: {
      name: 'Ana Lima',
      email: 'leitor@biblioteca.dev',
      passwordHash,
      role: Role.leitor,
      address: 'Rua das Flores, 123 — São Paulo, SP',
    },
  });

  // Segundo Leitor sem Reserva nem Empréstimo: existe para que se possa provar
  // que /me/reservations e /me/loans mostram só os registros de quem pediu —
  // com um único Leitor no banco, o isolamento é indistinguível de "tudo".
  await prisma.user.create({
    data: {
      name: 'Bruno Costa',
      email: 'leitor2@biblioteca.dev',
      passwordHash,
      role: Role.leitor,
      address: 'Rua da Consolação, 45 — São Paulo, SP',
    },
  });

  const bibliotecario = await prisma.user.create({
    data: {
      name: 'Carlos Mendes',
      email: 'bibliotecario@biblioteca.dev',
      passwordHash,
      role: Role.bibliotecario,
      address: 'Av. Paulista, 1000 — São Paulo, SP',
    },
  });

  // ------------------------------------------------------------------
  // Reserva ativa (expira em 12h — RN-1)
  // ------------------------------------------------------------------
  const reservedCopy = allCopies[0]; // Cópia 1 do primeiro livro
  if (!reservedCopy) throw new Error('Seed: nenhuma cópia encontrada');

  await prisma.copy.update({
    where: { id: reservedCopy.id },
    data: { status: CopyStatus.reserved },
  });

  const activeReservation = await prisma.reservation.create({
    data: {
      copyId: reservedCopy.id,
      userId: leitor.id,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
  });

  console.info(`  ✅ Reserva ativa criada: ${activeReservation.id}`);

  // ------------------------------------------------------------------
  // Empréstimo ativo (cópia 2 do primeiro livro)
  // ------------------------------------------------------------------
  const loanedCopy = allCopies[1];
  if (!loanedCopy) throw new Error('Seed: segunda cópia não encontrada');

  await prisma.copy.update({
    where: { id: loanedCopy.id },
    data: { status: CopyStatus.reserved },
  });

  const loanReservation = await prisma.reservation.create({
    data: {
      copyId: loanedCopy.id,
      userId: leitor.id,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      convertedAt: new Date(),
    },
  });

  await prisma.copy.update({
    where: { id: loanedCopy.id },
    data: { status: CopyStatus.loaned },
  });

  const loan = await prisma.loan.create({
    data: {
      copyId: loanedCopy.id,
      userId: leitor.id,
      librarianId: bibliotecario.id,
      reservationId: loanReservation.id,
      dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // vence em 14 dias
    },
  });

  console.info(`  ✅ Empréstimo ativo criado: ${loan.id}`);

  // ------------------------------------------------------------------
  // Avaliações (algumas nos livros disponíveis)
  // ------------------------------------------------------------------
  const reviews: Array<{ bookId: string; rating: number; text: string }> = [
    {
      bookId: books[0]?.id ?? '',
      rating: 5,
      text: 'Uma obra-prima perturbadora. A alegoria é devastadora.',
    },
    {
      bookId: books[2]?.id ?? '',
      rating: 5,
      text: 'Lispector em estado puro. Emocionante até a última página.',
    },
    {
      bookId: books[4]?.id ?? '',
      rating: 4,
      text: 'Clássico que nunca envelhece. Capitu é inocente.',
    },
    {
      bookId: books[6]?.id ?? '',
      rating: 5,
      text: 'Realismo mágico na sua forma mais sublime.',
    },
    {
      bookId: books[8]?.id ?? '',
      rating: 4,
      text: 'Curto e devastador. Kafka muda você.',
    },
  ];

  for (const r of reviews) {
    if (!r.bookId) continue;
    await prisma.review.create({
      data: {
        bookId: r.bookId,
        userId: leitor.id,
        rating: r.rating,
        text: r.text,
      },
    });
  }

  console.info(`
✅ Seed concluído.

  Usuários:
    leitor@biblioteca.dev        (papel: leitor — com Reserva e Empréstimo)
    leitor2@biblioteca.dev       (papel: leitor — sem nenhum registro)
    bibliotecario@biblioteca.dev (papel: bibliotecario)
    Senha para ambos: ${PASSWORD_PLAIN}

  Dados:
    ${authors.length} autores
    ${books.length} livros
    ${allCopies.length} cópias (${allCopies.filter((c) => c.status === 'available').length} disponíveis)
    1 reserva ativa
    1 empréstimo ativo
    ${reviews.length} avaliações
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
