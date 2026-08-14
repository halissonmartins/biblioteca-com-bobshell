import { request } from './client'
import type { ApiSuccess } from '../../../shared/src/types/api'
import type { Author, BookListItem } from '../../../shared/src/types/domain'

export interface AuthorDetail extends Author {
  books: BookListItem[]
}

export async function getAuthor(slug: string): Promise<AuthorDetail> {
  const res = await request<ApiSuccess<AuthorDetail>>(`/authors/${slug}`)
  return res.data
}
