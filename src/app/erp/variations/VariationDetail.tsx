'use client'
import Link from 'next/link'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, fmtDateTime, humanize, inr, pct, qty, toNum } from '@/lib/format'
import { Alert, Async, Button, Icon, Modal, StatusBadge, useAction } from '@/components/ui'

/** Shared by the Extra Work tracker (WEB-07) and the project workspace's Extra work tab (WEB-06). */

export const VAR_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'WORK_COMPLETED', 'BILLED', 'PAID', 'REJECTED'] as const

export interface VariationChainStep { step: number; role: string; status: string; client_signoff: boolean }
export interface VariationRow {
    id: string
    var_no: string
    description: string
    status: string
    project_id: string
    project: { project_code: string; name: string }
    site: { code: string; city: string } | null
    cost_centre: { code: string } | null
    uom: { code: string } | null
    est_qty: number
    pm_estimated_cost: number | null
    client_price: number | null
    margin_pct: number | null
    created_at: string
    requested_by_user: { full_name: string } | null
    chain: VariationChainStep[]
    current_gate: string | null
}

/** Plain-language name of each gate in the 4-step extra work chain. */
export function gateName(step: number, total: number, signoff?: boolean): string {
    if (signoff || (total === 4 && step === 4)) return 'Client sign-off'
    if (step === 1) return 'PM cost estimate'
    if (step === 2) return 'Commercial pricing'
    if (step === 3) return 'Director approval'
    return `Step ${step}`
}

/** "Step 2 of 4: Commercial pricing (Commercial)" for the pending step of a list row. */
export function currentGate(row: Pick<VariationRow, 'chain' | 'status'>): string | null {
    const pending = row.chain.find(s => s.status === 'PENDING')
    if (!pending) return null
    return `Step ${pending.step} of ${row.chain.length}: ${gateName(pending.step, row.chain.length, pending.client_signoff)} (${humanize(pending.role)})`
}

export function ageLabel(from: string, now: number): string {
    const ms = Math.max(0, now - new Date(from).getTime())
    const d = Math.floor(ms / 86400000)
    if (d >= 1) return `${d}d`
    const h = Math.floor(ms / 3600000)
    return h >= 1 ? `${h}h` : 'Just now'
}

export function MarginBadge({ value }: { value: number | null | undefined }) {
    if (value === null || value === undefined) return <span className="muted">—</span>
    const v = toNum(value)
    return <span className={`badge ${v < 10 ? 'danger' : v < 20 ? 'warning' : 'success'}`}>{pct(v)}</span>
}

interface StepDetail {
    step_order: number
    status: string
    requires_client_signoff: boolean
    approver_role: { code: string; name: string }
    decided_by_user: { full_name: string } | null
    decided_at: string | null
    reason: string | null
    data_json: Record<string, unknown> | null
}
interface VariationFull {
    id: string
    var_no: string
    description: string
    status: string
    reason: string
    est_qty: number
    pm_estimated_cost: number | null
    client_price: number | null
    margin_pct: number | null
    client_rep_name: string | null
    client_approved_by: string | null
    client_approved_on: string | null
    reference_photo_url: string | null
    billed_invoice_id: string | null
    created_at: string
    project_id: string
    project: { project_code: string; name: string }
    site: { code: string } | null
    cost_centre: { code: string; name: string } | null
    uom: { code: string } | null
    requested_by_user: { full_name: string } | null
    addendum_boq_line: { code: string } | null
    workflow: { status: string; current_step: number; total_steps: number; workflow_steps: StepDetail[] } | null
}

const COMPLETE_ROLES = ['PROJECT_MANAGER', 'SITE_SUPERVISOR', 'SITE_ENGINEER', 'PROJECT_HEAD', 'DIRECTOR']

function stepIcon(status: string) {
    if (status === 'APPROVED') return <Icon name="check_circle" />
    if (status === 'REJECTED') return <Icon name="cancel" />
    if (status === 'PENDING') return <Icon name="hourglass_top" />
    return <Icon name="radio_button_unchecked" />
}

function stepNote(s: StepDetail): string[] {
    const d = s.data_json ?? {}
    const out: string[] = []
    if (toNum(d.pm_estimated_cost) > 0) out.push(`Estimated cost ${inr(d.pm_estimated_cost)}`)
    if (toNum(d.client_price) > 0) out.push(`Client price ${inr(d.client_price)}`)
    if (d.client_name) out.push(`Signed off by ${String(d.client_name)}${d.client_signoff_date ? ` on ${fmtDate(d.client_signoff_date)}` : ''}`)
    return out
}

