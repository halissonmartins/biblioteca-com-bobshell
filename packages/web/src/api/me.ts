import { request } from './client'
import type { ApiSuccess } from '../../../shared/src/types/api'
import type { User } from '../../../shared/src/types/domain'

/**
 * Perfil local de quem está autenticado.
 *
 * É daqui que a interface tira o papel e o id — não do token do Keycloak. Uma
 * fonte só de verdade evita a tela achar que a pessoa é Bibliotecária enquanto
 * a API discorda (ADR-0009).
 */
export async function getMe(): Promise<User> {
  const res = await request<ApiSuccess<User>>('/me')
  return res.data
}
