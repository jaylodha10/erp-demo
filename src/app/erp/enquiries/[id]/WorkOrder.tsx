'use client'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, fmtDateTime, toNum } from '@/lib/format'
import { Alert, ApiSelect, ApprovalChain, Button, Card, Empty, Field, Icon, Input, Loading, Modal, Money, NumberInput, ReasonDialog, Select, StatusBadge, Textarea, useAction, useToast, type ChainStep } from '@/components/ui'
import { GST_STATES } from '../gstStates'
import type { Enquiry, WorkOrder } from './types'

interface Workflow {
    status: string
    current_step: number
    workflow_steps: (ChainStep & { step_order: number; decided_at: string | null; reason: string | null; decided_by_user: { full_name: string } | null; approver_role: { code: string; name: string } })[]
}

function Approval({ wo, onDecided }: { wo: WorkOrder; onDecided: () => Promise<void> }) {
    const { user } = useSession()
    const state = useApi<Workflow>(`/workflows/WORK_ORDER/${wo.id}`)
    const { run, busy } = useAction()
    const [rejecting, setRejecting] = useState(false)
    if (state.loading && !state.data) return <Loading label="Loading approval..." />
    if (!state.data) return state.error ? <div className="muted small">Approval details unavailable: {state.error}</div> : null
    const wf = state.data
    const pending = wf.workflow_steps.find(s => s.status === 'PENDING')
    const mine = wf.status === 'PENDING' && pending && user?.roles.includes(pending.approver_role.code)
    const rejected = wf.workflow_steps.find(s => s.status === 'REJECTED')

    async function decide(decision: 'APPROVE' | 'REJECT', reason?: string) {
        const r = await run(() => api.post(`/workflows/WORK_ORDER/${wo.id}/decide`, { decision, reason }), decision === 'APPROVE' ? 'Approval recorded' : 'Work order rejected')
        if (r) { setRejecting(false); await state.reload(); await onDecided() }
    }

    return (
        <div>
            <div className="muted small" style={{ marginBottom: 6 }}>Approval chain</div>
            <ApprovalChain steps={wf.workflow_steps} />
            {wf.status === 'PENDING' && pending ? <p className="small muted" style={{ margin: '8px 0 0' }}>Waiting for {pending.approver_role.name}.</p> : null}
            {rejected ? <p className="small" style={{ margin: '8px 0 0', color: 'var(--danger)' }}>Rejected by {rejected.decided_by_user?.full_name ?? rejected.approver_role.name}{rejected.reason ? `: ${rejected.reason}` : ''}</p> : null}
            {wf.workflow_steps.filter(s => s.status === 'APPROVED' && s.decided_at).map(s => (
                <p key={s.step_order} className="small muted" style={{ margin: '4px 0 0' }}>Approved by {s.decided_by_user?.full_name ?? s.approver_role.name} on {fmtDateTime(s.decided_at)}</p>
            ))}
            {mine ? (
                <div className="actions" style={{ marginTop: 10 }}>
                    <Button variant="success" icon="check" loading={busy} onClick={() => decide('APPROVE')}>Approve as {pending.approver_role.name}</Button>
                    <Button variant="danger" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
                </div>
            ) : null}
            <ReasonDialog open={rejecting} title="Reject work order" confirmLabel="Reject" danger onClose={() => setRejecting(false)} onSubmit={r => decide('REJECT', r)} />
        </div>
    )
}

