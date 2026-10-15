/**
 * Shared shapes for the Django REST Framework API.
 *
 * DRF validation errors are keyed by field; general errors use
 * `non_field_errors`; auth/permission problems use `detail`.
 */
export type FieldErrors = Record<string, string[]>

export interface DrfErrorBody {
  detail?: string
  non_field_errors?: string[]
  [field: string]: string[] | string | undefined
}

/** PageNumberPagination envelope — proposed in the API contract, not enabled yet. */
export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
