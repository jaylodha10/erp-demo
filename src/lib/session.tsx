'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/lib/api'

export interface SessionUser {
    id: string
    name: string
    phone: string
    email: string | null
    branch: { id: string; code: string; name?: string }
    roles: string[]
    role_names: string[]
    ui_mode: 'WEB_FULL' | 'MOBILE_7_TILE'
    web_modules: string[]
    scope: { global: boolean; project_ids: string[]; site_ids: string[] }
    sites: { id: string; code: string; name: string; city: string; project: { id: string; project_code: string; name: string } }[]
}

interface SessionState {
    user: SessionUser | null
    loading: boolean
    /** True when the user holds at least one of the roles. */
    can: (...roles: string[]) => boolean
    logout: () => Promise<void>
    refresh: () => Promise<void>
    switchUser: (key: string) => Promise<void>
}

const Ctx = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<SessionUser | null>(null)
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        try {
            const r = await api.get<{ user: SessionUser }>('/auth/me')
            setUser(r.user)
        } catch {
            setUser(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const can = useCallback((...roles: string[]) => !!user && user.roles.some(r => roles.includes(r)), [user])

    const logout = useCallback(async () => {
        await api.post('/auth/logout').catch(() => null)
        window.location.href = '/login'
    }, [])

    const switchUser = useCallback(async (key: string) => {
        setLoading(true)
        try {
            await api.post('/auth/switch-user', { key })
            const r = await api.get<{ user: SessionUser }>('/auth/me')
            setUser(r.user)
            // Reload window to re-render navigation and active screen with new permissions
            window.location.reload()
        } finally {
            setLoading(false)
        }
    }, [])

    return <Ctx.Provider value={{ user, loading, can, logout, refresh, switchUser }}>{children}</Ctx.Provider>
}

export function useSession(): SessionState {
    const v = useContext(Ctx)
    if (!v) throw new Error('useSession must be used inside SessionProvider')
    return v
}