/** Client work orders of the enquiry, their approval, and the hand-over to project setup. */
export function WorkOrderSection({ enquiry, reload, modalFor, onOpenModal, onCloseModal }: {
    enquiry: Enquiry; reload: () => Promise<void>; modalFor: { quotationId?: string } | null; onOpenModal: (quotationId?: string) => void; onCloseModal: () => void
}) {
    const { can } = useSession()
    const closed = enquiry.status === 'WON' || enquiry.status === 'LOST'
    const orders = enquiry.client_work_orders
    const open = orders.some(w => !w.project_id && (w.status === 'PENDING_APPROVAL' || w.status === 'APPROVED'))
    const usable = enquiry.quotations.filter(q => q.status === 'DRAFT' || q.status === 'SENT')
    const canCreate = can('COMMERCIAL', 'DIRECTOR') && !closed && !open

    return (
        <Card
            title="Client work order"
            sub="The signed order from the client. The Director approves it before a project can be set up."
            actions={canCreate ? <Button variant="primary" icon="add" disabled={!usable.length} title={usable.length ? undefined : 'Create a quotation first'} onClick={() => onOpenModal()}>Create work order</Button> : null}
        >
            {!orders.length ? <Empty title="No work order yet" icon="assignment">{usable.length ? 'Create it from the quotation once the client confirms.' : 'Quote the client first.'}</Empty> : null}
            {orders.map(wo => {
                const ready = wo.status === 'APPROVED' && !wo.project_id
                return (
                    <div key={wo.id} className="card" style={{ background: ready ? 'var(--success-bg)' : '#f8fafc', borderColor: ready ? '#bbf7d0' : undefined }}>
                        <div className="row" style={{ marginBottom: 10 }}>
                            <strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{wo.wo_no}</strong>
                            <StatusBadge status={wo.status} />
                            <span className="spacer" />
                            <span className="muted small">Created {fmtDate(wo.created_at)}</span>
                        </div>
                        <div className="grid cols-4" style={{ marginBottom: 12 }}>
                            <Info label="Client">{wo.client.legal_name}</Info>
                            <Info label="Client reference">{wo.client_ref_no || '—'}</Info>
                            <Info label="Contract value (excl. GST)"><Money value={wo.contract_value} /></Info>
                            <Info label="Advance / retention">{toNum(wo.advance_pct)}% / {toNum(wo.retention_pct)}%</Info>
                        </div>
                        <Approval wo={wo} onDecided={reload} />
                        {ready ? (
                            can('PROJECT_HEAD', 'COMMERCIAL', 'DIRECTOR') ? (
                                <div className="row" style={{ marginTop: 6 }}>
                                    <Link href={`/erp/projects/new?work_order_id=${wo.id}`} className="btn btn-primary" style={{ fontSize: 15, padding: '11px 20px' }}>
                                        <Icon name="rocket_launch" /> Set up project
                                    </Link>
                                    <span className="small">Approved and ready. Setting up the project marks this enquiry as Won.</span>
                                </div>
                            ) : <Alert tone="info">Approved. The Project Head or Commercial team can now set up the project.</Alert>
                        ) : null}
                        {wo.project_id && enquiry.project ? <p className="small" style={{ margin: '6px 0 0' }}>Project: <Link href={`/erp/projects/${enquiry.project.id}`} className="strong">{enquiry.project.project_code}</Link></p> : null}
                    </div>
                )
            })}
            {modalFor ? <WorkOrderModal enquiry={enquiry} initialQuotation={modalFor.quotationId} onClose={onCloseModal} onCreated={async () => { onCloseModal(); await reload() }} /> : null}
        </Card>
    )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
    return <div><div className="muted small">{label}</div><div className="strong">{children}</div></div>
}

