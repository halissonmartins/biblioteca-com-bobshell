#!/usr/bin/env node
// Gera os favicons raster a partir da fonte vetorial única,
// packages/web/public/favicon.svg. Nenhum raster é desenhado à mão: se a marca
// mudar, edite o SVG e rode este script de novo.
//
//   packages/web/public/favicon.ico           16 + 32 px (PNG dentro de ICO)
//   packages/web/public/apple-touch-icon.png  180 px, chapa sem canto — o iOS
//                                             aplica a própria máscara e pinta
//                                             de preto o que for transparente
//   packages/theme/public/favicon-32x32.png   32 px, o que o tema de login do
//                                             Keycloak referencia
//
// Rasteriza com o Chromium do Playwright da suíte e2e/ (primeira vez:
// `make e2e-setup`). Depois de gerar o PNG do tema, rode `make theme-build` e
// versione o JAR.
//
// Uso: node scripts/gerar-favicons.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(join(raiz, 'e2e', 'package.json'))('playwright');

const svg = readFileSync(join(raiz, 'packages/web/public/favicon.svg'), 'utf8');
const semCanto = svg.replace(/\s+rx="[^"]*"/, '');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function png(fonte, tamanho, { transparente }) {
  const src = `data:image/svg+xml;base64,${Buffer.from(fonte).toString('base64')}`;
  await page.setViewportSize({ width: tamanho, height: tamanho });
  await page.setContent(
    `<body style="margin:0"><img src="${src}" width="${tamanho}" height="${tamanho}" style="display:block"></body>`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  return page.screenshot({
    clip: { x: 0, y: 0, width: tamanho, height: tamanho },
    omitBackground: transparente,
  });
}

/** ICO com as imagens em PNG — formato aceito por todo navegador atual. */
function ico(imagens) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // tipo: ícone
  cabecalho.writeUInt16LE(imagens.length, 4);

  let deslocamento = 6 + 16 * imagens.length;
  const entradas = imagens.map(({ tamanho, dados }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 0); // largura
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 1); // altura
    e.writeUInt8(0, 2); // paleta
    e.writeUInt8(0, 3); // reservado
    e.writeUInt16LE(1, 4); // planos
    e.writeUInt16LE(32, 6); // bits por pixel
    e.writeUInt32LE(dados.length, 8);
    e.writeUInt32LE(deslocamento, 12);
    deslocamento += dados.length;
    return e;
  });
  return Buffer.concat([cabecalho, ...entradas, ...imagens.map((i) => i.dados)]);
}

function gravar(relativo, dados) {
  const destino = join(raiz, relativo);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, dados);
  console.log(`✔ ${relativo} (${dados.length} bytes)`);
}

try {
  const px16 = await png(svg, 16, { transparente: true });
  const px32 = await png(svg, 32, { transparente: true });

  gravar('packages/web/public/favicon.ico', ico([
    { tamanho: 16, dados: px16 },
    { tamanho: 32, dados: px32 },
  ]));
  gravar('packages/web/public/apple-touch-icon.png', await png(semCanto, 180, { transparente: false }));
  gravar('packages/theme/public/favicon-32x32.png', px32);
} finally {
  await browser.close();
}
