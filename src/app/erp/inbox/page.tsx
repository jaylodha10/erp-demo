'use client'
import Link from 'next/link'
import { useState } from 'react'
import { api, useApi } from '@/lib/api'
import { humanize, inr, isoDate, qty, toNum } from '@/lib/format'
import { Alert, Async, Button, Card, Empty, Field, Icon, Input, Kpi, Modal, NumberInput, PageHeader, ReasonDialog, Tabs, Textarea, useAction, useToast } from '@/components/ui'

interface BreachLine { item: string; planned: number; ordered_before: number; ordering_now: number; over_qty: number; over_value: number; unbudgeted: boolean }
interface InboxItem {
    instance_id: string
    doc_type: string
    doc_id: string
    doc_no: string | null
    title: string
    project_id: string | null
    project_code: string | null
    project_name: string | null
    amount: number
    step_order: number
    total_steps: number
    approver_role: string
    requires_client_signoff: boolean
    requested_by: { id: string; name: string }
    requested_at: string
    flags: { boq_breach?: boolean; breach_amount?: number; breach_lines?: BreachLine[]; over_imprest?: boolean; balance?: number; auto?: boolean }
    rule_label: string
    can_decide: boolean
    blocked_reason: string | null
}
interface DecideResult { status: 'PENDING' | 'APPROVED' | 'REJECTED'; completed: boolean; step: number; total_steps: number; doc_no: string | null }
interface VariationLite { description: string; pm_estimated_cost: number | null; client_price: number | null; est_qty: number; uom: { code: string } | null }

const TYPES: Record<string, { label: string; icon: string }> = {
    PO: { label: 'Purchase order', icon: 'receipt_long' },
    EXTRA_WORK: { label: 'Extra work', icon: 'add_task' },
    PETTY_CASH_REQ: { label: 'Petty cash request', icon: 'wallet' },
    PETTY_CASH_REPLENISH: { label: 'Petty cash replenishment', icon: 'savings' },
    WORK_ORDER: { label: 'Client work order', icon: 'assignment' },
    SUBCON_WO: { label: 'Subcontractor work order', icon: 'engineering' },
}
const typeOf = (t: string) => TYPES[t] ?? { label: humanize(t), icon: 'description' }

function ageOf(from: string, now: number) {
    const ms = Math.max(0, now - new Date(from).getTime())
    const d = Math.floor(ms / 86400000)
    if (d >= 1) return { text: `${d} day${d > 1 ? 's' : ''}`, old: d >= 3 }
    const h = Math.floor(ms / 3600000)
    return { text: h >= 1 ? `${h} hour${h > 1 ? 's' : ''}` : 'Just now', old: false }
}

function docLinks(i: InboxItem): { href: string; label: string }[] {
    const out: { href: string; label: string }[] = []
    if (i.doc_type === 'PO') out.push({ href: `/erp/procurement/orders/${i.doc_id}`, label: 'Open purchase order' })
    if (i.doc_type === 'EXTRA_WORK') out.push({ href: `/erp/variations?open=${i.doc_id}`, label: 'Open extra work' })
    if (i.doc_type.startsWith('PETTY_CASH')) out.push({ href: '/erp/finance/petty-cash', label: 'Open petty cash' })
    if (i.doc_type === 'SUBCON_WO') out.push({ href: '/erp/subcontractors', label: 'Open subcontractors' })
    if (i.doc_type === 'WORK_ORDER') out.push({ href: '/erp/enquiries', label: 'Open enquiries and BOQ' })
    if (i.project_id) out.push({ href: `/erp/projects/${i.project_id}`, label: 'Open project' })
    return out
}

/** The chain is rebuilt from the rule label ("PROJECT_MANAGER → COMMERCIAL ...") and the current step. */
function Chain({ item }: { item: InboxItem }) {
    const roles = item.rule_label.split('→').map(s => s.trim()).filter(Boolean)
    return (
        <div className="chain" aria-label={`Approval chain, step ${item.step_order} of ${roles.length}`}>
            {roles.map((r, idx) => {
                const order = idx + 1
                const status = order < item.step_order ? 'APPROVED' : order === item.step_order ? 'PENDING' : 'WAITING'
                const signoff = item.doc_type === 'EXTRA_WORK' && order === roles.length && roles.length > 1
                return (
                    <span key={idx} style={{ display: 'contents' }}>
                        {idx > 0 ? <span className="arrow">→</span> : null}
                        <span className={`step ${status}`} style={status === 'PENDING' ? { outline: '2px solid #f59e0b', outlineOffset: 1 } : undefined}>
                            {status === 'APPROVED' ? <Icon name="check_circle" /> : status === 'PENDING' ? <Icon name="hourglass_top" /> : null}
                            {humanize(r)}{signoff ? ' + client sign-off' : ''}
                            <span className="small" style={{ fontWeight: 500 }}>{status === 'PENDING' ? ' (now)' : status === 'APPROVED' ? ' (done)' : ''}</span>
                        </span>
                    </span>
                )
            })}
        </div>
    )
}

