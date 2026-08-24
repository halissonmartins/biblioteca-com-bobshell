import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * Prepara o ambiente antes da suíte: espera o Keycloak, aplica migrations e
 * popula o seed. Roda uma única vez, antes do webServer atender requisições.
 * Assume Postgres e Keycloak no ar (docker compose up -d, local e no CI) —
 * igual ao global-setup da suíte de UI (`e2e/`), menos a parte do navegador,
 * que aqui não existe.
 */

const ISSUER =
  process.env['KEYCLOAK_ISSUER_URL'] ?? 'https://localhost:8443/realms/biblioteca'

/**
 * O Keycloak leva ~30 s para subir e importar o realm. Sem esta espera a
 * suíte inteira quebra com 401 — sintoma que aponta para o lugar errado.
 *
 * O realm responde em https com a CA local de `make certs`. Se a confiança
 * não veio de NODE_EXTRA_CA_CERTS, afrouxamos a verificação SÓ aqui, dentro
 * deste processo efêmero, para o discovery — nunca para os testes (que falam
 * com a API, não com o Keycloak direto; o token endpoint é https também, mas
 * o Node do worker confia via NODE_EXTRA_CA_CERTS herdado do ambiente).
 */
async function esperarKeycloak(tentativas = 60): Promise<void> {
  const url = `${ISSUER}/.well-known/openid-configuration`
  let tlsAfrouxado = false

  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (e) {
      const causa = String((e as Error & { cause?: unknown })?.cause ?? e)
      if (!tlsAfrouxado && /certificate|self[- ]signed|unable to verify|TLS|SSL/i.test(causa)) {
        process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
        tlsAfrouxado = true
        continue
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

  run('npm run db:generate')
  run('npm run migrate:deploy')
  run('npm run db:seed')
}
