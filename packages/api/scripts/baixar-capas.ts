/**
 * baixar-capas.ts — baixa as capas do acervo.
 * Executa: `make capas` (ou `npm run capas:baixar` em packages/api)
 *
 * Ingestão ÚNICA e offline (ADR-0008): a imagem sai da rede uma vez, é gravada
 * em assets/capas/<isbn>.jpg e versionada no repositório. Em runtime nada sai
 * da máquina — o nginx do docker-compose serve os arquivos e o Catálogo, o e2e
 * e o CI ficam determinísticos.
 *
 * Os ISBNs vêm do banco (rode depois de `make seed`), não de uma lista
 * duplicada aqui. Livro sem capa em nenhuma fonte simplesmente não ganha
 * arquivo: no Catálogo ele segue com a placa tipográfica.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CAPAS_DIR = join(__dirname, '..', '..', '..', 'assets', 'capas');

interface Fonte {
  nome: string;
  /** URLs candidatas para o mesmo ISBN, da melhor para a pior. */
  candidatas: (isbn: string) => Promise<string[]>;
}

/**
 * Opcional, e só para `make capas`: sem chave a API JSON do Google concede
 * ~100 consultas por dia **por IP** — num IP compartilhado ela já chega
 * estourada (medido: 429 "Queries per day"). Com chave, 1000/dia.
 * Vive em packages/api/.env, que o Prisma carrega antes deste script rodar.
 */
const CHAVE_GOOGLE = process.env['GOOGLE_BOOKS_API_KEY'];

/** Só o que este script lê da resposta da API — o resto do volume não importa. */
interface RespostaVolumes {
  items?: { volumeInfo?: { imageLinks?: Record<string, string> } }[];
}

/**
 * A API devolve a capa como URL com `zoom=1` (≈128px) e às vezes `edge=curl`,
 * que desenha uma dobra de página falsa na imagem. Sobe o zoom e tira a dobra.
 */
function ampliar(url: string): string {
  return url.replace('http://', 'https://').replace(/&zoom=\d+/, '&zoom=3').replace('&edge=curl', '');
}

/**
 * ISBN que não existe em fonte nenhuma. Serve para perguntar a cada fonte
 * **como ela diz "não tenho"** antes de começar — o Google responde 200 com
 * uma imagem, não com 404, e ela entraria no acervo como se fosse capa.
 */
const ISBN_INEXISTENTE = '0000000000000';

/**
 * O Google tem duas recusas diferentes, e só uma delas o ISBN inexistente
 * revela: volume desconhecido devolve um PNG de ~9 KB, enquanto volume
 * conhecido **sem capa** devolve uma chapa cinza de 800×1153 e 456 KB, igual
 * para todos. Esta é a assinatura dessa segunda, medida em 16/08/2026; a
 * detecção de duplicatas abaixo cobre o caso de ela mudar.
 */
const RECUSAS_CONHECIDAS = new Set([
  'ba8cd5043eedf32e39a4f328a4ec22f8a7dbbaba', // zoom=1
  'd42f3acc24f36b7e8a3337460d9545e3a22df51a', // zoom=2 (mesmo PNG do ISBN inexistente)
  '30afe778a50ade976e65764a4d219cae299f31e8', // zoom=3
  'a40e2eb35a62ca7928a84303b012e46ed7a7230f', // zoom=4
]);

/**
 * Fontes em ordem de preferência (ADR-0008).
 *
 * Google Books primeiro porque a URL é direta por ISBN — não precisa da API
 * JSON, e portanto não gasta a cota de ~100 requisições/dia que a
 * `googleapis.com/books/v1` impõe a chamadas sem chave.
 */
