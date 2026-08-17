// setup.js — helpers para a função setup() dos cenários K6.
// Faz login dos dois papéis e monta um pool de bookIds reais do catálogo.

import http from 'k6/http';
import { fail } from 'k6';
import {
  BASE_URL,
  READER,
  LIBRARIAN,
  TOKEN_ENDPOINT,
  KEYCLOAK_CLIENT_ID,
} from './config.js';

/**
 * Autentica no Keycloak e retorna o access token (ADR-0009).
 *
 * Usa o Direct Access Grant do client `biblioteca-web` — o mesmo caminho do
 * Playwright, e o motivo de o grant continuar ligado nesta fase. O token vale
 * 15 min: cenário com DURATION acima disso precisa relogar por iteração.
 */
export function login(credentials) {
  const res = http.post(
    TOKEN_ENDPOINT,
    {
      grant_type: 'password',
      client_id: KEYCLOAK_CLIENT_ID,
      username: credentials.email,
      password: credentials.password,
    },
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  if (res.status !== 200) {
    fail(
      `login falhou para ${credentials.email}: status ${res.status} ${res.body}. ` +
        'O Keycloak está no ar? `docker compose up -d --wait`',
    );
  }
  const token = res.json('access_token');
  if (!token) {
    fail(`login sem access_token para ${credentials.email}`);
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