/** What the user is told after a decision: what happened and who has it next. */
function outcome(i: InboxItem, r: DecideResult): string {
    const no = r.doc_no ?? i.doc_no ?? typeOf(i.doc_type).label
    if (r.status === 'REJECTED') return `${no} rejected. ${i.requested_by.name} has been told why.`
    if (!r.completed) {
        const roles = i.rule_label.split('→').map(s => s.trim())
        const next = roles[r.step] ? humanize(roles[r.step]) : 'the next approver'
        return `${no}: step ${r.step} of ${r.total_steps} approved. Moved to ${next}.`
    }
    const effect: Record<string, string> = {
        PO: 'The purchase order is approved and committed against the project budget.',
        EXTRA_WORK: 'The contract value is raised and the extra work is added to the project BOQ.',
        PETTY_CASH_REQ: 'The site petty cash float is funded.',
        PETTY_CASH_REPLENISH: 'The site petty cash float is replenished.',
        WORK_ORDER: 'The work order is approved. The project can now be set up.',
        SUBCON_WO: 'The subcontractor work order is approved.',
    }
    return `${no} fully approved. ${effect[i.doc_type] ?? ''}`.trim()
}

export default function InboxPage() {
    const state = useApi<{ items: InboxItem[] }>('/workflows/inbox')
    const toast = useToast()
    const { run } = useAction()
    const [tab, setTab] = useState('ALL')
    const [approving, setApproving] = useState<InboxItem | null>(null)
    const [rejecting, setRejecting] = useState<InboxItem | null>(null)
    const [now] = useState(() => Date.now())

    async function reject(item: InboxItem, reason: string) {
        const r = await run(() => api.post<DecideResult>(`/workflows/${item.doc_type}/${item.doc_id}/decide`, { decision: 'REJECT', reason }))
        if (r) {
            toast.success(outcome(item, r))
            setRejecting(null)
            await state.reload()
        }
    }

    return (
        <>
            <PageHeader title="Approval inbox" subtitle="Everything waiting for your role to approve: purchase orders, extra work, petty cash, work orders and subcontractor work orders." />
            <Async state={state}>
                {d => {
                    const items = d.items
                    const counts = new Map<string, number>()
                    for (const i of items) counts.set(i.doc_type, (counts.get(i.doc_type) ?? 0) + 1)
                    const active = tab === 'ALL' || counts.has(tab) ? tab : 'ALL'
                    const shown = active === 'ALL' ? items : items.filter(i => i.doc_type === active)
                    const flagged = items.filter(i => i.flags.boq_breach || i.flags.over_imprest).length
                    const mine = items.filter(i => i.can_decide).length
                    const oldest = items.length ? ageOf(items.reduce((a, b) => (a.requested_at < b.requested_at ? a : b)).requested_at, now) : null
                    return (
                        <>
                            <div className="kpi-grid">
                                <Kpi label="Waiting for you" value={mine} sub={`${items.length} in the queue`} tone={mine ? 'warn' : 'good'} />
                                <Kpi label="Flagged" value={flagged} sub="BOQ breach or over imprest" tone={flagged ? 'bad' : undefined} />
                                <Kpi label="Oldest request" value={oldest ? oldest.text : '—'} tone={oldest?.old ? 'bad' : undefined} />
                            </div>
                            {!items.length ? (
                                <Card><Empty title="Nothing is waiting for you" icon="inbox">New requests for your role appear here as soon as they are raised.</Empty></Card>
                            ) : (
                                <>
                                    <Tabs
                                        value={active}
                                        onChange={setTab}
                                        tabs={[{ id: 'ALL', label: 'All', count: items.length }, ...Object.keys(TYPES).filter(t => counts.has(t)).map(t => ({ id: t, label: TYPES[t].label, count: counts.get(t) }))]}
                                    />
                                    <div style={{ display: 'grid', gap: 12 }}>
                                        {shown.map(i => <ItemCard key={i.instance_id} item={i} now={now} onApprove={() => setApproving(i)} onReject={() => setRejecting(i)} />)}
                                    </div>
                                </>
                            )}
                        </>
                    )
                }}
            </Async>
            {approving ? (
                <ApproveDialog
                    key={approving.instance_id}
                    item={approving}
                    onClose={() => setApproving(null)}
                    onDone={async r => { toast.success(outcome(approving, r)); setApproving(null); await state.reload() }}
                />
            ) : null}
            <ReasonDialog
                open={!!rejecting}
                danger
                title={rejecting ? `Reject ${rejecting.doc_no ?? typeOf(rejecting.doc_type).label}` : 'Reject'}
                label="Why are you rejecting this? The requester will see your reason."
                confirmLabel="Reject"
                onClose={() => setRejecting(null)}
                onSubmit={async reason => { if (rejecting) await reject(rejecting, reason) }}
            />
        </>
    )
}

