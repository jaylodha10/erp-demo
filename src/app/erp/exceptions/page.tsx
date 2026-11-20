'use client'
import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDateTime, humanize, qty } from '@/lib/format'
import {
    Alert, Async, Button, Card, Empty, Field, Icon, Input, Kpi, Modal, NumberInput, PageHeader, Select, StatusBadge, Tabs, Textarea, useToast,
} from '@/components/ui'

/** Exceptions inbox: business problems that need a human decision (short deliveries, negative stock, BOQ overruns, cash variances). */

interface ExceptionRow {
    id: string; exception_type: string; severity: string; project_id: string | null; site_id: string | null
    source_doc_type: string | null; source_doc_id: string | null; source_doc_no: string | null; message: string
    payload: Record<string, unknown> | null; assigned_role: string | null; status: string; resolution_note: string | null
    resolved_by: string | null; resolved_at: string | null; created_at: string
    project: { project_code: string; name: string } | null; site: { code: string } | null; resolved_by_user: { full_name: string } | null
}
type StatusTab = 'OPEN' | 'RESOLVED' | 'DISMISSED'

/** What each type means, in words a site or finance person would use. Resolvers mirror inventory.ts and the route roles. */
const TYPES: Record<string, { title: string; icon: string; what: string; how: string; resolvers: string[] }> = {
    GRN_MISMATCH: {
        title: 'Short or damaged deliveries', icon: 'local_shipping',
        what: 'Goods received at site do not match the purchase order (short, extra or damaged). The vendor\'s invoice is held so you do not pay for what did not arrive.',
        how: 'Record how it was settled (credit note, re-delivery, accepted short). When the last mismatch on a PO is closed, its held invoices are released.',
        resolvers: ['PURCHASE_MGR', 'PROJECT_MANAGER', 'ACCOUNTS', 'DIRECTOR'],
    },
    NEGATIVE_STOCK: {
        title: 'Stock used beyond what was in stock', icon: 'inventory_2',
        what: 'A site reported using more material than the system shows in its store, usually an offline entry made before the delivery was recorded. The entry is parked until someone decides.',
        how: 'Post it anyway (stock goes below zero until a delivery is entered), post a smaller quantity the stock can cover, or reject it with a reason.',
        resolvers: ['PROJECT_MANAGER', 'STOREKEEPER', 'PROJECT_HEAD', 'DIRECTOR'],
    },
    BOQ_BREACH: {
        title: 'Beyond the planned BOQ', icon: 'rule',
        what: 'A material request or purchase order asks for more than the project\'s approved BOQ planned, or for an item that is not in it. Spend is not blocked, but it will eat into the margin.',
        how: 'Review the overrun with the site and record your decision. Consider raising extra work with the client if the scope really grew.',
        resolvers: ['PROJECT_MANAGER', 'COMMERCIAL', 'PROJECT_HEAD', 'DIRECTOR'],
    },
    CASH_VARIANCE: {
        title: 'Petty cash does not match', icon: 'payments',
        what: 'At reconciliation, the cash counted at site differs from what the books say should be in the box.',
        how: 'Check the vouchers and the count, then record the explanation. Short cash is usually recovered or written off by Accounts.',
        resolvers: ['ACCOUNTS', 'PROJECT_MANAGER', 'DIRECTOR'],
    },
    LATE_DPR: { title: 'Late daily reports', icon: 'schedule', what: 'A site has not filed its daily progress report on time.', how: 'Follow up with the site supervisor and note the outcome.', resolvers: ['DIRECTOR'] },
    VARIATION_BILLING: { title: 'Extra work billing', icon: 'request_quote', what: 'Extra work billing needs a second look before it goes to the client.', how: 'Check the approved extra work against the bill and note the outcome.', resolvers: ['DIRECTOR'] },
    OTHER: { title: 'Other issues', icon: 'report', what: 'Anything else that needs a human decision.', how: 'Look into it and record what you decided.', resolvers: ['DIRECTOR'] },
}
const ORDER = ['GRN_MISMATCH', 'NEGATIVE_STOCK', 'BOQ_BREACH', 'CASH_VARIANCE', 'LATE_DPR', 'VARIATION_BILLING', 'OTHER']
/** The resolve route itself only admits these roles. */
const ROUTE_ROLES = ['STOREKEEPER', 'PURCHASE_MGR', 'PROJECT_MANAGER', 'PROJECT_HEAD', 'DIRECTOR', 'ACCOUNTS']
const ROLE_LABEL: Record<string, string> = {
    PURCHASE_MGR: 'Purchase Manager', PROJECT_MANAGER: 'Project Manager', PROJECT_HEAD: 'Project Head', ACCOUNTS: 'Accounts', DIRECTOR: 'Director',
    STOREKEEPER: 'Storekeeper', COMMERCIAL: 'Commercial',
}
const DOC_LABEL: Record<string, string> = {
    PO: 'Purchase order', GOODS_RECEIPT: 'Goods receipt', MATERIAL_REQUEST: 'Material request', PETTY_CASH_RECON: 'Petty cash reconciliation', DPR_CONSUMPTION: 'Site consumption entry',
}
const typeInfo = (t: string) => TYPES[t] ?? { title: humanize(t), icon: 'report', what: 'Needs a human decision.', how: 'Record what you decided.', resolvers: ['DIRECTOR'] }

