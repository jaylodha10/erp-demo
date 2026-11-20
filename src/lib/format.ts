/** Indian-style number and date formatting used across every screen. */
const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const inr2Fmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const toNum = (v: unknown): number => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : 0
}

/** ₹1,23,456 (whole rupees). Pass decimals for paise. */
export function inr(v: unknown, decimals = false): string {
    const n = toNum(v)
    const body = (decimals ? inr2Fmt : inrFmt).format(Math.abs(n))
    return `${n < 0 ? '-' : ''}₹${body}`
}

/** ₹32.0 L / ₹1.5 Cr for tiles. */
export function inrCompact(v: unknown): string {
    const n = toNum(v)
    const a = Math.abs(n)
    const s = n < 0 ? '-' : ''
    if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`
    if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`
    return `${s}₹${inrFmt.format(a)}`
}

/** 1,234.5 with up to `max` decimals. */
export function qty(v: unknown, max = 3): string {
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: max }).format(toNum(v))
}

export const pct = (v: unknown, d = 1) => `${toNum(v).toFixed(d)}%`

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function fmtDate(v: unknown): string {
    if (!v) return '—'
    const d = new Date(String(v))
    return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}
export function fmtDateTime(v: unknown): string {
    if (!v) return '—'
    const d = new Date(String(v))
    return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

/** yyyy-mm-dd for <input type="date">. */
export const isoDate = (d: Date = new Date()) => d.toISOString().slice(0, 10)

/** PENDING_APPROVAL -> Pending approval */
export function humanize(s: unknown): string {
    const t = String(s ?? '').replace(/_/g, ' ').toLowerCase()
    return t.charAt(0).toUpperCase() + t.slice(1)
}
