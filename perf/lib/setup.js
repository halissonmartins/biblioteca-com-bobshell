// setup.js — helpers para a função setup() dos cenários K6.
// Faz login dos dois papéis e monta um pool de bookIds reais do catálogo.

import http from 'k6/http';
import { fail } from 'k6';
import { BASE_URL, READER, LIBRARIAN } from './config.js';

/** Autentica e retorna o accessToken (data.accessToken do POST /auth/login). */
export function login(credentials) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(credentials), {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status !== 200) {
    fail(`login falhou para ${credentials.email}: status ${res.status} ${res.body}`);
  }
  const token = res.json('data.accessToken');
  if (!token) {
    fail(`login sem accessToken para ${credentials.email}`);
  }
  return token;
}

/**
 * Coleta um pool de bookIds paginando o catálogo (GET /books).
 * @param {number} [pages] quantidade de páginas de 100 itens a coletar
 */
export function collectBookIds(pages = 5) {
  const ids = [];
  for (let page = 1; page <= pages; page++) {
    const res = http.get(`${BASE_URL}/books?page=${page}&pageSize=100`);
    if (res.status !== 200) {
      fail(`GET /books falhou (page ${page}): status ${res.status}`);
    }
    // Envelope da API: { data: { data: [...livros], pagination: {...} } }
    const books = res.json('data.data') || [];
    for (const book of books) {
      ids.push(book.id);
    }
    if (books.length < 100) break; // última página
  }
  if (ids.length === 0) {
    fail('nenhum livro encontrado — rode o seed (`make seed` ou `make perf-seed`)');
  }
  return ids;
}

/** setup() completo para cenários de leitura pública (catálogo/detalhes). */
export function publicSetup() {
  return { bookIds: collectBookIds() };
}

/** setup() para cenários do leitor autenticado. */
export function readerSetup() {
  return { readerToken: login(READER), bookIds: collectBookIds() };
}

/** setup() para os fluxos de reserva → empréstimo → devolução. */
export function fullSetup() {
  return {
    readerToken: login(READER),
    librarianToken: login(LIBRARIAN),
    bookIds: collectBookIds(),
  };
}

/** Item aleatório de um array (usado pelos VUs). */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
