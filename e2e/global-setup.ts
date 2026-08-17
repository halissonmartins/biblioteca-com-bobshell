import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * Prepara o ambiente antes da suíte E2E: espera o Keycloak, aplica migrations e
 * popula o seed. Roda uma única vez, antes do webServer atender requisições.
 * Assume Postgres e Keycloak no ar (docker compose up -d, local e no CI).
 */

const ISSUER =
  process.env['KEYCLOAK_ISSUER_URL'] ?? 'http://localhost:8081/realms/biblioteca'

/**
 * O Keycloak leva ~30 s para subir e importar o realm. Sem esta espera a suíte
 * quebra com 401 e telas de login que nunca carregam — sintomas que apontam
 * para o lugar errado. Falhar aqui, dizendo o que fazer, custa um minuto a
 * menos de diagnóstico.
 */
async function esperarKeycloak(tentativas = 60): Promise<void> {
  const url = `${ISSUER}/.well-known/openid-configuration`

  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  throw new Error(
    `Keycloak não respondeu em ${url} após ${tentativas * 2}s.\n` +
      'Suba a infraestrutura antes da suíte:  docker compose up -d --wait',
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

  run('npm run db:generate')
  run('npm run migrate:deploy')
  run('npm run db:seed')
}
