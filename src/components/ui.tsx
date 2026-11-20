'use client'
import {
    createContext, useCallback, useContext, useEffect, useId, useMemo, useState,
    type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { api, uploadFile, useApi } from '@/lib/api'
import { humanize, inr, inrCompact, toNum } from '@/lib/format'

/** Shared building blocks for every head-office screen. Plain CSS classes live in globals.css. */

// ---------------------------------------------------------------------------------------------- basics
export function Icon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
    return <span className={`material-symbols-outlined ${className ?? ''}`} style={style} aria-hidden="true">{name}</span>
}

type Variant = 'default' | 'primary' | 'success' | 'danger' | 'danger-solid' | 'ghost'
export function Button({ variant = 'default', size, icon, loading, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm'; icon?: string; loading?: boolean }) {
    const cls = ['btn', variant !== 'default' ? `btn-${variant}` : '', size === 'sm' ? 'btn-sm' : '', className ?? ''].join(' ')
    return (
        <button type="button" {...rest} className={cls} disabled={rest.disabled || loading}>
            {loading ? <Icon name="progress_activity" /> : icon ? <Icon name={icon} /> : null}
            {children}
        </button>
    )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="page-header">
            <div>
                <h1>{title}</h1>
                {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {actions ? <div className="actions">{actions}</div> : null}
        </div>
    )
}

export function Card({ title, sub, actions, children, className }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`card ${className ?? ''}`}>
            {title || actions ? (
                <div className="card-header">
                    <div>
                        {title ? <h2>{title}</h2> : null}
                        {sub ? <div className="sub">{sub}</div> : null}
                    </div>
                    {actions ? <div className="actions">{actions}</div> : null}
                </div>
            ) : null}
            {children}
        </section>
    )
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
    return (
        <div className={`kpi ${tone ?? ''}`}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
            {sub ? <div className="sub">{sub}</div> : null}
        </div>
    )
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'success'; children: ReactNode }) {
    const icon = { info: 'info', warn: 'warning', danger: 'error', success: 'check_circle' }[tone]
    return (
        <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
            <Icon name={icon} />
            <div>{children}</div>
        </div>
    )
}

export function Money({ value, compact, decimals }: { value: unknown; compact?: boolean; decimals?: boolean }) {
    return <span className="mono">{compact ? inrCompact(value) : inr(value, decimals)}</span>
}

export function Empty({ title, children, icon = 'inbox' }: { title: string; children?: ReactNode; icon?: string }) {
    return (
        <div className="empty">
            <Icon name={icon} />
            <strong>{title}</strong>
            {children}
        </div>
    )
}

export function Loading({ label = 'Loading...' }: { label?: string }) {
    return <div className="empty" role="status"><Icon name="progress_activity" />{label}</div>
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <Alert tone="danger">
            {message} {onRetry ? <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={onRetry}>Try again</button> : null}
        </Alert>
    )
}

/** Renders loading and error states around a useApi result. */
export function Async<T>({ state, children }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void> }; children: (data: T) => ReactNode }) {
    if (state.error && !state.data) return <ErrorBox message={state.error} onRetry={() => void state.reload()} />
    if (!state.data) return <Loading />
    return <>{children(state.data)}</>
}

// ---------------------------------------------------------------------------------------------- status badges
const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'purple' | ''> = {
    // positive
    APPROVED: 'success', ACTIVE: 'success', PAID: 'success', RECEIVED: 'success', RESOLVED: 'success', WON: 'success', COMPLETED: 'success', ON_TRACK: 'success', POSTED: 'info', WORK_COMPLETED: 'success',
    BASELINE_LOCKED: 'success', AWARDED: 'success', CLOSED: 'success', DONE: 'success', SENT: 'info', ACKNOWLEDGED: 'info', PRESENT: 'success',
    // waiting
    PENDING: 'warning', PENDING_APPROVAL: 'warning', PARTIALLY_RECEIVED: 'warning', PARTIALLY_PAID: 'warning', DRAFT: '', OPEN: 'warning', WAITING: '', DELAYED: 'warning', WARNING: 'warning',
    NEW: 'info', SITE_VISIT: 'info', BOQ_SUBMITTED: 'info', QUOTATION_SENT: 'purple', ORDERED: 'info', BILLED: 'purple', PARTIALLY_RECEIVED_: 'warning', SUPERSEDED: '', ON_HOLD: 'warning',
    // negative
    REJECTED: 'danger', CANCELLED: 'danger', LOST: 'danger', CRITICAL: 'danger', HOLD_MISMATCH: 'danger', OVERDUE: 'danger', BREACH: 'danger',
}
export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
    if (!status) return <span className="muted">—</span>
    const tone = TONES[status] ?? ''
    return <span className={`badge ${tone}`}>{label ?? humanize(status)}</span>
}