export function VariationDetail({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) {
    const { can } = useSession()
    const state = useApi<VariationFull>(id ? `/variations/${id}` : null)
    const { run, busy } = useAction()
    const v = id ? state.data : null

    async function complete() {
        if (!id) return
        const r = await run(() => api.post(`/variations/${id}/complete`), 'Marked as work completed. It can now be billed to the client.')
        if (r) { await state.reload(); onChanged?.() }
    }

    const footer = v ? (
        <>
            {v.status === 'APPROVED' && can(...COMPLETE_ROLES) ? (
                <Button variant="success" icon="task_alt" loading={busy} onClick={complete}>Mark work completed</Button>
            ) : null}
            {v.status === 'PENDING_APPROVAL' && can('PROJECT_MANAGER', 'COMMERCIAL', 'DIRECTOR', 'PROJECT_HEAD') ? (
                <Link href="/erp/inbox" className="btn btn-primary"><Icon name="inbox" />Decide in approval inbox</Link>
            ) : null}
            {v.status === 'BILLED' || v.status === 'PAID' ? (
                <Link href="/erp/finance/sales-invoices" className="btn btn-primary"><Icon name="request_page" />View client invoices</Link>
            ) : null}
            <Button onClick={onClose}>Close</Button>
        </>
    ) : <Button onClick={onClose}>Close</Button>

    return (
        <Modal open={!!id} wide title={v ? `${v.var_no}: extra work` : 'Extra work'} onClose={onClose} footer={footer}>
            {id ? (
                <Async state={state}>
                    {d => {
                        const steps = d.workflow?.workflow_steps ?? []
                        return (
                            <div style={{ display: 'grid', gap: 16 }}>
                                <div className="row" style={{ justifyContent: 'space-between' }}>
                                    <div>
                                        <div className="strong">{d.description}</div>
                                        <div className="small muted">
                                            <Link href={`/erp/projects/${d.project_id}`}>{d.project.project_code}</Link> · {d.project.name}
                                            {d.site ? ` · ${d.site.code}` : ''}
                                        </div>
                                    </div>
                                    <StatusBadge status={d.status} />
                                </div>

                                {d.status === 'REJECTED' ? <Alert tone="danger">This extra work was rejected. See the reason in the approval chain below. A new request is needed to raise it again.</Alert> : null}
                                {d.status === 'APPROVED' ? <Alert tone="success">All four gates are cleared and the contract value has been raised. When the work is done on site, mark it completed so it can be billed.</Alert> : null}

                                <div className="grid cols-4">
                                    <div><div className="small muted">PM estimated cost</div><div className="strong mono">{d.pm_estimated_cost ? inr(d.pm_estimated_cost) : '—'}</div></div>
                                    <div><div className="small muted">Client price</div><div className="strong mono">{d.client_price ? inr(d.client_price) : '—'}</div></div>
                                    <div><div className="small muted">Margin</div><div><MarginBadge value={d.margin_pct} /></div></div>
                                    <div><div className="small muted">Estimated quantity</div><div className="strong mono">{qty(d.est_qty)} {d.uom?.code ?? ''}</div></div>
                                </div>

                                <div className="grid cols-3 small">
                                    <div><span className="muted">Cost centre: </span>{d.cost_centre ? `${d.cost_centre.code} · ${d.cost_centre.name}` : '—'}</div>
                                    <div><span className="muted">Reason: </span>{humanize(d.reason)}</div>
                                    <div><span className="muted">Raised by: </span>{d.requested_by_user?.full_name ?? '—'} on {fmtDate(d.created_at)}</div>
                                    <div><span className="muted">Client contact: </span>{d.client_rep_name ?? '—'}</div>
                                    <div><span className="muted">Client approved: </span>{d.client_approved_by ? `${d.client_approved_by}, ${fmtDate(d.client_approved_on)}` : '—'}</div>
                                    <div>
                                        <span className="muted">Reference photo: </span>
                                        {d.reference_photo_url ? <a href={d.reference_photo_url} target="_blank" rel="noreferrer">Open</a> : '—'}
                                    </div>
                                </div>

                                <div>
                                    <h4 style={{ marginBottom: 8 }}>Approval chain</h4>
                                    {!steps.length ? <div className="muted small">No approval chain was recorded for this request.</div> : (
                                        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                                            {steps.map(s => {
                                                const notes = stepNote(s)
                                                return (
                                                    <li key={s.step_order} className="card" style={{ margin: 0, padding: 12, borderColor: s.status === 'PENDING' ? '#fde68a' : undefined }}>
                                                        <div className="row" style={{ justifyContent: 'space-between' }}>
                                                            <div className="strong row" style={{ gap: 6 }}>
                                                                {stepIcon(s.status)}
                                                                {s.step_order}. {gateName(s.step_order, steps.length, s.requires_client_signoff)}
                                                                <span className="muted small" style={{ fontWeight: 500 }}>({s.approver_role.name})</span>
                                                            </div>
                                                            <span className={`badge ${s.status === 'APPROVED' ? 'success' : s.status === 'REJECTED' ? 'danger' : s.status === 'PENDING' ? 'warning' : ''}`}>
                                                                {s.status === 'PENDING' ? 'Waiting now' : s.status === 'WAITING' ? 'Not reached yet' : humanize(s.status)}
                                                            </span>
                                                        </div>
                                                        {s.decided_at ? (
                                                            <div className="small muted" style={{ marginTop: 4 }}>
                                                                {s.status === 'REJECTED' ? 'Rejected' : 'Approved'} by {s.decided_by_user?.full_name ?? 'unknown'} on {fmtDateTime(s.decided_at)}
                                                            </div>
                                                        ) : null}
                                                        {notes.length ? <div className="small" style={{ marginTop: 4 }}>{notes.join(' · ')}</div> : null}
                                                        {s.reason ? <div className="small" style={{ marginTop: 4 }}>Reason: {s.reason}</div> : null}
                                                    </li>
                                                )
                                            })}
                                        </ol>
                                    )}
                                </div>

                                <div className="card" style={{ margin: 0, padding: 12 }}>
                                    <div className="strong" style={{ marginBottom: 4 }}>Addendum BOQ line</div>
                                    {d.addendum_boq_line ? (
                                        <div className="small">
                                            Added to the project BOQ as <span className="strong">{d.addendum_boq_line.code}</span>
                                            {d.client_price ? `, selling ${inr(d.client_price)} against a cost of ${inr(d.pm_estimated_cost)}` : ''}.
                                            {' '}<Link href={`/erp/projects/${d.project_id}`}>See the project BOQ</Link>
                                        </div>
                                    ) : <div className="small muted">Created automatically once the final client sign-off is recorded.</div>}
                                </div>
                            </div>
                        )
                    }}
                </Async>
            ) : null}
        </Modal>
    )
}
