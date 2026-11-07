import { API_URL } from '../config/app'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

let authToken: string | null = null
export const setAuthToken = (t: string | null) => { authToken = t }

type Options = { method?: string; body?: unknown }

/** Typed fetch wrapper: `const user = await api<User>('/api/auth/me')`. Adds the auth token automatically. */
export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, `Can't reach the server at ${API_URL}. Is the backend running?`)
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, errorMessage(data) ?? `Request failed (${res.status})`)
  return data as T
}

function errorMessage(data: unknown): string | null {
  const detail = (data as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{msg: "Value error, Password must be..."}]
    return detail.map((d) => String(d?.msg ?? '').replace(/^Value error, /, '')).join('. ')
  }
  return null
}
