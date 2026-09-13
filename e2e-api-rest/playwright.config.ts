import path from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * E2E do contrato HTTP — só a API REST (:3000), sem navegador.
 *
 * Diferença da suíte irmã (`e2e/`): aqui não há SPA, nem Chromium, nem
 * servidor de capas. Postgres e Keycloak vêm do `docker compose up -d`
 * (Keycloak puxa keycloak-db e Mailpit); o `webServer` abaixo sobe só a API,
 * e o `globalSetup` espera o discovery do realm, aplica migrations e roda o
 * seed antes do primeiro teste.
 *
 * Local:  make db-up  &&  npm install  &&  npm test   (nesta pasta)
 * CI:     job `e2e-api-rest-ci` em .github/workflows/ci.yml
 *
 * Nenhum teste usa `page`: a suíte inteira roda sobre `request` e contextos
 * HTTP próprios, então `playwright install` (download de navegador) é
 * desnecessário — local e no CI.
 */

/**
 * Confiança no Keycloak, declarada aqui e não herdada por acidente (issue #34).
 *
 * Os testes pedem token ao realm em https com a CA local de `make certs`, pelo
 * `request` do Playwright — Node puro, sem `ignoreHTTPSErrors`. Os workers nascem
 * depois de a config ser lida e herdam esta variável já no boot, que é o único
 * momento em que o Node a lê. O caminho é absoluto porque os workers rodam com
 * cwd nesta pasta; o relativo do antigo `.env.example` apontava para fora do
 * repositório, e a suíte só autenticava porque o global-setup desligava o TLS.
 *
 * O processo principal subiu antes desta linha e não a vê: por isso o
 * global-setup passa a CA na própria requisição do discovery.
 */
process.env['NODE_EXTRA_CA_CERTS'] = path.resolve(__dirname, '../keycloak/certs/ca.crt')

const API_PORT = 3000

const apiEnv = {
  DATABASE_URL:
    process.env['DATABASE_URL'] ??
    'postgresql://biblioteca:biblioteca@localhost:5432/biblioteca',
  // Não há segredo de assinatura: a API valida o token contra o JWKS do realm
  // (ADR-0009). O Keycloak vem do `docker compose up -d`, não do webServer.
  KEYCLOAK_ISSUER_URL:
    process.env['KEYCLOAK_ISSUER_URL'] ?? 'https://localhost:8443/realms/biblioteca',
  KEYCLOAK_AUDIENCE: process.env['KEYCLOAK_AUDIENCE'] ?? 'biblioteca-api',
  PORT: String(API_PORT),
  NODE_ENV: 'development',
  // Sem o perfil `obs` no ar, o exportador OTLP tentaria o Collector a cada
  // 15 s e encheria o log do webServer de erros de conexão.
  OTEL_SDK_DISABLED: 'true',
}

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './global-setup.ts',
  use: {
    // Sem `projects` nem device: nenhum teste lança navegador, e é isso que
    // dispensa o download do Chromium neste pacote.
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm --prefix ../packages/api run dev',
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: apiEnv,
    },
  ],
})
