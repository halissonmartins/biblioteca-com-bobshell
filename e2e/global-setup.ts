import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

/**
 * Prepara o ambiente antes da suíte E2E: espera o Keycloak, aplica migrations e
 * popula o seed. Roda uma única vez, antes do primeiro teste — mas **depois** do
 * webServer: o Playwright sobe API e Web primeiro e só então chama este setup.
 * Assume Postgres e Keycloak no ar (docker compose up -d, local e no CI).
 *
 * O Prisma Client é pré-requisito, não passo daqui (`make setup` o gera; no CI,
 * passo próprio antes do `npm test`). Com a API já de pé, um `prisma generate`
 * aqui chegaria tarde — ela importou o client antigo — e no Windows falha com
 * EPERM, porque a DLL do query engine está aberta (issue #33).
 */

const ISSUER =
  process.env['KEYCLOAK_ISSUER_URL'] ?? 'https://localhost:8443/realms/biblioteca'

/** A mesma CA que `playwright.config.ts` entrega aos workers por NODE_EXTRA_CA_CERTS. */
const CA_LOCAL = path.resolve(__dirname, '../keycloak/certs/ca.crt')

/**
 * GET com a CA local passada na própria requisição.
 *
 * Este setup roda no processo principal do Playwright, que subiu antes de a
 * config declarar NODE_EXTRA_CA_CERTS — a trust store dele não tem a CA. Até a
 * issue #34 o remédio era `NODE_TLS_REJECT_UNAUTHORIZED=0` em `process.env`, que
 * os workers herdavam: a suíte inteira rodava com TLS desligado. Aqui a
 * confiança fica nesta requisição e em nenhum outro lugar.
 */
function statusDe(url: string, ca: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const cliente = url.startsWith('https:') ? https : http
    const req = cliente.get(url, { ca }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.setTimeout(5_000, () => req.destroy(new Error('timeout')))
  })
}

/**
 * O Keycloak leva ~30 s para subir e importar o realm. Sem esta espera a suíte
 * quebra com 401 e telas de login que nunca carregam — sintomas que apontam
 * para o lugar errado. Falhar aqui, dizendo o que fazer, custa um minuto a
 * menos de diagnóstico.
 *
 * Certificado recusado não é "ainda subindo": é CA que não assina o certificado
 * do contêiner, e esperar dois minutos não muda isso.
 */
async function esperarKeycloak(tentativas = 60): Promise<void> {
  const url = `${ISSUER}/.well-known/openid-configuration`
  if (!existsSync(CA_LOCAL)) {
    throw new Error(`CA local ausente em ${CA_LOCAL}.\nGere os certificados antes da suíte:  make db-up`)
  }
  const ca = readFileSync(CA_LOCAL)

  for (let i = 0; i < tentativas; i++) {
    try {
      if ((await statusDe(url, ca)) === 200) return
    } catch (e) {
      const codigo = String((e as NodeJS.ErrnoException).code ?? '')
      if (/CERT|SIGNATURE|SELF_SIGNED|ALTNAME/.test(codigo)) {
        throw new Error(
          `O Keycloak em ${url} apresentou um certificado que ${CA_LOCAL} não valida (${codigo}).\n` +
            'Certificados regerados sem recriar o contêiner?  docker compose up -d --force-recreate keycloak',
        )
      }
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  throw new Error(
    `Keycloak não respondeu em ${url} após ${tentativas * 2}s.\n` +
      'Suba a infraestrutura antes da suíte:  make db-up',
  )
}

export default async function globalSetup(): Promise<void> {
  await esperarKeycloak()

  const apiDir = path.resolve(__dirname, '../packages/api')
  const env = {
    ...process.env,
    DATABASE_URL:
      process.env['DATABASE_URL'] ??
      'postgresql://biblioteca:biblioteca@localhost:5432/biblioteca',
  }
  const run = (cmd: string): void => {
    execSync(cmd, { cwd: apiDir, stdio: 'inherit', env })
  }

  run('npm run migrate:deploy')
  run('npm run db:seed')
}
