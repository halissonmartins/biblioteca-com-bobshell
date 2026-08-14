import { request } from './client'
import type { ApiSuccess, PaginatedResponse, ListBooksQuery } from '../../../shared/src/types/api'
import type { BookListItem, BookDetail } from '../../../shared/src/types/domain'

export async function listBooks(query: ListBooksQuery = {}): Promise<PaginatedResponse<BookListItem>> {
  const params = new URLSearchParams()
  if (query.search)   params.set('search', query.search)
  if (query.genre)    params.set('genre', query.genre)
  if (query.page)     params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  const qs = params.toString()
  const res = await request<ApiSuccess<PaginatedResponse<BookListItem>>>(`/books${qs ? `?${qs}` : ''}`)
  return res.data
}

export async function getBook(id: string): Promise<BookDetail> {
  const res = await request<ApiSuccess<BookDetail>>(`/books/${id}`)
  return res.data
}