function ItemCard({ item: i, now, onApprove, onReject }: { item: InboxItem; now: number; onApprove: () => void; onReject: () => void }) {
    const t = typeOf(i.doc_type)
    const age = ageOf(i.requested_at, now)
    const f = i.flags
    const needs = i.doc_type === 'EXTRA_WORK'
        ? (i.requires_client_signoff ? 'Needs the client representative name and sign-off date' : i.step_order === 1 ? 'Needs your cost estimate' : i.step_order === 2 ? 'Needs the price quoted to the client' : null)
        : null
    return (
        <section className="card" style={{ margin: 0 }} aria-label={`${t.label} ${i.doc_no ?? ''}`}>
            <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
                <div className="row" style={{ alignItems: 'flex-start', flex: '1 1 340px', minWidth: 0, flexWrap: 'nowrap' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-light)', color: 'var(--primary)', display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0 }}>
                        <Icon name={t.icon} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 8 }}>
                            <span className="badge info">{t.label}</span>
                            <span className="strong">{i.doc_no ?? '—'}</span>
                            {f.boq_breach ? <span className="badge danger"><Icon name="warning" />BOQ breach</span> : null}
                            {f.over_imprest ? <span className="badge warning"><Icon name="warning" />Over imprest</span> : null}
                            {f.auto ? <span className="badge">Automatic</span> : null}
                        </div>
                        <div style={{ marginTop: 3, overflowWrap: 'anywhere' }}>{i.title}</div>
                        <div className="small muted" style={{ marginTop: 3 }}>
                            {i.project_code ? <>Project <Link href={`/erp/projects/${i.project_id}`}>{i.project_code}</Link>{i.project_name ? ` · ${i.project_name}` : ''} · </> : null}
                            Raised by {i.requested_by.name}
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div className="strong mono" style={{ fontSize: 18 }}>{i.amount > 0 ? inr(i.amount) : <span className="muted small">Priced during approval</span>}</div>
                    <div className="small" style={{ color: age.old ? 'var(--danger)' : 'var(--muted)', fontWeight: age.old ? 700 : 400 }}>{age.text === 'Just now' ? 'Just raised' : `Waiting ${age.text}`}</div>
                </div>
            </div>

            <div style={{ margin: '12px 0' }}><Chain item={i} /></div>

            {f.boq_breach && f.breach_lines?.length ? (
                <Alert tone="warn">
                    <div className="strong">This order goes beyond the planned BOQ material{f.breach_amount ? ` by ${inr(f.breach_amount)}` : ''}.</div>
                    <div className="table-wrap" style={{ marginTop: 8, background: '#fff' }}>
                        <table className="table">
                            <thead><tr><th>Item</th><th className="num">Planned</th><th className="num">Ordered before</th><th className="num">Ordering now</th><th className="num">Over by</th><th className="num">Over value</th></tr></thead>
                            <tbody>
                                {f.breach_lines.map((b, k) => (
                                    <tr key={k}>
                                        <td>{b.item}{b.unbudgeted ? <span className="badge danger" style={{ marginLeft: 6 }}>Not in BOQ</span> : null}</td>
                                        <td className="num">{qty(b.planned)}</td><td className="num">{qty(b.ordered_before)}</td><td className="num">{qty(b.ordering_now)}</td>
                                        <td className="num strong">{qty(b.over_qty)}</td><td className="num">{inr(b.over_value)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Alert>
            ) : null}
            {f.over_imprest ? (
                <Alert tone="warn">
                    Paying this would take the site petty cash above its imprest limit{f.balance !== undefined ? ` (current balance ${inr(f.balance)})` : ''}. Approve only if the extra float is justified.
                </Alert>
            ) : null}
            {f.auto && !f.over_imprest ? (
                <div className="small muted" style={{ marginBottom: 10 }}>Raised automatically because the site balance{f.balance !== undefined ? ` (${inr(f.balance)})` : ''} fell below its trigger.</div>
            ) : null}

            <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row small">
                    {docLinks(i).map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
                </div>
                {i.can_decide ? (
                    <div className="actions">
                        {needs ? <span className="small muted">{needs}</span> : null}
                        <Button variant="danger" icon="close" onClick={onReject}>Reject</Button>
                        <Button variant="success" icon="check" onClick={onApprove}>Approve</Button>
                    </div>
                ) : (
                    <div className="small muted row" style={{ gap: 6 }}><Icon name="lock" />{i.blocked_reason ?? 'Someone else must approve this.'}</div>
                )}
            </div>
        </section>
    )
}

function ApproveDialog({ item, onClose, onDone }: { item: InboxItem; onClose: () => void; onDone: (r: DecideResult) => Promise<void> }) {
    const { run, busy } = useAction()
    const isVar = item.doc_type === 'EXTRA_WORK'
    const variation = useApi<VariationLite>(isVar ? `/variations/${item.doc_id}` : null)
    const [cost, setCost] = useState<number | ''>('')
    const [price, setPrice] = useState<number | ''>('')
    const [clientName, setClientName] = useState('')
    const [signDate, setSignDate] = useState(isoDate())
    const [note, setNote] = useState('')

    const step1 = isVar && item.step_order === 1
    const step2 = isVar && item.step_order === 2
    const signoff = item.requires_client_signoff
    const ready = (!step1 || toNum(cost) > 0) && (!step2 || toNum(price) > 0) && (!signoff || (clientName.trim() && signDate))
    const pmCost = toNum(variation.data?.pm_estimated_cost)
    const margin = step2 && toNum(price) > 0 && pmCost > 0 ? ((toNum(price) - pmCost) / toNum(price)) * 100 : null

    async function submit() {
        const data = step1 ? { pm_estimated_cost: toNum(cost) } : step2 ? { client_price: toNum(price) } : signoff ? { client_name: clientName.trim(), client_signoff_date: signDate } : undefined
        const r = await run(() => api.post<DecideResult>(`/workflows/${item.doc_type}/${item.doc_id}/decide`, { decision: 'APPROVE', reason: note.trim() || undefined, data }))
        if (r) await onDone(r)
    }

    return (
        <Modal open title={`Approve ${item.doc_no ?? typeOf(item.doc_type).label}`} onClose={onClose} footer={
            <>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="success" icon="check" loading={busy} disabled={!ready} onClick={submit}>{item.step_order === item.total_steps ? 'Approve and finish' : 'Approve'}</Button>
            </>
        }>
            <p style={{ marginTop: 0 }}>{item.title}</p>
            <div className="small muted" style={{ marginBottom: 12 }}>
                {item.amount > 0 ? `${inr(item.amount)} · ` : ''}Step {item.step_order} of {item.total_steps} as {humanize(item.approver_role)}
            </div>
            {isVar && variation.data ? (
                <div className="small" style={{ marginBottom: 12 }}>
                    {variation.data.description} · {qty(variation.data.est_qty)} {variation.data.uom?.code}
                    {pmCost > 0 ? <> · PM estimate <span className="strong">{inr(pmCost)}</span></> : null}
                    {toNum(variation.data.client_price) > 0 ? <> · Client price <span className="strong">{inr(variation.data.client_price)}</span></> : null}
                </div>
            ) : null}
            {isVar && variation.error ? <Alert tone="danger">{variation.error}</Alert> : null}
            {step1 ? <Field label="Estimated cost of this extra work (₹)" hint="Your best estimate of what it will cost Radius 9 to carry out."><NumberInput value={cost} onChange={setCost} min={0} autoFocus /></Field> : null}
            {step2 ? (
                <Field label="Price quoted to the client (₹)" hint={margin !== null ? `Margin at this price: ${margin.toFixed(1)}%` : 'What the client will be charged for this extra work.'}>
                    <NumberInput value={price} onChange={setPrice} min={0} autoFocus />
                </Field>
            ) : null}
            {signoff ? (
                <div className="form-grid">
                    <Field label="Client representative name" hint="Who at the client signed off the extra work."><Input value={clientName} onChange={e => setClientName(e.target.value)} autoFocus /></Field>
                    <Field label="Sign-off date"><Input type="date" value={signDate} max={isoDate()} onChange={e => setSignDate(e.target.value)} /></Field>
                </div>
            ) : null}
            <Field label="Note (optional)"><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Anything the next approver or the requester should know" /></Field>
        </Modal>
    )
}
