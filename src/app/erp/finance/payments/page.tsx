'use client'
import { useState } from 'react'
import Link from 'next/link'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, inr, isoDate, toNum } from '@/lib/format'
import { Alert, Button, Card, DataTable, Empty, Field, Input, Kpi, Modal, NumberInput, PageHeader, Select, StatusBadge, Tabs, Textarea } from '@/components/ui'
import { BANK_MODES, MathRow, MathTable, SearchBox, r2, useFormAction } from '../_components/common'

interface PayableInvoice { id: string; invoice_no: string; party: string; project_code: string; status: string; balance_due: number; hold_reason: string | null }
interface PayableBill { id: string; bill_no: string; party: string; project_code: string; status: string; balance_due: number }
interface Payables { vendor_invoices: PayableInvoice[]; subcontractor_bills: PayableBill[]; total_payable: number; total_on_hold: number }
interface Payment {
    id: string; payment_no: string; payment_date: string; party_type: 'VENDOR' | 'SUBCONTRACTOR'; amount_paid: number; payment_mode: string; utr_reference_no: string | null; remarks: string | null
    vendor: { legal_name: string } | null; subcontractor: { legal_name: string } | null; project: { project_code: string }
    purchase_invoice: { invoice_no: string } | null; subcontractor_bill: { bill_no: string } | null
}
type Party = 'VENDOR' | 'SUBCONTRACTOR'
type View = 'PAYABLE' | 'REGISTER'
const PAYABLE_STATES = ['APPROVED', 'PARTIALLY_PAID']
const payLabel = (s: string) => (s === 'PARTIALLY_PAID' ? 'Part paid' : undefined)