// A once-a-minute clock so ages stay fresh without calling Date.now() during render.
const subscribeClock = (cb: () => void) => { const t = setInterval(cb, 60_000); return () => clearInterval(t) }
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000
function useNow() { return useSyncExternalStore(subscribeClock, minuteNow, () => 0) }
function ageText(from: string, now: number): string {
    if (!now) return ''
    const mins = Math.max(0, Math.round((now - new Date(from).getTime()) / 60_000))
    if (mins < 60) return `${mins} min ago`
    const h = Math.round(mins / 60)
    if (h < 48) return `${h} hr ago`
    return `${Math.round(h / 24)} days ago`
}
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }

export default function ExceptionsPage() {
    const { can } = useSession()
    const [status, setStatus] = useState<StatusTab>('OPEN')
    const [type, setType] = useState('')
    const [severity, setSeverity] = useState('')
    const [search, setSearch] = useState('')
    const [resolving, setResolving] = useState<ExceptionRow | null>(null)
    const now = useNow()
    const state = useApi<{ items: ExceptionRow[] }>(`/exceptions?status=${status}`)

    const items = state.data?.items
    const counts = useMemo(() => {
        const c: Record<string, number> = {}
        for (const r of items ?? []) c[r.exception_type] = (c[r.exception_type] ?? 0) + 1
        return c
    }, [items])
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (items ?? []).filter(r =>
            (!type || r.exception_type === type) && (!severity || r.severity === severity) &&
            (!q || [r.message, r.source_doc_no ?? '', r.project?.project_code ?? '', r.project?.name ?? '', r.site?.code ?? ''].some(s => s.toLowerCase().includes(q)))
        ).sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || b.created_at.localeCompare(a.created_at))
    }, [items, type, severity, search])
    const grouped = ORDER.concat(Object.keys(counts).filter(t => !ORDER.includes(t))).map(t => ({ t, rows: filtered.filter(r => r.exception_type === t) })).filter(g => g.rows.length)
    const canResolve = (t: string) => can(...typeInfo(t).resolvers.filter(r => ROUTE_ROLES.includes(r)))

    return (
        <>
            <PageHeader title="Exceptions" subtitle="Things the system could not decide for you: deliveries that do not match, stock used beyond what is recorded, spend beyond the BOQ and cash that does not add up. Each one waits here until someone records a decision." />
            <Tabs<StatusTab> tabs={[{ id: 'OPEN', label: 'Open' }, { id: 'RESOLVED', label: 'Resolved' }, { id: 'DISMISSED', label: 'Rejected' }]} value={status} onChange={s => { setStatus(s); setType('') }} />
            <Async state={state}>
                {d => (
                    <>
                        <div className="kpi-grid">
                            <Kpi label={status === 'OPEN' ? 'Open exceptions' : status === 'RESOLVED' ? 'Resolved' : 'Rejected'} value={d.items.length} tone={status === 'OPEN' && d.items.length ? 'warn' : undefined} sub={d.items.length >= 200 ? 'Newest 200 shown' : undefined} />
                            <Kpi label="Critical" value={d.items.filter(r => r.severity === 'CRITICAL').length} tone={d.items.some(r => r.severity === 'CRITICAL') ? 'bad' : undefined} />
                            <Kpi label="Older than 3 days" value={now ? d.items.filter(r => now - new Date(r.created_at).getTime() > 3 * 86_400_000).length : 0} sub={status === 'OPEN' ? 'Chase these first' : undefined} />
                        </div>
                        <div className="row" style={{ marginBottom: 14, gap: 6 }} role="group" aria-label="Filter by type">
                            <Button size="sm" variant={!type ? 'primary' : 'default'} aria-pressed={!type} onClick={() => setType('')}>All types ({d.items.length})</Button>
                            {Object.keys(counts).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map(t => (
                                <Button key={t} size="sm" variant={type === t ? 'primary' : 'default'} aria-pressed={type === t} icon={typeInfo(t).icon} onClick={() => setType(t)}>{typeInfo(t).title} ({counts[t]})</Button>
                            ))}
                        </div>
                        <div className="row" style={{ marginBottom: 14 }}>
                            <div style={{ flex: '1 1 220px', maxWidth: 360 }}>
                                <Input type="search" aria-label="Search exceptions" placeholder="Search document, project, site or message..." value={search} onChange={e => setSearch(e.target.value)} />
                            </div>
                            <div style={{ width: 160 }}>
                                <Select aria-label="Filter by severity" value={severity} onChange={e => setSeverity(e.target.value)}>
                                    <option value="">All severities</option>
                                    <option value="CRITICAL">Critical</option>
                                    <option value="WARNING">Warning</option>
                                    <option value="INFO">Information</option>
                                </Select>
                            </div>
                        </div>
                        {!grouped.length ? (
                            <Card>
                                <Empty title={status === 'OPEN' && !d.items.length ? 'Nothing needs a decision' : 'No exceptions match'} icon={status === 'OPEN' && !d.items.length ? 'task_alt' : 'search_off'}>
                                    {status === 'OPEN' && !d.items.length ? 'Everything raised so far has been dealt with.' : 'Change the type, severity or search.'}
                                </Empty>
                            </Card>
                        ) : grouped.map(g => {
                            const info = typeInfo(g.t)
                            return (
                                <Card key={g.t} title={<span className="row" style={{ gap: 8 }}><Icon name={info.icon} />{info.title}<span className="badge">{g.rows.length}</span></span>} sub={info.what}>
                                    {status === 'OPEN' ? <div className="muted small" style={{ marginBottom: 10 }}><strong>What to do:</strong> {info.how}</div> : null}
                                    {status === 'OPEN' && !canResolve(g.t) ? <Alert tone="info">Your role cannot close these. They are resolved by: {info.resolvers.filter(r => ROUTE_ROLES.includes(r)).map(r => ROLE_LABEL[r] ?? humanize(r)).join(', ')}.</Alert> : null}
                                    <div className="table-wrap">
                                        <table className="table">
                                            <thead>
                                                <tr><th>Severity</th><th>Document</th><th>Project and site</th><th>What happened</th><th>{status === 'OPEN' ? 'Raised' : 'Outcome'}</th>{status === 'OPEN' ? <th>Action</th> : null}</tr>
                                            </thead>
                                            <tbody>
                                                {g.rows.map(r => (
                                                    <tr key={r.id}>
                                                        <td><StatusBadge status={r.severity} label={humanize(r.severity)} /></td>
                                                        <td><span className="strong">{r.source_doc_no ?? '—'}</span>{r.source_doc_type ? <div className="muted small">{DOC_LABEL[r.source_doc_type] ?? humanize(r.source_doc_type)}</div> : null}</td>
                                                        <td>{r.project ? <><span className="strong">{r.project.project_code}</span><div className="muted small">{r.project.name}{r.site ? ` · ${r.site.code}` : ''}</div></> : <span className="muted">Company-wide</span>}</td>
                                                        <td style={{ minWidth: 260, maxWidth: 520 }}>{r.message}</td>
                                                        <td className="small" style={{ whiteSpace: 'nowrap' }}>
                                                            {status === 'OPEN' ? <><div>{ageText(r.created_at, now)}</div><div className="muted">{fmtDateTime(r.created_at)}</div></> : (
                                                                <div style={{ whiteSpace: 'normal', minWidth: 200 }}>
                                                                    <div>{r.resolution_note ?? '—'}</div>
                                                                    <div className="muted">{r.resolved_by_user?.full_name ?? 'Unknown'} · {fmtDateTime(r.resolved_at)}</div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        {status === 'OPEN' ? (
                                                            <td className="right">
                                                                {canResolve(r.exception_type)
                                                                    ? <Button size="sm" variant="primary" icon="gavel" onClick={() => setResolving(r)} aria-label={`Resolve ${r.source_doc_no ?? 'exception'}`}>Resolve</Button>
                                                                    : <span className="muted small">Not your role</span>}
                                                            </td>
                                                        ) : null}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            )
                        })}
                    </>
                )}
            </Async>
            {resolving ? <ResolveDialog key={resolving.id} ex={resolving} onClose={() => setResolving(null)} onDone={async () => { setResolving(null); await state.reload() }} /> : null}
        </>
    )
}

type NegAction = 'POST_ANYWAY' | 'ADJUST_QTY' | 'REJECT'

function ResolveDialog({ ex, onClose, onDone }: { ex: ExceptionRow; onClose: () => void; onDone: () => Promise<void> }) {
    const formId = useId()
    const toast = useToast()
    const info = typeInfo(ex.exception_type)
    const isNeg = ex.exception_type === 'NEGATIVE_STOCK'
    const requested = Number(ex.payload?.qty ?? 0)
    const [action, setAction] = useState<NegAction>('POST_ANYWAY')
    const [adjQty, setAdjQty] = useState<number | ''>('')
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [serverError, setServerError] = useState<string | null>(null)
    const [tried, setTried] = useState(false)

    const noteRequired = ex.exception_type === 'GRN_MISMATCH' || action === 'REJECT' || (!isNeg)
    const errors: string[] = []
    if (isNeg && action === 'ADJUST_QTY') {
        if (adjQty === '' || adjQty <= 0) errors.push('Enter the quantity to post, greater than zero.')
        else if (requested && adjQty >= requested) errors.push(`The adjusted quantity should be less than the ${qty(requested)} that was reported. To post the full amount choose "Post anyway".`)
    }
    if (noteRequired && !note.trim()) errors.push(
        ex.exception_type === 'GRN_MISMATCH' ? 'Say how the mismatch was settled (credit note, re-delivery, accepted short).'
            : action === 'REJECT' ? 'Say why the entry is rejected.' : 'Write a short note on what you decided.'
    )

    async function submit(ev: React.FormEvent) {
        ev.preventDefault()
        setTried(true); setServerError(null)
        if (errors.length) return
        setBusy(true)
        try {
            await api.post(`/exceptions/${ex.id}/resolve`, {
                action: isNeg ? action : 'RESOLVE', note: note.trim() || undefined, ...(isNeg && action === 'ADJUST_QTY' ? { qty: adjQty } : {}),
            })
            toast.success(isNeg && action === 'REJECT' ? 'Entry rejected' : 'Exception resolved')
            await onDone()
        } catch (x) {
            setServerError(x instanceof Error ? x.message : 'Could not resolve this exception')
        } finally {
            setBusy(false)
        }
    }

    const choices: { id: NegAction; title: string; text: string }[] = [
        { id: 'POST_ANYWAY', title: 'Post anyway', text: `Record the full ${qty(requested)} as used. Stock goes below zero until a delivery is entered to correct it.` },
        { id: 'ADJUST_QTY', title: 'Post a smaller quantity', text: 'Record only the quantity the store can cover. Stock does not go negative.' },
        { id: 'REJECT', title: 'Reject the entry', text: 'Nothing is posted. The site is told why. The reason is required.' },
    ]

    return (
        <Modal open title={`Resolve ${info.title.toLowerCase()}`} onClose={onClose} footer={<>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant={isNeg && action === 'REJECT' ? 'danger-solid' : 'primary'} type="submit" form={formId} loading={busy}>
                {isNeg ? (action === 'REJECT' ? 'Reject entry' : action === 'ADJUST_QTY' ? 'Post smaller quantity' : 'Post anyway') : 'Mark resolved'}
            </Button>
        </>}>
            <form id={formId} onSubmit={e => void submit(e)} noValidate>
                <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                    <div className="strong">{ex.source_doc_no ?? humanize(ex.exception_type)}{ex.project ? ` · ${ex.project.project_code}` : ''}</div>
                    <div className="small" style={{ marginTop: 2 }}>{ex.message}</div>
                </div>
                {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
                {tried && errors.length ? <Alert tone="danger">{errors.map(e => <div key={e}>{e}</div>)}</Alert> : null}
                {isNeg ? (
                    <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
                        <legend style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>Your decision</legend>
                        <div style={{ display: 'grid', gap: 6 }}>
                            {choices.map(c => (
                                <label key={c.id} className="checkbox" style={{ alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', background: action === c.id ? 'var(--primary-light)' : undefined }}>
                                    <input type="radio" name="neg-action" checked={action === c.id} onChange={() => setAction(c.id)} style={{ marginTop: 3 }} />
                                    <span><strong>{c.title}</strong><span className="muted small" style={{ display: 'block' }}>{c.text}</span></span>
                                </label>
                            ))}
                        </div>
                        {action === 'ADJUST_QTY' ? (
                            <div style={{ marginTop: 10 }}>
                                <Field label="Quantity to post" hint={requested ? `Reported: ${qty(requested)}. Use the same unit as the site entry.` : undefined}>
                                    <NumberInput value={adjQty} onChange={setAdjQty} step="any" min={0} autoFocus />
                                </Field>
                            </div>
                        ) : null}
                    </fieldset>
                ) : <Alert tone="info">{info.how}</Alert>}
                <Field label={`Note${noteRequired ? ' *' : ' (optional)'}`} hint={ex.exception_type === 'GRN_MISMATCH' ? 'For example: credit note CN-118 received; vendor re-delivering 40 bags by Friday.' : undefined}>
                    <Textarea value={note} onChange={e => setNote(e.target.value)} />
                </Field>
            </form>
        </Modal>
    )
}
