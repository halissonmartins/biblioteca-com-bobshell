import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * Prepara o banco antes da suíte E2E: aplica migrations e popula o seed.
 * Roda uma única vez, antes do webServer atender requisições de teste.
 * Assume Postgres no ar (docker compose up -d localmente; service no CI).
 */
export default function globalSetup(): void {
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
