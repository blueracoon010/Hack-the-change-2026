import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'

/** Load data on mount: `const { data, error, loading, reload } = useApi<T>('/api/...', { refreshMs: 60000 })` */
export function useApi<T>(path: string | null, { refreshMs }: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(Boolean(path))

  const load = useCallback(async () => {
    if (!path) return
    setLoading(true)
    try {
      setData(await api<T>(path))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)))
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    load()
    if (!refreshMs) return
    const id = setInterval(load, refreshMs)
    return () => clearInterval(id)
  }, [load, refreshMs])

  return { data, error, loading, reload: load }
}
