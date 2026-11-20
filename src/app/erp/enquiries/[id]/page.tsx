'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, fmtDateTime, isoDate, qty } from '@/lib/format'
import { Alert, Async, Button, Card, Empty, Field, Icon, Input, Modal, Money, PageHeader, ReasonDialog, Select, StatusBadge, Textarea, useAction, useToast } from '@/components/ui'
import { EnquiryFormModal } from '../EnquiryFormModal'
import { statusLabel } from '../labels'
import { BoqSection } from './Boqs'
import { QuotationSection } from './Quotations'
import { WorkOrderSection } from './WorkOrder'
import { STEPS, stepIndex, type Enquiry } from './types'

function Info({ label, children }: { label: string; children: ReactNode }) {
    return <div style={{ marginBottom: 12 }}><div className="muted small">{label}</div><div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{children || '—'}</div></div>
}

export default function EnquiryDetailPage() {
    const { id } = useParams<{ id: string }>()
    const state = useApi<Enquiry>(`/enquiries/${id}`)
    return (
        <>
            <div className="small" style={{ marginBottom: 8 }}><Link href="/erp/enquiries">&larr; All enquiries</Link></div>
            <Async state={state}>{e => <Detail enquiry={e} reload={state.reload} />}</Async>
        </>
    )
}

function Detail({ enquiry: e, reload }: { enquiry: Enquiry; reload: () => Promise<void> }) {
    const { can } = useSession()
    const toast = useToast()
    const { run, busy } = useAction()
    const [editing, setEditing] = useState(false)
    const [moving, setMoving] = useState(false)
    const [losing, setLosing] = useState(false)
    const [woModal, setWoModal] = useState<{ quotationId?: string } | null>(null)

    const closed = e.status === 'WON' || e.status === 'LOST'
    const canEdit = can('COMMERCIAL', 'DIRECTOR')
    const cur = stepIndex(e.status)

    async function markLost(reason: string) {
        const r = await run(() => api.post(`/enquiries/${e.id}/status`, { status: 'LOST', outcome_reason: reason }), 'Enquiry marked as lost')
        if (r) { setLosing(false); await reload() }
    }

    const workOrder = <WorkOrderSection enquiry={e} reload={reload} modalFor={woModal} onOpenModal={q => setWoModal({ quotationId: q })} onCloseModal={() => setWoModal(null)} />

    return (
        <>
            <PageHeader
                title={`${e.enquiry_no} · ${e.project_name}`}
                subtitle={<>{e.client_name}{e.site_city ? ` · ${e.site_city}` : ''} · <StatusBadge status={e.status} label={statusLabel(e.status)} /></>}
                actions={canEdit && !closed ? (
                    <>
                        <Button icon="edit" onClick={() => setEditing(true)}>Edit</Button>
                        <Button variant="danger" icon="block" onClick={() => setLosing(true)}>Mark lost</Button>
                    </>
                ) : null}
            />

            {e.status === 'LOST' ? <Alert tone="danger"><strong>Lost.</strong> {e.outcome_reason ?? 'No reason recorded.'}</Alert> : null}
            {e.status === 'WON' && e.project ? <Alert tone="success"><strong>Won.</strong> Project <Link href={`/erp/projects/${e.project.id}`} className="strong">{e.project.project_code}</Link> was set up from this enquiry.</Alert> : null}

            <Card title="Status" sub={closed ? undefined : 'Moves forward only. Won is set automatically when the project is set up from an approved work order.'}
                actions={canEdit && !closed && cur < STEPS.length - 2 ? <Button variant="primary" icon="arrow_forward" onClick={() => setMoving(true)}>Move to next stage</Button> : null}>
                <ol className="chain" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Enquiry progress">
                    {STEPS.map((s, i) => {
                        const done = e.status === 'WON' ? true : e.status !== 'LOST' && i < cur
                        const current = e.status !== 'WON' && e.status !== 'LOST' && i === cur
                        return (
                            <li key={s.id} style={{ display: 'contents' }}>
                                {i > 0 ? <span className="arrow" aria-hidden="true">→</span> : null}
                                <span className={`step ${done ? 'APPROVED' : current ? 'PENDING' : ''}`} aria-current={current ? 'step' : undefined}>
                                    {done ? <Icon name="check_circle" /> : null}
                                    {s.label}
                                    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{done ? ' (done)' : current ? ' (current)' : ' (pending)'}</span>
                                </span>
                            </li>
                        )
                    })}
                    {e.status === 'LOST' ? <li style={{ display: 'contents' }}><span className="arrow" aria-hidden="true">→</span><span className="step REJECTED"><Icon name="cancel" />Lost</span></li> : null}
                </ol>
            </Card>

            {/* Once a work order exists it is the most important card, so it moves to the top. */}
            {e.client_work_orders.length ? workOrder : null}
            <BoqSection enquiry={e} />
            <QuotationSection enquiry={e} reload={reload} onCreateWorkOrder={q => setWoModal({ quotationId: q })} />
            {e.client_work_orders.length ? null : workOrder}

            <div className="grid cols-2">
                <Card title="Enquiry details">
                    <div className="form-grid">
                        <Info label="Client">{e.client_name}</Info>
                        <Info label="Contact">{[e.contact_name, e.contact_phone].filter(Boolean).join(' · ')}</Info>
                        <Info label="Project">{e.project_name}</Info>
                        <Info label="Project type">{e.project_type?.name}</Info>
                        <Info label="City">{e.site_city}</Info>
                        <Info label="Carpet area">{e.carpet_area_sqft ? `${qty(e.carpet_area_sqft, 0)} sqft` : ''}</Info>
                        <Info label="Expected value"><Money value={e.expected_value} /></Info>
                        <Info label="Lead source">{e.lead_source}</Info>
                        <Info label="Owner">{e.sales_person?.full_name}</Info>
                        <Info label="Enquiry date">{fmtDate(e.enquiry_date)}</Info>
                        <Info label="Site visit">{e.site_visit_date ? fmtDate(e.site_visit_date) : ''}</Info>
                        <Info label="Next follow-up">{e.next_followup_date ? fmtDate(e.next_followup_date) : ''}</Info>
                    </div>
                    <Info label="Site address">{e.site_address}</Info>
                    <Info label="Notes">{e.notes}</Info>
                </Card>
                <Card title="Activity">
                    {e.enquiry_activities.length ? (
                        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {e.enquiry_activities.map(a => (
                                <li key={a.id} style={{ display: 'flex', gap: 12, paddingBottom: 14 }}>
                                    <Icon name={a.activity_type === 'STATUS_CHANGE' ? 'swap_horiz' : 'chat'} className="muted" />
                                    <div style={{ minWidth: 0 }}>
                                        <div className="strong">
                                            {a.to_status ? <>{a.from_status ? <><StatusBadge status={a.from_status} label={statusLabel(a.from_status)} /> → </> : null}<StatusBadge status={a.to_status} label={statusLabel(a.to_status)} /></> : a.activity_type}
                                        </div>
                                        {a.note ? <div className="small" style={{ overflowWrap: 'anywhere' }}>{a.note}</div> : null}
                                        <div className="muted small">{fmtDateTime(a.created_at)}{a.created_by_user ? ` · ${a.created_by_user.full_name}` : ''}</div>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    ) : <Empty title="No activity yet" />}
                </Card>
            </div>

            <EnquiryFormModal open={editing} initial={e} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); toast.success('Enquiry updated'); await reload() }} />
            <MoveModal open={moving} enquiry={e} onClose={() => setMoving(false)} onMoved={async () => { setMoving(false); await reload() }} />
            <ReasonDialog open={losing} title="Mark enquiry as lost" label="Why was this enquiry lost?" confirmLabel={busy ? 'Saving...' : 'Mark lost'} danger onClose={() => setLosing(false)} onSubmit={markLost} />
        </>
    )
}