// ---------------------------------------------------------------------------------------------- table
export interface Column<T> {
    key: string
    header: ReactNode
    render?: (row: T, index: number) => ReactNode
    align?: 'right'
    width?: number | string
}
export function DataTable<T>({ columns, rows, empty, onRowClick, footer, rowKey }: {
    columns: Column<T>[]
    rows: T[]
    empty?: ReactNode
    onRowClick?: (row: T) => void
    footer?: ReactNode
    rowKey?: (row: T, i: number) => string
}) {
    if (!rows.length) return <div className="table-wrap">{empty ?? <Empty title="Nothing here yet" />}</div>
    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>{columns.map(c => <th key={c.key} className={c.align === 'right' ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>{c.header}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={rowKey ? rowKey(r, i) : ((r as { id?: string }).id ?? i)} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                            {columns.map(c => (
                                <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                                    {c.render ? c.render(r, i) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                {footer ? <tfoot>{footer}</tfoot> : null}
            </table>
        </div>
    )
}

// ---------------------------------------------------------------------------------------------- tabs, modal
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void }) {
    return (
        <div className="tabs" role="tablist">
            {tabs.map(t => (
                <button key={t.id} role="tab" aria-selected={t.id === value} className={`tab ${t.id === value ? 'active' : ''}`} onClick={() => onChange(t.id)}>
                    {t.label}{t.count !== undefined ? <span className="count">{t.count}</span> : null}
                </button>
            ))}
        </div>
    )
}

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
    useEffect(() => {
        if (!open) return
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [open, onClose])
    if (!open) return null
    return (
        <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
            <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
                <div className="modal-head">
                    <h3>{title}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
                </div>
                <div className="modal-body">{children}</div>
                {footer ? <div className="modal-foot">{footer}</div> : null}
            </div>
        </div>
    )
}

/** Asks for a mandatory reason (rejections, cancellations). */
export function ReasonDialog({ open, title, label = 'Reason', confirmLabel = 'Confirm', danger, onClose, onSubmit }: {
    open: boolean; title: string; label?: string; confirmLabel?: string; danger?: boolean; onClose: () => void; onSubmit: (reason: string) => Promise<void> | void
}) {
    const [reason, setReason] = useState('')
    const [busy, setBusy] = useState(false)
    useEffect(() => { if (open) setReason('') }, [open])
    return (
        <Modal open={open} title={title} onClose={onClose} footer={
            <>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant={danger ? 'danger-solid' : 'primary'} loading={busy} disabled={!reason.trim()} onClick={async () => {
                    setBusy(true)
                    try { await onSubmit(reason.trim()) } finally { setBusy(false) }
                }}>{confirmLabel}</Button>
            </>
        }>
            <Field label={label}><Textarea value={reason} onChange={e => setReason(e.target.value)} autoFocus /></Field>
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- form fields
export function Field({ label, hint, error, children, className }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
    const id = useId()
    return (
        <div className={`field ${className ?? ''}`}>
            {label ? <label htmlFor={id}>{label}</label> : null}
            <FieldIdContext.Provider value={id}>{children}</FieldIdContext.Provider>
            {hint ? <div className="hint">{hint}</div> : null}
            {error ? <div className="err">{error}</div> : null}
        </div>
    )
}
const FieldIdContext = createContext<string | undefined>(undefined)

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
    const id = useContext(FieldIdContext)
    const numeric = rest.type === 'number'
    return <input id={id} {...rest} className={`input ${numeric ? 'num' : ''} ${className ?? ''}`} />
}
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
    const id = useContext(FieldIdContext)
    return <select id={id} {...rest} className={`select ${className ?? ''}`}>{children}</select>
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    const id = useContext(FieldIdContext)
    return <textarea id={id} {...rest} className={`textarea ${className ?? ''}`} />
}

/** Number input bound to a numeric state value ('' while empty). */
export function NumberInput({ value, onChange, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: number | ''; onChange: (v: number | '') => void }) {
    return <Input {...rest} type="number" value={value} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
}

/** Dropdown fed by a master: GET /masters/:name/options. */
export function MasterSelect({ master, value, onChange, placeholder = 'Select...', disabled, allowEmpty = true }: {
    master: string; value: string | null | undefined; onChange: (id: string, option?: { id: string; label: string; code: string }) => void; placeholder?: string; disabled?: boolean; allowEmpty?: boolean
}) {
    const opts = useApi<{ items: { id: string; label: string; code: string }[] }>(`/masters/${master}/options`)
    return (
        <Select value={value ?? ''} disabled={disabled || opts.loading} onChange={e => onChange(e.target.value, opts.data?.items.find(o => o.id === e.target.value))}>
            {allowEmpty ? <option value="">{opts.loading ? 'Loading...' : placeholder}</option> : null}
            {opts.data?.items.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
    )
}

/** Dropdown fed by any endpoint returning { items }. */
export function ApiSelect<T extends { id: string }>({ path, value, onChange, label, placeholder = 'Select...', disabled }: {
    path: string | null; value: string | null | undefined; onChange: (id: string, row?: T) => void; label: (row: T) => string; placeholder?: string; disabled?: boolean
}) {
    const res = useApi<{ items: T[] }>(path)
    return (
        <Select value={value ?? ''} disabled={disabled || res.loading} onChange={e => onChange(e.target.value, res.data?.items.find(o => o.id === e.target.value))}>
            <option value="">{res.loading ? 'Loading...' : placeholder}</option>
            {res.data?.items.map(o => <option key={o.id} value={o.id}>{label(o)}</option>)}
        </Select>
    )
}

/** Projects the signed-in user can see, as a select. */
export function ProjectSelect({ value, onChange, placeholder = 'Select project...', status, disabled }: { value: string; onChange: (id: string, p?: ProjectOption) => void; placeholder?: string; status?: string; disabled?: boolean }) {
    return <ApiSelect<ProjectOption> path={`/projects${status ? `?status=${status}` : ''}`} value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} label={p => `${p.project_code} · ${p.name}`} />
}
export interface ProjectOption { id: string; project_code: string; name: string; sites?: { id: string; code: string; name: string; city: string }[] }

/** Upload a bill, challan or photo; calls onChange with the stored URL. */
export function FileField({ value, onChange, folder = 'general', accept = 'image/*,application/pdf' }: { value?: string | null; onChange: (url: string | null) => void; folder?: string; accept?: string }) {
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    return (
        <div>
            <div className="row">
                <input type="file" accept={accept} className="input" disabled={busy} onChange={async e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    setBusy(true); setErr(null)
                    try { const r = await uploadFile(f, folder); onChange(r.url) } catch (x) { setErr(x instanceof Error ? x.message : 'Upload failed') } finally { setBusy(false) }
                }} />
                {value ? <><a href={value} target="_blank" rel="noreferrer">View</a><Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button></> : null}
            </div>
            {busy ? <div className="hint">Uploading...</div> : null}
            {err ? <div className="err">{err}</div> : null}
        </div>
    )
}

// ---------------------------------------------------------------------------------------------- approvals
export interface ChainStep { step?: number; step_order?: number; role?: string; approver_role?: { code: string } | string; status: string }
export function ApprovalChain({ steps }: { steps: ChainStep[] }) {
    if (!steps?.length) return null
    return (
        <div className="chain">
            {steps.map((s, i) => {
                const role = typeof s.approver_role === 'string' ? s.approver_role : s.approver_role?.code ?? s.role ?? ''
                return (
                    <span key={i} style={{ display: 'contents' }}>
                        {i > 0 ? <span className="arrow">→</span> : null}
                        <span className={`step ${s.status}`}>
                            {s.status === 'APPROVED' ? <Icon name="check_circle" /> : s.status === 'REJECTED' ? <Icon name="cancel" /> : null}
                            {humanize(role)}
                        </span>
                    </span>
                )
            })}
        </div>
    )
}

// ---------------------------------------------------------------------------------------------- toast and actions
interface ToastItem { id: number; tone: 'info' | 'error' | 'success'; text: string }
const ToastCtx = createContext<{ push: (tone: ToastItem['tone'], text: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<ToastItem[]>([])
    const push = useCallback((tone: ToastItem['tone'], text: string) => {
        const id = Date.now() + Math.random()
        setItems(l => [...l, { id, tone, text }])
        setTimeout(() => setItems(l => l.filter(t => t.id !== id)), tone === 'error' ? 7000 : 3500)
    }, [])
    const value = useMemo(() => ({ push }), [push])
    return (
        <ToastCtx.Provider value={value}>
            {children}
            <div className="toasts" aria-live="polite">
                {items.map(t => <div key={t.id} className={`toast ${t.tone}`}><Icon name={t.tone === 'error' ? 'error' : t.tone === 'success' ? 'check_circle' : 'info'} /><div>{t.text}</div></div>)}
            </div>
        </ToastCtx.Provider>
    )
}

export function useToast() {
    const c = useContext(ToastCtx)
    if (!c) throw new Error('useToast must be used inside ToastProvider')
    return { success: (m: string) => c.push('success', m), error: (m: string) => c.push('error', m), info: (m: string) => c.push('info', m) }
}

/** Runs an async action with a busy flag and an error toast. Returns the result, or undefined if it failed. */
export function useAction() {
    const toast = useToast()
    const [busy, setBusy] = useState(false)
    const run = useCallback(async <T,>(fn: () => Promise<T>, successMessage?: string): Promise<T | undefined> => {
        setBusy(true)
        try {
            const r = await fn()
            if (successMessage) toast.success(successMessage)
            return r
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Something went wrong')
            return undefined
        } finally {
            setBusy(false)
        }
    }, [toast])
    return { run, busy }
}

/** Debounced value, for search boxes. */
export function useDebounced<T>(value: T, ms = 300): T {
    const [v, setV] = useState(value)
    useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
    return v
}

export { api, toNum }
