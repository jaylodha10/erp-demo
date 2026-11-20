'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Browser-side client for the /api/v1 REST API mock in the demo prototype.
 */
export class ApiClientError extends Error {
    constructor(public status: number, public code: string, message: string, public details?: unknown) {
        super(message)
    }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export async function request<T = any>(method: Method, path: string, body?: unknown): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
    let res: Response
    try {
        res = await fetch(`/api/v1${path}`, {
            method,
            headers: body === undefined || body instanceof FormData ? undefined : { 'content-type': 'application/json' },
            body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
            credentials: 'same-origin',
        })
    } catch {
        throw new ApiClientError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.')
    }
    const text = await res.text()
    let data: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    try { data = text ? JSON.parse(text) : null } catch { data = { error: text } }
    if (!res.ok) {
        if (res.status === 401 && !path.startsWith('/auth/login') && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
        }
        throw new ApiClientError(res.status, data?.code ?? 'ERROR', data?.error ?? `Request failed (${res.status})`, data?.details)
    }
    return data as T
}

export const api = {
    get: <T = any>(path: string) => request<T>('GET', path), // eslint-disable-line @typescript-eslint/no-explicit-any
    post: <T = any>(path: string, body: unknown = {}) => request<T>('POST', path, body), // eslint-disable-line @typescript-eslint/no-explicit-any
    put: <T = any>(path: string, body: unknown = {}) => request<T>('PUT', path, body), // eslint-disable-line @typescript-eslint/no-explicit-any
    patch: <T = any>(path: string, body: unknown = {}) => request<T>('PATCH', path, body), // eslint-disable-line @typescript-eslint/no-explicit-any
    del: <T = any>(path: string) => request<T>('DELETE', path), // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Uploads a bill, challan or photo and returns mock URL */
export async function uploadFile(file: File, folder = 'general'): Promise<{ url: string; size_kb: number }> {
    const form = new FormData()
    form.append('file', file)
    form.append('folder', folder)
    return request('POST', '/uploads', form)
}

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
    const s = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
    const out = s.toString()
    return out ? `?${out}` : ''
}

export interface ApiState<T> {
    data: T | null
    error: string | null
    loading: boolean
    reload: () => Promise<void>
    setData: (d: T | null) => void
}

/** Loads a GET endpoint. Pass null to skip. Reloads when the path changes; call reload() after a mutation. */
export function useApi<T = any>(path: string | null): ApiState<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const [data, setData] = useState<T | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(path !== null)
    const seq = useRef(0)

    const load = useCallback(async () => {
        if (path === null) { setLoading(false); return }
        const mine = ++seq.current
        setLoading(true)
        try {
            const r = await api.get<T>(path)
            if (mine === seq.current) { setData(r); setError(null) }
        } catch (e) {
            if (mine === seq.current) setError(e instanceof Error ? e.message : 'Something went wrong')
        } finally {
            if (mine === seq.current) setLoading(false)
        }
    }, [path])

    useEffect(() => { void load() }, [load])
    return { data, error, loading, reload: load, setData }
}
