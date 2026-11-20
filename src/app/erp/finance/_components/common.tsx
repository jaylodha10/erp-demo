'use client'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useApi } from '@/lib/api'
import { Input } from '@/components/ui'
import { toNum } from '@/lib/format'

/** Small helpers shared by the finance screens. Nothing here posts money: the API does all the real maths. */

/** Bank payment modes accepted by receipts and payments (database check constraint). */
export const BANK_MODES = ['NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'UPI'] as const

/** Round to paise for previews. */
export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

export function addDays(v: unknown, days: number): Date {
    const d = new Date(String(v))
    d.setUTCDate(d.getUTCDate() + days)
    return d
}

/** A labelled value, for read-only detail panels. */
export function KV({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <div className="muted small">{label}</div>
            <div className="strong">{children}</div>
        </div>
    )
}

/** A search box with an accessible label. */
export function SearchBox({ value, onChange, placeholder = 'Search...', label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
    return <Input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={{ maxWidth: 280 }} />
}

/** One row of a "maths" panel: label on the left, money on the right. */
export function MathRow({ label, value, sign, strong, muted, note }: { label: ReactNode; value: ReactNode; sign?: '+' | '-' | '='; strong?: boolean; muted?: boolean; note?: ReactNode }) {
    return (
        <tr className={muted ? 'muted' : ''}>
            <td style={{ width: 24, textAlign: 'center', fontWeight: 700 }}>{sign ?? ''}</td>
            <td className={strong ? 'strong' : ''}>{label}{note ? <div className="muted small" style={{ fontWeight: 400 }}>{note}</div> : null}</td>
            <td className={`num ${strong ? 'strong' : ''}`} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{value}</td>
        </tr>
    )
}

/** Wraps MathRow rows in a bordered table. */
export function MathTable({ children }: { children: ReactNode }) {
    return (
        <div className="table-wrap">
            <table className="table"><tbody>{children}</tbody></table>
        </div>
    )
}

export interface ProjectLite { id: string; project_code: string; name: string; status?: string; sites?: { id: string; code: string; name: string; city: string }[] }

/** Projects the user can see, plus a lookup by id. */
export function useProjects() {
    const state = useApi<{ items: ProjectLite[] }>('/projects')
    const byId = useMemo(() => new Map((state.data?.items ?? []).map(p => [p.id, p])), [state.data])
    return { ...state, byId }
}

export const num = toNum

/** True when a value is a finite number above zero. */
export const positive = (v: number | ''): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/**
 * Like useAction, but keeps the API's error message on screen inside the form (toasts vanish after a few seconds).
 * Use it for create dialogs where the user needs to read and fix what the API said.
 */
export function useFormAction() {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
        setBusy(true); setError(null)
        try { return await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); return undefined } finally { setBusy(false) }
    }, [])
    return { run, busy, error, clearError: () => setError(null) }
}