function MoveModal({ open, enquiry, onClose, onMoved }: { open: boolean; enquiry: Enquiry; onClose: () => void; onMoved: () => Promise<void> }) {
    if (!open) return null
    return <MoveForm enquiry={enquiry} onClose={onClose} onMoved={onMoved} />
}

function MoveForm({ enquiry, onClose, onMoved }: { enquiry: Enquiry; onClose: () => void; onMoved: () => Promise<void> }) {
    const toast = useToast()
    const options = STEPS.filter((s, i) => s.id !== 'WON' && i > stepIndex(enquiry.status))
    const [status, setStatus] = useState(options[0]?.id ?? '')
    const [note, setNote] = useState('')
    const [visit, setVisit] = useState(isoDate())
    const [followup, setFollowup] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function submit() {
        setBusy(true); setError(null)
        try {
            await api.post(`/enquiries/${enquiry.id}/status`, {
                status, note: note.trim() || undefined, site_visit_date: status === 'SITE_VISIT' ? visit : undefined, next_followup_date: followup || undefined,
            })
            toast.success('Status updated')
            await onMoved()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not update the status')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal open title="Move enquiry forward" onClose={onClose} footer={
            <>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" loading={busy} disabled={!status} onClick={submit}>Update status</Button>
            </>
        }>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="New status">
                <Select value={status} onChange={e => setStatus(e.target.value)}>
                    {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
            </Field>
            {status === 'SITE_VISIT' ? <Field label="Site visit date"><Input type="date" value={visit} onChange={e => setVisit(e.target.value)} /></Field> : null}
            <Field label="Next follow-up date (optional)"><Input type="date" value={followup} onChange={e => setFollowup(e.target.value)} /></Field>
            <Field label="Note (optional)"><Textarea value={note} onChange={e => setNote(e.target.value)} /></Field>
        </Modal>
    )
}