const FONTES: Fonte[] = [
  {
    // Primeiro porque a URL é direta por ISBN: não passa pela API JSON e
    // portanto não gasta cota nenhuma. Cobertura irregular, porém — o Google
    // devolve a chapa cinza para muitos ISBNs (medido: até "The Great Gatsby").
    nome: 'Google Books (URL direta)',
    // `zoom` é o tamanho: 4 ≈ 575×829, 3 ≈ 320×480, 1 ≈ 128×188. Pedimos o
    // maior primeiro — o card renderiza ~370px de largura em tela 2x, então
    // 128px chegaria borrado. Nem todo volume tem os níveis maiores.
    candidatas: (isbn) =>
      Promise.resolve(
        [4, 3, 1].map(
          (zoom) =>
            `https://books.google.com/books/content?vid=ISBN${isbn}&printsec=frontcover&img=1&zoom=${String(zoom)}`,
        ),
      ),
  },
  {
    // Segundo porque custa cota, mas resolve o ISBN até o volume e devolve a
    // URL da capa que aquele volume realmente tem — pega o que a URL direta
    // não acha.
    nome: 'Google Books (API JSON)',
    candidatas: async (isbn) => {
      const url =
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}` +
        (CHAVE_GOOGLE ? `&key=${CHAVE_GOOGLE}` : '');

      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) return []; // 429 = cota do dia estourada

      const corpo = (await res.json()) as RespostaVolumes;
      const links = corpo.items?.[0]?.volumeInfo?.imageLinks;
      if (!links) return [];

      // Do maior para o menor, na nomenclatura da própria API.
      return ['extraLarge', 'large', 'medium', 'thumbnail', 'smallThumbnail']
        .map((tamanho) => links[tamanho])
        .filter((u): u is string => typeof u === 'string')
        .map(ampliar);
    },
  },
  {
    nome: 'Open Library',
    // `default=false` devolve 404 quando não há capa; sem isso o Open Library
    // responde 200 com uma imagem cinza de 1 pixel.
    candidatas: (isbn) =>
      Promise.resolve([`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`]),
  },
];

/** Piso de bytes — recusa placeholder minúsculo antes mesmo de olhar o formato. */
const MIN_BYTES = 5 * 1024;

/**
 * Teto *preferencial* de bytes. O card tem 184px de largura, então 2 MB
 * (medido no zoom 4 de "A Paixão Segundo G.H.") é peso de página que ninguém
 * vê — mas capa pesada ainda é melhor que capa nenhuma, e nesse volume TODOS
 * os tamanhos passam de 1 MB. Acima do teto a candidata fica reservada e só
 * entra se nenhuma menor servir.
 */
const MAX_BYTES = 1024 * 1024;

/**
 * Proporção aceitável de uma capa (largura/altura). Não é purismo: no zoom
 * maior o Google devolve, para alguns volumes, uma **tira recortada** do topo
 * da capa (medido: 800×128 para A Metamorfose). A tira passa em tamanho e em
 * formato; o que a denuncia é a forma.
 */
const RAZAO_MIN = 0.5;
const RAZAO_MAX = 0.9;
const LARGURA_MIN = 200;

/** Dimensões de PNG e JPEG a partir dos bytes, sem dependência nova. */
function dimensoes(bytes: Buffer): { largura: number; altura: number } | null {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { largura: bytes.readUInt32BE(16), altura: bytes.readUInt32BE(20) };
  }

  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) return null;

  // Percorre os marcadores até um SOFn — só ele carrega altura e largura.
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marcador = bytes[i + 1] ?? 0;
    const ehSOF = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
    if (ehSOF) {
      return { altura: bytes.readUInt16BE(i + 5), largura: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  return null;
}

const sha1 = (bytes: Buffer): string => createHash('sha1').update(bytes).digest('hex');

/** O Open Library pede User-Agent identificável; o Google não se importa. */
const USER_AGENT = 'biblioteca-com-bobshell/dev (ingestão única de capas de seed)';
const INTERVALO_MS = 300;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jaExiste(caminho: string): Promise<boolean> {
  try {
    await access(caminho);
    return true;
  } catch {
    return false;
  }
}

interface Baixada {
  bytes: Buffer;
  fonte: string;
  largura: number;
  altura: number;
}

/** Baixa uma URL; null se a fonte não respondeu ou não devolveu imagem. */
async function baixar(url: string, falhas: string[], fonte: string): Promise<Buffer | null> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  } catch (erro) {
    falhas.push(`${fonte}: ${erro instanceof Error ? erro.message : String(erro)}`);
    return null;
  }

  await esperar(INTERVALO_MS);

  if (!res.ok) return null;
  if (!(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Assinatura das recusas: baixa, uma vez por execução, o que cada fonte
 * devolve para um ISBN inexistente. Tudo que sair igual a isso depois é recusa
 * disfarçada de capa.
 */
async function assinaturasDeRecusa(falhas: string[]): Promise<Set<string>> {
  const recusas = new Set(RECUSAS_CONHECIDAS);
  for (const fonte of FONTES) {
    for (const url of await candidatas(fonte, ISBN_INEXISTENTE, falhas)) {
      const bytes = await baixar(url, falhas, fonte.nome);
      if (bytes) recusas.add(sha1(bytes));
    }
  }
  return recusas;
}

/** As candidatas da fonte; lista vazia quando a própria fonte não respondeu. */
async function candidatas(fonte: Fonte, isbn: string, falhas: string[]): Promise<string[]> {
  try {
    return await fonte.candidatas(isbn);
  } catch (erro) {
    falhas.push(`${fonte.nome}: ${erro instanceof Error ? erro.message : String(erro)}`);
    return [];
  }
}

/** Primeira candidata que devolver uma capa de verdade; null se nenhuma devolver. */
async function buscarCapa(
  isbn: string,
  recusas: Set<string>,
  falhas: string[],
): Promise<Baixada | null> {
  let pesada: Baixada | null = null;

  for (const fonte of FONTES) {
    for (const url of await candidatas(fonte, isbn, falhas)) {
      const bytes = await baixar(url, falhas, fonte.nome);
      if (!bytes) continue;

      if (bytes.byteLength < MIN_BYTES) continue;
      if (recusas.has(sha1(bytes))) continue; // "não tenho essa capa"

      const dim = dimensoes(bytes);
      if (!dim || dim.largura < LARGURA_MIN) continue;
      const razao = dim.largura / dim.altura;
      if (razao < RAZAO_MIN || razao > RAZAO_MAX) continue; // tira recortada

      const capa = { bytes, fonte: fonte.nome, largura: dim.largura, altura: dim.altura };
      if (bytes.byteLength > MAX_BYTES) {
        pesada ??= capa;
        continue;
      }
      return capa;
    }
  }
  return pesada;
}

async function main(): Promise<void> {
  await mkdir(CAPAS_DIR, { recursive: true });

  const books = await prisma.book.findMany({
    select: { isbn: true, title: true },
    orderBy: { title: 'asc' },
  });

  if (books.length === 0) {
    throw new Error('Nenhum Livro no banco. Rode `make seed` antes de `make capas`.');
  }

  const falhasDeRede: string[] = [];
  const recusas = await assinaturasDeRecusa(falhasDeRede);

  let baixadas = 0;
  let semCapa = 0;
  let jaTinha = 0;
  /** sha1 → Livros que baixaram exatamente esses bytes. */
  const porConteudo = new Map<string, string[]>();

  for (const book of books) {
    const destino = join(CAPAS_DIR, `${book.isbn}.jpg`);

    if (await jaExiste(destino)) {
      jaTinha++;
      continue;
    }

    const capa = await buscarCapa(book.isbn, recusas, falhasDeRede);

    if (capa) {
      await writeFile(destino, capa.bytes);
      const hash = sha1(capa.bytes);
      porConteudo.set(hash, [...(porConteudo.get(hash) ?? []), book.isbn]);
      console.info(
        `✓ ${book.title} → assets/capas/${book.isbn}.jpg (${capa.fonte}, ${String(capa.largura)}×${String(capa.altura)}, ${String(Math.round(capa.bytes.byteLength / 1024))} KB)`,
      );
      baixadas++;
    } else {
      console.info(`— ${book.title}: nenhuma fonte tinha capa (segue com a placa)`);
      semCapa++;
    }
  }

  // Dois Livros não têm a mesma capa. Bytes repetidos são a recusa da fonte
  // com um rosto novo — apaga os dois, que é o que a placa já resolve.
  for (const [, isbns] of porConteudo) {
    if (isbns.length < 2) continue;
    console.info(
      `⚠ ${String(isbns.length)} Livros vieram com a MESMA imagem (${isbns.join(', ')}) — é recusa da fonte, não capa. Descartados.`,
    );
    for (const isbn of isbns) {
      await rm(join(CAPAS_DIR, `${isbn}.jpg`), { force: true });
      baixadas--;
      semCapa++;
    }
  }

  console.info(
    `\n${String(baixadas)} baixada(s), ${String(jaTinha)} já existia(m), ${String(semCapa)} sem capa.`,
  );

  // Toda fonte fora do ar é diferente de "estes Livros não têm capa" — e o
  // silêncio entre os dois casos é justamente o que faz alguém commitar um
  // acervo sem imagem achando que o acervo é que não tem.
  if (baixadas === 0 && falhasDeRede.length > 0) {
    throw new Error(
      `Nenhuma capa baixada e as fontes não responderam. Primeira falha: ${falhasDeRede[0] ?? ''}`,
    );
  }

  if (baixadas > 0) {
    console.info('Rode `make seed` para o banco apontar para elas, e commite os .jpg.');
  }
}

main()
  .catch((erro: unknown) => {
    console.error('Falha ao baixar as capas:', erro);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