export default function PaymentsPage() {
    const { can } = useSession()
    const canPay = can('ACCOUNTS', 'DIRECTOR')
    const payables = useApi<Payables>('/finance/payables')
    const payments = useApi<{ items: Payment[] }>('/finance/vendor-payments')
    const [view, setView] = useState<View>('PAYABLE')
    const [search, setSearch] = useState('')
    const [partyFilter, setPartyFilter] = useState<'' | Party>('')
    const [paying, setPaying] = useState<{ party: Party; id: string } | null>(null)

    const q = search.trim().toLowerCase()
    const inv = (payables.data?.vendor_invoices ?? []).filter(i => !q || [i.invoice_no, i.party, i.project_code].some(t => t.toLowerCase().includes(q)))
    const bills = (payables.data?.subcontractor_bills ?? []).filter(b => !q || [b.bill_no, b.party, b.project_code].some(t => t.toLowerCase().includes(q)))
    const reg = (payments.data?.items ?? []).filter(p => (!partyFilter || p.party_type === partyFilter)
        && (!q || [p.payment_no, p.utr_reference_no ?? '', p.vendor?.legal_name ?? '', p.subcontractor?.legal_name ?? '', p.purchase_invoice?.invoice_no ?? '', p.subcontractor_bill?.bill_no ?? '', p.project.project_code].some(t => t.toLowerCase().includes(q))))

    const drafts = (payables.data?.vendor_invoices ?? []).filter(i => i.status === 'DRAFT')
    const draftValue = drafts.reduce((s, i) => s + toNum(i.balance_due), 0)
    const paidTotal = (payments.data?.items ?? []).reduce((s, p) => s + toNum(p.amount_paid), 0)
    const onHold = (payables.data?.vendor_invoices ?? []).filter(i => i.status === 'HOLD_MISMATCH').length

    function refresh() { void payables.reload(); void payments.reload() }

    return (
        <>
            <PageHeader
                title="Vendor and subcontractor payments"
                subtitle="Pay approved vendor invoices and approved subcontractor running bills. Invoices on hold for a short or damaged delivery cannot be paid, and unapproved drafts must be approved first."
                actions={canPay ? <Button variant="primary" icon="payments" onClick={() => setPaying({ party: 'VENDOR', id: '' })}>Record payment</Button> : null}
            />

            <div className="kpi-grid">
                <Kpi label="Total payable" value={inr(payables.data?.total_payable ?? 0)} sub={draftValue > 0 ? `includes ${inr(draftValue)} not yet approved` : 'approved invoices and bills'} />
                <Kpi label="On hold" value={inr(payables.data?.total_on_hold ?? 0)} sub={`${onHold} invoice${onHold === 1 ? '' : 's'} blocked by a delivery mismatch`} tone={onHold ? 'bad' : undefined} />
                <Kpi label="Awaiting approval" value={String(drafts.length)} sub="draft vendor invoices" tone={drafts.length ? 'warn' : undefined} />
                <Kpi label="Paid to date" value={inr(paidTotal)} sub={`${payments.data?.items.length ?? 0} payment${payments.data?.items.length === 1 ? '' : 's'} in the register`} tone="good" />
            </div>

            <Card>
                <Tabs<View> value={view} onChange={setView} tabs={[
                    { id: 'PAYABLE', label: 'Payables', count: (payables.data?.vendor_invoices.length ?? 0) + (payables.data?.subcontractor_bills.length ?? 0) },
                    { id: 'REGISTER', label: 'Payment register', count: payments.data?.items.length ?? 0 },
                ]} />
                <div className="row" style={{ marginBottom: 12 }}>
                    <SearchBox value={search} onChange={setSearch} placeholder="Party, document or project" label="Search payments" />
                    {view === 'REGISTER' ? (
                        <div style={{ width: 200 }}>
                            <Field>
                                <Select aria-label="Party type" value={partyFilter} onChange={e => setPartyFilter(e.target.value as '' | Party)}>
                                    <option value="">All parties</option><option value="VENDOR">Vendors</option><option value="SUBCONTRACTOR">Subcontractors</option>
                                </Select>
                            </Field>
                        </div>
                    ) : null}
                </div>

                {view === 'PAYABLE' ? (
                    payables.error && !payables.data ? <Alert tone="danger">{payables.error} <Button size="sm" onClick={() => void payables.reload()}>Try again</Button></Alert>
                        : !payables.data ? <Empty title="Loading payables..." icon="progress_activity" /> : (
                            <>
                                <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Vendor invoices</h3>
                                {inv.length === 0 ? <div className="table-wrap"><Empty title="No vendor invoices to pay" icon="description" /></div> : (
                                    <div className="table-wrap">
                                        <table className="table">
                                            <thead><tr><th>Invoice</th><th>Vendor</th><th>Project</th><th className="num">Balance due</th><th>Status</th><th /></tr></thead>
                                            <tbody>
                                                {inv.map(i => {
                                                    const blocked = i.status === 'HOLD_MISMATCH' || i.status === 'DRAFT'
                                                    return (
                                                        <tr key={i.id} style={blocked ? { background: '#f8fafc' } : undefined}>
                                                            <td className="strong" style={blocked ? { color: 'var(--muted)' } : undefined}>{i.invoice_no}</td>
                                                            <td style={blocked ? { color: 'var(--muted)' } : undefined}>{i.party}</td>
                                                            <td style={blocked ? { color: 'var(--muted)' } : undefined}>{i.project_code}</td>
                                                            <td className="num" style={blocked ? { color: 'var(--muted)' } : undefined}>{inr(i.balance_due)}</td>
                                                            <td>
                                                                <StatusBadge status={i.status} label={payLabel(i.status)} />
                                                                {i.status === 'HOLD_MISMATCH' ? <div className="small" style={{ color: 'var(--danger)', maxWidth: 320, marginTop: 4 }}>{i.hold_reason ?? 'Unresolved short or damaged delivery'}</div> : null}
                                                                {i.status === 'DRAFT' ? <div className="small muted" style={{ marginTop: 4 }}>Approve it on <Link href="/erp/finance/purchase-invoices">Purchase invoices</Link> before paying.</div> : null}
                                                            </td>
                                                            <td>
                                                                {PAYABLE_STATES.includes(i.status) && canPay ? <Button size="sm" variant="primary" onClick={() => setPaying({ party: 'VENDOR', id: i.id })}>Pay</Button> : null}
                                                                {i.status === 'HOLD_MISMATCH' ? <span className="muted small">Payment blocked</span> : null}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                <h3 style={{ fontSize: 14, margin: '18px 0 8px' }}>Subcontractor running bills</h3>
                                <DataTable<PayableBill> rows={bills} empty={<Empty title="No approved running bills to pay" icon="engineering" />}
                                    columns={[
                                        { key: 'bill_no', header: 'Running bill', render: b => <span className="strong">{b.bill_no}</span> },
                                        { key: 'party', header: 'Subcontractor' },
                                        { key: 'project_code', header: 'Project' },
                                        { key: 'balance_due', header: 'Balance due', align: 'right', render: b => inr(b.balance_due) },
                                        { key: 'status', header: 'Status', render: b => <StatusBadge status={b.status} label={payLabel(b.status)} /> },
                                        { key: 'actions', header: '', render: b => canPay ? <Button size="sm" variant="primary" onClick={() => setPaying({ party: 'SUBCONTRACTOR', id: b.id })}>Pay</Button> : null },
                                    ]}
                                    rowKey={b => b.id} />
                            </>
                        )
                ) : payments.error && !payments.data ? <Alert tone="danger">{payments.error} <Button size="sm" onClick={() => void payments.reload()}>Try again</Button></Alert>
                    : !payments.data ? <Empty title="Loading payments..." icon="progress_activity" /> : (
                        <DataTable<Payment> rows={reg} empty={<Empty title={payments.data.items.length ? 'No payments match' : 'No payments recorded yet'} icon="payments" />}
                            columns={[
                                { key: 'payment_no', header: 'Payment', render: p => <><div className="strong">{p.payment_no}</div><div className="muted small">{fmtDate(p.payment_date)}</div></> },
                                { key: 'party', header: 'Paid to', render: p => <><div>{p.vendor?.legal_name ?? p.subcontractor?.legal_name ?? '—'}</div><div className="muted small">{p.party_type === 'VENDOR' ? 'Vendor' : 'Subcontractor'}</div></> },
                                { key: 'project', header: 'Project', render: p => p.project.project_code },
                                { key: 'against', header: 'Against', render: p => p.purchase_invoice?.invoice_no ?? p.subcontractor_bill?.bill_no ?? '—' },
                                { key: 'amount_paid', header: 'Amount', align: 'right', render: p => <span className="strong">{inr(p.amount_paid)}</span> },
                                { key: 'mode', header: 'Mode and UTR', render: p => <><div>{p.payment_mode}</div><div className="muted small mono">{p.utr_reference_no ?? 'No UTR'}</div></> },
                            ]}
                            footer={<tr><td colSpan={4}>Total ({reg.length})</td><td className="num">{inr(reg.reduce((s, p) => s + toNum(p.amount_paid), 0))}</td><td /></tr>} />
                    )}
            </Card>

            {paying && payables.data ? <PayModal start={paying} data={payables.data} onClose={() => setPaying(null)} onDone={refresh} /> : null}
        </>
    )
}

interface PayResult { payment_no: string; amount_paid: number }

function PayModal({ start, data, onClose, onDone }: { start: { party: Party; id: string }; data: Payables; onClose: () => void; onDone: () => void }) {
    const { run, busy, error } = useFormAction()
    const [party, setParty] = useState<Party>(start.party)
    const [docId, setDocId] = useState(start.id)
    const [amount, setAmount] = useState<number | ''>(() => {
        const b = start.party === 'VENDOR' ? data.vendor_invoices.find(i => i.id === start.id)?.balance_due : data.subcontractor_bills.find(x => x.id === start.id)?.balance_due
        return b ?? ''
    })
    const [mode, setMode] = useState<string>('NEFT')
    const [utr, setUtr] = useState('')
    const [date, setDate] = useState(isoDate())
    const [remarks, setRemarks] = useState('')
    const [result, setResult] = useState<PayResult | null>(null)

    const vendorOpts = data.vendor_invoices.filter(i => PAYABLE_STATES.includes(i.status))
    const subOpts = data.subcontractor_bills.filter(b => PAYABLE_STATES.includes(b.status))
    const doc = party === 'VENDOR' ? vendorOpts.find(i => i.id === docId) : subOpts.find(b => b.id === docId)
    const balance = toNum(doc?.balance_due)
    const after = r2(balance - toNum(amount))
    const valid = !!doc && toNum(amount) > 0 && !!date

    function pick(id: string) {
        setDocId(id)
        const d = (party === 'VENDOR' ? vendorOpts : subOpts).find(x => x.id === id)
        setAmount(d ? d.balance_due : '')
    }

    async function submit() {
        const r = await run(() => api.post<PayResult>('/finance/vendor-payments', {
            party_type: party, ...(party === 'VENDOR' ? { purchase_invoice_id: docId } : { subcontractor_bill_id: docId }),
            amount_paid: toNum(amount), payment_mode: mode, payment_date: date, ...(utr.trim() ? { utr_reference_no: utr.trim() } : {}), ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
        }))
        if (r) { setResult(r); onDone() }
    }

    return (
        <Modal open title="Record payment" onClose={onClose} footer={
            result ? <Button variant="primary" onClick={onClose}>Done</Button> : (
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>Record payment</Button>
                </>
            )
        }>
            {result ? (
                <Alert tone="success"><strong>{result.payment_no} recorded for {inr(result.amount_paid)}.</strong> <span className="small">The balance on the document has been updated.</span></Alert>
            ) : (
                <>
                    <Field label="Paying">
                        <Select value={party} onChange={e => { setParty(e.target.value as Party); setDocId(''); setAmount('') }}>
                            <option value="VENDOR">A vendor (purchase invoice)</option>
                            <option value="SUBCONTRACTOR">A subcontractor (running bill)</option>
                        </Select>
                    </Field>
                    <Field label={party === 'VENDOR' ? 'Approved purchase invoice' : 'Approved running bill'} hint={party === 'VENDOR' ? 'Held and draft invoices are not listed: they cannot be paid.' : undefined}>
                        <Select value={docId} onChange={e => pick(e.target.value)}>
                            <option value="">{(party === 'VENDOR' ? vendorOpts : subOpts).length ? 'Select...' : 'Nothing is ready to pay'}</option>
                            {party === 'VENDOR'
                                ? vendorOpts.map(i => <option key={i.id} value={i.id}>{i.invoice_no} · {i.party} · {i.project_code} · {inr(i.balance_due)}</option>)
                                : subOpts.map(b => <option key={b.id} value={b.id}>{b.bill_no} · {b.party} · {b.project_code} · {inr(b.balance_due)}</option>)}
                        </Select>
                    </Field>
                    {doc ? (
                        <MathTable>
                            <MathRow label="Balance payable" value={inr(balance)} strong />
                            <MathRow label="This payment" value={inr(toNum(amount))} sign="-" />
                            <MathRow label="Balance after" value={inr(after)} sign="=" strong />
                        </MathTable>
                    ) : null}
                    <div className="form-grid" style={{ marginTop: 14 }}>
                        <Field label="Amount paid"><NumberInput value={amount} onChange={setAmount} min={0} step="0.01" disabled={!doc} /></Field>
                        <Field label="Payment date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
                        <Field label="Mode"><Select value={mode} onChange={e => setMode(e.target.value)}>{BANK_MODES.map(m => <option key={m} value={m}>{m}</option>)}</Select></Field>
                        <Field label="UTR / reference no."><Input value={utr} onChange={e => setUtr(e.target.value)} maxLength={60} /></Field>
                        <Field label="Remarks" className="full"><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} /></Field>
                    </div>
                    {error ? <Alert tone="danger">{error}</Alert> : null}
                    {doc && toNum(amount) > balance + 0.5 ? <Alert tone="warn">This is more than the {inr(balance)} payable. The API will refuse it.</Alert> : null}
                </>
            )}
        </Modal>
    )
}
