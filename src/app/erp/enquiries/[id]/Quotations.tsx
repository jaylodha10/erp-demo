'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, inr, isoDate, toNum } from '@/lib/format'
import { Alert, Button, Card, DataTable, Empty, Field, Input, Modal, Money, NumberInput, Select, StatusBadge, Textarea, useAction, useToast } from '@/components/ui'
import type { Enquiry, Quotation } from './types'

const total = (q: Pick<Quotation, 'subtotal_amount' | 'gst_pct'>) => toNum(q.subtotal_amount) * (1 + toNum(q.gst_pct) / 100)

function QuoteBadge({ status }: { status: string }) {
    if (status === 'ACCEPTED') return <span className="badge success">Accepted</span>
    return <StatusBadge status={status} />
}

/** Quotations of an enquiry, with revisions. A quotation can only be created from a locked BOQ. */
export function QuotationSection({ enquiry, reload, onCreateWorkOrder }: { enquiry: Enquiry; reload: () => Promise<void>; onCreateWorkOrder: (quotationId: string) => void }) {
    const { can } = useSession()
    const { run, busy } = useAction()
    const [creating, setCreating] = useState(false)
    const closed = enquiry.status === 'WON' || enquiry.status === 'LOST'
    const canCreate = can('ESTIMATION', 'COMMERCIAL', 'DIRECTOR') && !closed
    const canStatus = can('COMMERCIAL', 'DIRECTOR') && !closed
    const lockedBoqs = enquiry.boq_headers.filter(b => b.status === 'BASELINE_LOCKED')
    const boqNo = (id: string) => enquiry.boq_headers.find(b => b.id === id)?.boq_no ?? '—'
    const activeWo = enquiry.client_work_orders.some(w => !w.project_id && (w.status === 'PENDING_APPROVAL' || w.status === 'APPROVED'))

    async function setStatus(q: Quotation, status: 'SENT' | 'REJECTED') {
        const ok = await run(() => api.post(`/quotations/${q.id}/status`, { status }), status === 'SENT' ? 'Quotation marked as sent' : 'Quotation marked as rejected')
        if (ok) await reload()
    }

    return (
        <Card
            title="Quotations"
            sub="A new revision supersedes the draft or sent quotation before it."
            actions={canCreate ? (
                <Button variant="primary" icon="add" onClick={() => setCreating(true)} disabled={!lockedBoqs.length} title={lockedBoqs.length ? undefined : 'Lock a BOQ as baseline first'}>
                    {enquiry.quotations.length ? 'New revision' : 'Create quotation'}
                </Button>
            ) : null}
        >
            {!lockedBoqs.length && canCreate ? <Alert tone="info">Lock a BOQ as a baseline to quote from it. Open the BOQ builder above and choose &quot;Lock as baseline&quot;.</Alert> : null}
            <DataTable<Quotation>
                rows={enquiry.quotations}
                empty={<Empty title="No quotation yet" icon="description" />}
                columns={[
                    { key: 'quotation_no', header: 'Quotation', render: q => <span style={{ whiteSpace: 'nowrap' }}><span className="strong">{q.quotation_no}</span> <span className="muted">Rev {q.revision_no}</span></span> },
                    { key: 'boq', header: 'BOQ', render: q => <span style={{ whiteSpace: 'nowrap' }}>{boqNo(q.boq_id)}</span> },
                    { key: 'quotation_date', header: 'Date', render: q => fmtDate(q.quotation_date) },
                    { key: 'valid_until', header: 'Valid until', render: q => fmtDate(q.valid_until) },
                    { key: 'subtotal_amount', header: 'Subtotal', align: 'right', render: q => <Money value={q.subtotal_amount} /> },
                    { key: 'gst_pct', header: 'GST', align: 'right', render: q => `${toNum(q.gst_pct)}%` },
                    { key: 'total', header: 'Total incl. GST', align: 'right', render: q => <Money value={total(q)} /> },
                    { key: 'status', header: 'Status', render: q => <QuoteBadge status={q.status} /> },
                    {
                        key: 'actions', header: '', align: 'right', render: q => {
                            const live = q.status === 'DRAFT' || q.status === 'SENT'
                            if (!canStatus || !live) return null
                            return (
                                <div className="actions" style={{ justifyContent: 'flex-end' }}>
                                    {q.status === 'DRAFT' ? <Button size="sm" icon="send" disabled={busy} onClick={() => setStatus(q, 'SENT')}>Mark sent</Button> : null}
                                    {!activeWo ? <Button size="sm" variant="primary" disabled={busy} onClick={() => onCreateWorkOrder(q.id)}>Create work order</Button> : null}
                                    <Button size="sm" variant="danger" disabled={busy} onClick={() => setStatus(q, 'REJECTED')}>Mark rejected</Button>
                                </div>
                            )
                        },
                    },
                ]}
            />
            {creating ? <QuotationModal enquiry={enquiry} onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await reload() }} /> : null}
        </Card>
    )
}