function WorkOrderModal({ enquiry, initialQuotation, onClose, onCreated }: { enquiry: Enquiry; initialQuotation?: string; onClose: () => void; onCreated: () => Promise<void> }) {
    const toast = useToast()
    const usable = enquiry.quotations.filter(q => q.status === 'DRAFT' || q.status === 'SENT')
    const [quotationId, setQuotationId] = useState(initialQuotation && usable.some(q => q.id === initialQuotation) ? initialQuotation : usable[0]?.id ?? '')
    const quotation = usable.find(q => q.id === quotationId)
    const [contract, setContract] = useState<number | '' | undefined>(undefined)
    const [advance, setAdvance] = useState<number | ''>(0)
    const [retention, setRetention] = useState<number | ''>('')
    const [refNo, setRefNo] = useState('')
    const hasClient = Boolean(enquiry.client_id)
    const [mode, setMode] = useState<'existing' | 'new'>('existing')
    const [clientId, setClientId] = useState('')
    const [legal, setLegal] = useState(enquiry.client_name)
    const [gstin, setGstin] = useState('')
    const [pan, setPan] = useState('')
    const [billing, setBilling] = useState(enquiry.site_address ?? '')
    const [state, setState] = useState('')
    const [cName, setCName] = useState(enquiry.contact_name ?? '')
    const [cPhone, setCPhone] = useState(enquiry.contact_phone ?? '')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const defaultContract = toNum(quotation?.subtotal_amount)
    const contractValue = contract === undefined ? defaultContract : contract

    async function submit() {
        if (!quotation) { setError('Choose the quotation this work order is against'); return }
        if (contractValue === '' || contractValue <= 0) { setError('Contract value must be above zero'); return }
        const body: Record<string, unknown> = {
            enquiry_id: enquiry.id, quotation_id: quotation.id, contract_value: contractValue, advance_pct: advance === '' ? 0 : advance,
            client_ref_no: refNo.trim() || null,
        }
        if (retention !== '') body.retention_pct = retention
        if (!hasClient) {
            if (mode === 'existing') {
                if (!clientId) { setError('Choose the client'); return }
                body.client_id = clientId
            } else {
                if (!legal.trim()) { setError('Enter the client legal name'); return }
                if (!state) { setError('Choose the client GST state'); return }
                body.new_client = { legal_name: legal.trim(), gstin: gstin.trim() || null, pan: pan.trim() || null, billing_address: billing.trim() || null, state_code: state, contact_name: cName.trim() || null, contact_phone: cPhone.trim() || null }
            }
        }
        setBusy(true); setError(null)
        try {
            await api.post('/work-orders', body)
            toast.success('Work order created and sent for approval')
            await onCreated()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the work order')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal open wide title="Create client work order" onClose={onClose} footer={
            <>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" loading={busy} onClick={submit}>Create and send for approval</Button>
            </>
        }>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div className="form-grid">
                <Field label="Quotation *" className="full">
                    <Select value={quotationId} onChange={e => { setQuotationId(e.target.value); setContract(undefined) }}>
                        {usable.map(q => <option key={q.id} value={q.id}>{q.quotation_no} Rev {q.revision_no} · {q.status === 'SENT' ? 'Sent' : 'Draft'}</option>)}
                    </Select>
                </Field>
                <Field label="Contract value (₹, excl. GST) *" hint="Defaults to the quotation subtotal.">
                    <NumberInput value={contractValue} onChange={setContract} min={0} step="any" />
                </Field>
                <Field label="Client reference / PO number">
                    <Input value={refNo} onChange={e => setRefNo(e.target.value)} maxLength={80} />
                </Field>
                <Field label="Advance %"><NumberInput value={advance} onChange={setAdvance} min={0} max={100} step="any" /></Field>
                <Field label="Retention %" hint="Leave blank to use the client's default."><NumberInput value={retention} onChange={setRetention} min={0} max={100} step="any" /></Field>
            </div>

            <h4 style={{ margin: '6px 0 10px', fontSize: 14, fontWeight: 700 }}>Client</h4>
            {hasClient ? (
                <p className="small" style={{ marginTop: 0 }}>This work order is raised on <strong>{enquiry.client_name}</strong>, the client linked to the enquiry.</p>
            ) : (
                <>
                    <div className="row" role="radiogroup" aria-label="Client source" style={{ marginBottom: 12 }}>
                        <label className="checkbox"><input type="radio" name="client-mode" checked={mode === 'existing'} onChange={() => setMode('existing')} /> Existing client</label>
                        <label className="checkbox"><input type="radio" name="client-mode" checked={mode === 'new'} onChange={() => setMode('new')} /> New client</label>
                    </div>
                    {mode === 'existing' ? (
                        <Field label="Client *">
                            <ApiSelect<{ id: string; legal_name: string; code: string }> path="/masters/clients?limit=200" value={clientId} onChange={setClientId} label={c => `${c.code} · ${c.legal_name}`} placeholder="Select client..." />
                        </Field>
                    ) : (
                        <div className="form-grid">
                            <Field label="Legal name *"><Input value={legal} onChange={e => setLegal(e.target.value)} maxLength={200} /></Field>
                            <Field label="GST state *">
                                <Select value={state} onChange={e => setState(e.target.value)}>
                                    <option value="">Select state...</option>
                                    {GST_STATES.map(s => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}
                                </Select>
                            </Field>
                            <Field label="GSTIN"><Input value={gstin} onChange={e => setGstin(e.target.value.toUpperCase())} maxLength={15} /></Field>
                            <Field label="PAN"><Input value={pan} onChange={e => setPan(e.target.value.toUpperCase())} maxLength={10} /></Field>
                            <Field label="Contact name"><Input value={cName} onChange={e => setCName(e.target.value)} /></Field>
                            <Field label="Contact phone"><Input value={cPhone} onChange={e => setCPhone(e.target.value)} inputMode="tel" /></Field>
                            <Field label="Billing address" className="full"><Textarea value={billing} onChange={e => setBilling(e.target.value)} /></Field>
                        </div>
                    )}
                </>
            )}
        </Modal>
    )
}