function QuotationModal({ enquiry, onClose, onCreated }: { enquiry: Enquiry; onClose: () => void; onCreated: () => Promise<void> }) {
    const toast = useToast()
    const locked = enquiry.boq_headers.filter(b => b.status === 'BASELINE_LOCKED')
    const [boqId, setBoqId] = useState(locked[0]?.id ?? '')
    const [validUntil, setValidUntil] = useState(isoDate(new Date(Date.now() + 30 * 86400000)))
    const [gst, setGst] = useState<number | ''>(18)
    const [terms, setTerms] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const boq = locked.find(b => b.id === boqId)
    const subtotal = toNum(boq?.sell_total)
    const gstAmt = subtotal * toNum(gst) / 100
    const hasActive = enquiry.quotations.some(q => q.status === 'DRAFT' || q.status === 'SENT')

    async function submit() {
        if (!boqId) { setError('Choose a locked BOQ'); return }
        if (gst === '' || gst < 0 || gst > 100) { setError('GST % must be between 0 and 100'); return }
        setBusy(true); setError(null)
        try {
            await api.post(`/enquiries/${enquiry.id}/quotations`, { boq_id: boqId, valid_until: validUntil || undefined, gst_pct: gst, terms: terms.trim() || undefined })
            toast.success(enquiry.quotations.length ? 'Quotation revision created' : 'Quotation created')
            await onCreated()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the quotation')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal open title={enquiry.quotations.length ? 'New quotation revision' : 'Create quotation'} onClose={onClose} footer={
            <>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" loading={busy} onClick={submit}>Create quotation</Button>
            </>
        }>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {hasActive ? <Alert tone="warn">The current draft or sent quotation will be marked as superseded.</Alert> : null}
            <Field label="Locked BOQ *">
                <Select value={boqId} onChange={e => setBoqId(e.target.value)}>
                    {locked.map(b => <option key={b.id} value={b.id}>{b.boq_no} (v{b.version_no}) · {inr(b.sell_total)}</option>)}
                </Select>
            </Field>
            <div className="form-grid">
                <Field label="GST %"><NumberInput value={gst} onChange={setGst} min={0} max={100} step="any" /></Field>
                <Field label="Valid until"><Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></Field>
            </div>
            <Field label="Terms (optional)"><Textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder="Payment schedule, exclusions, validity notes" /></Field>
            <div className="card" style={{ marginBottom: 0, background: '#f8fafc' }}>
                <div className="row"><span className="muted">Subtotal (BOQ selling total)</span><span className="spacer" /><Money value={subtotal} /></div>
                <div className="row"><span className="muted">GST</span><span className="spacer" /><Money value={gstAmt} /></div>
                <div className="row strong"><span>Total</span><span className="spacer" /><Money value={subtotal + gstAmt} /></div>
            </div>
        </Modal>
    )
}
