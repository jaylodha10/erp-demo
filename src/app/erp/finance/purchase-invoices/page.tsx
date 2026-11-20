'use client'
import { useState } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, inr, isoDate, toNum } from '@/lib/format'
import {
    Alert, Button, Card, DataTable, Empty, Field, FileField, Input, Kpi, Modal, NumberInput, PageHeader, Select, StatusBadge, Tabs, useAction, type Column,
} from '@/components/ui'
import { KV, SearchBox, positive, r2, useFormAction } from '../_components/common'
import { HoldExplainer, ThreeWayPanel, usePoMatch } from '../_components/three-way'

interface PurchaseInvoice {
    id: string; invoice_no: string; vendor_invoice_no: string; invoice_date: string; po_id: string | null
    subtotal_amount: number; gst_amount: number; tds_amount: number; net_payable_amount: number; paid_amount: number; balance_due: number
    status: string; hold_reason: string | null; bill_attachment_url: string | null
    vendor: { legal_name: string }; project: { project_code: string }; po: { po_no: string; subtotal_amount: number } | null
}
interface PoRow { id: string; po_no: string; status: string; subtotal_amount: number; gst_amount: number; vendor: { legal_name: string }; project: { project_code: string; name: string } }
interface TdsSection { id: string; section_code: string; description: string; rate_pct: number; threshold_single_bill: number }

type Tab = 'ALL' | 'DRAFT' | 'HOLD_MISMATCH' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID'
const NOT_INVOICEABLE = ['DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED']

export default function PurchaseInvoicesPage() {
    const { can } = useSession()
    const canAct = can('ACCOUNTS', 'DIRECTOR')
    const state = useApi<{ items: PurchaseInvoice[] }>('/finance/purchase-invoices')
    const { run, busy } = useAction()
    const [tab, setTab] = useState<Tab>('ALL')
    const [search, setSearch] = useState('')
    const [booking, setBooking] = useState(false)
    const [detail, setDetail] = useState<PurchaseInvoice | null>(null)

    const items = state.data?.items ?? []
    const count = (s: string) => items.filter(i => i.status === s).length
    const q = search.trim().toLowerCase()
    const rows = items.filter(i => (tab === 'ALL' || i.status === tab)
        && (!q || [i.invoice_no, i.vendor_invoice_no, i.vendor.legal_name, i.po?.po_no ?? '', i.project.project_code].some(t => t.toLowerCase().includes(q))))

    const held = items.filter(i => i.status === 'HOLD_MISMATCH')
    const draft = items.filter(i => i.status === 'DRAFT')
    const payable = items.filter(i => i.status === 'APPROVED' || i.status === 'PARTIALLY_PAID')
    const sum = (l: PurchaseInvoice[], k: 'balance_due' | 'paid_amount') => l.reduce((s, i) => s + toNum(i[k]), 0)

    async function approve(inv: PurchaseInvoice) {
        const r = await run(() => api.post(`/finance/purchase-invoices/${inv.id}/approve`), `${inv.invoice_no} approved`)
        if (r) { setDetail(null); await state.reload() } else await state.reload()
    }

    const columns: Column<PurchaseInvoice>[] = [
        { key: 'invoice_no', header: 'Invoice', render: i => <><div className="strong">{i.invoice_no}</div><div className="muted small">Vendor no. {i.vendor_invoice_no}</div></> },
        { key: 'vendor', header: 'Vendor', render: i => i.vendor.legal_name },
        { key: 'po', header: 'PO and project', render: i => <><div style={{ whiteSpace: 'nowrap' }}>{i.po?.po_no ?? '—'}</div><div className="muted small">{i.project.project_code}</div></> },
        { key: 'invoice_date', header: 'Date', render: i => fmtDate(i.invoice_date) },
        { key: 'amount', header: 'Amount', align: 'right', render: i => <><div>{inr(i.subtotal_amount)}</div><div className="muted small">Net {inr(i.net_payable_amount)}</div></> },
        { key: 'balance_due', header: 'Balance', align: 'right', render: i => inr(i.balance_due) },
        {
            key: 'status', header: 'Status', render: i => (
                <>
                    <StatusBadge status={i.status} />
                    {i.status === 'HOLD_MISMATCH' && i.hold_reason ? <div className="small" style={{ color: 'var(--danger)', maxWidth: 280, marginTop: 4 }}>{i.hold_reason}</div> : null}
                </>
            ),
        },
        {
            key: 'actions', header: '', render: i => (
                <div className="actions" onClick={e => e.stopPropagation()}>
                    {i.status === 'DRAFT' && canAct ? <Button size="sm" variant="primary" disabled={busy} onClick={() => approve(i)}>Approve</Button> : null}
                    {i.status === 'HOLD_MISMATCH' ? <Button size="sm" variant="danger" onClick={() => setDetail(i)}>Why held?</Button> : null}
                    {i.status !== 'DRAFT' && i.status !== 'HOLD_MISMATCH' ? <Button size="sm" variant="ghost" onClick={() => setDetail(i)}>View</Button> : null}
                </div>
            ),
        },
    ]

    return (
        <>
            <PageHeader
                title="Purchase invoices"
                subtitle="Vendor bills matched three ways: what the PO says, what the site actually received, and what the vendor billed. A bill that is more than the goods received, or any open short or damaged delivery, puts the invoice on hold until it is resolved."
                actions={canAct ? <Button variant="primary" icon="add" onClick={() => setBooking(true)}>Book invoice</Button> : null}
            />

            <div className="kpi-grid">
                <Kpi label="On hold" value={inr(sum(held, 'balance_due'))} sub={`${held.length} invoice${held.length === 1 ? '' : 's'}, cannot be paid`} tone={held.length ? 'bad' : undefined} />
                <Kpi label="Awaiting approval" value={inr(sum(draft, 'balance_due'))} sub={`${draft.length} draft invoice${draft.length === 1 ? '' : 's'}`} tone={draft.length ? 'warn' : undefined} />
                <Kpi label="Approved, payable" value={inr(sum(payable, 'balance_due'))} sub={`${payable.length} invoice${payable.length === 1 ? '' : 's'}`} />
                <Kpi label="Paid so far" value={inr(sum(items, 'paid_amount'))} sub="across all vendor invoices" tone="good" />
            </div>

            <Card>
                <Tabs<Tab> value={tab} onChange={setTab} tabs={[
                    { id: 'ALL', label: 'All', count: items.length },
                    { id: 'DRAFT', label: 'Draft', count: count('DRAFT') },
                    { id: 'HOLD_MISMATCH', label: 'On hold', count: count('HOLD_MISMATCH') },
                    { id: 'APPROVED', label: 'Approved', count: count('APPROVED') },
                    { id: 'PARTIALLY_PAID', label: 'Part paid', count: count('PARTIALLY_PAID') },
                    { id: 'PAID', label: 'Paid', count: count('PAID') },
                ]} />
                <div className="row" style={{ marginBottom: 12 }}>
                    <SearchBox value={search} onChange={setSearch} placeholder="Invoice, vendor, PO or project" label="Search purchase invoices" />
                    <span className="spacer" />
                    <Button size="sm" icon="refresh" onClick={() => void state.reload()} loading={state.loading && !!state.data}>Refresh</Button>
                </div>
                {state.error && !state.data ? (
                    <Alert tone="danger">{state.error} <Button size="sm" onClick={() => void state.reload()}>Try again</Button></Alert>
                ) : !state.data ? (
                    <Empty title="Loading invoices..." icon="progress_activity" />
                ) : (
                    <DataTable columns={columns} rows={rows} onRowClick={setDetail}
                        empty={<Empty title={items.length ? 'No invoices match' : 'No purchase invoices yet'} icon="description">{items.length ? 'Try another tab or search.' : canAct ? 'Use Book invoice when a vendor bill arrives.' : 'Accounts books vendor bills here.'}</Empty>} />
                )}
            </Card>

            {booking ? <BookInvoice invoices={items} onClose={() => setBooking(false)} onDone={() => void state.reload()} /> : null}
            {detail ? <InvoiceDetail inv={detail} canAct={canAct} busy={busy} onClose={() => setDetail(null)} onApprove={() => approve(detail)} /> : null}
        </>
    )
}

// ---------------------------------------------------------------------------------------------- detail
function InvoiceDetail({ inv, canAct, busy, onClose, onApprove }: { inv: PurchaseInvoice; canAct: boolean; busy: boolean; onClose: () => void; onApprove: () => void }) {
    const match = usePoMatch(inv.po_id)
    const held = inv.status === 'HOLD_MISMATCH'
    return (
        <Modal open title={`${inv.invoice_no} · ${inv.vendor.legal_name}`} onClose={onClose} wide footer={
            <>
                <Button onClick={onClose}>Close</Button>
                {inv.status === 'DRAFT' && canAct ? <Button variant="primary" loading={busy} onClick={onApprove}>Approve invoice</Button> : null}
                {held ? <Button disabled title="On hold: resolve the delivery exception first">Approve (blocked)</Button> : null}
            </>
        }>
            <div className="grid cols-4" style={{ marginBottom: 14 }}>
                <KV label="Status"><StatusBadge status={inv.status} /></KV>
                <KV label="Vendor invoice no.">{inv.vendor_invoice_no}</KV>
                <KV label="Invoice date">{fmtDate(inv.invoice_date)}</KV>
                <KV label="PO">{inv.po?.po_no ?? '—'}</KV>
                <KV label="Project">{inv.project.project_code}</KV>
                <KV label="Subtotal">{inr(inv.subtotal_amount)}</KV>
                <KV label="GST">{inr(inv.gst_amount)}</KV>
                <KV label="TDS deducted">{inr(inv.tds_amount)}</KV>
                <KV label="Net payable">{inr(inv.net_payable_amount)}</KV>
                <KV label="Paid">{inr(inv.paid_amount)}</KV>
                <KV label="Balance due">{inr(inv.balance_due)}</KV>
                <KV label="Vendor bill">{inv.bill_attachment_url ? <a href={inv.bill_attachment_url} target="_blank" rel="noreferrer">View bill</a> : <span className="muted">Not attached</span>}</KV>
            </div>
            {held ? <HoldExplainer reason={inv.hold_reason} openMismatches={match.openMismatches.length} invoiceValue={toNum(inv.subtotal_amount)} receivedValue={inv.po_id && match.po ? match.receivedValue : undefined} /> : null}
            {inv.po_id ? (
                <>
                    <h4 style={{ margin: '4px 0 8px' }}>3-way match now</h4>
                    <ThreeWayPanel match={match} invoiceValue={toNum(inv.subtotal_amount)} booked hideVerdict={held} />
                </>
            ) : <Alert tone="info">This invoice is not linked to a PO, so there is nothing to match.</Alert>}
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- book invoice
interface BookResult { invoice_no: string; held: boolean; matched_value: number; hold_reason: string | null; net_payable_amount: number }

function BookInvoice({ invoices, onClose, onDone }: { invoices: PurchaseInvoice[]; onClose: () => void; onDone: () => void }) {
    const pos = useApi<{ items: PoRow[] }>('/procurement/purchase-orders')
    const tds = useApi<{ items: TdsSection[] }>('/masters/tds-sections?limit=200')
    const { run, busy, error } = useFormAction()
    const [poId, setPoId] = useState('')
    const [vno, setVno] = useState('')
    const [date, setDate] = useState(isoDate())
    const [subtotal, setSubtotal] = useState<number | ''>('')
    const [gstOverride, setGstOverride] = useState<number | ''>('')
    const [tdsId, setTdsId] = useState('')
    const [bill, setBill] = useState<string | null>(null)
    const [result, setResult] = useState<BookResult | null>(null)
    const match = usePoMatch(poId || null)

    const invoiceable = (pos.data?.items ?? []).filter(p => !NOT_INVOICEABLE.includes(p.status))
    const sub = positive(subtotal) ? subtotal : 0
    const gstAuto = r2(sub * match.gstRatio)
    const gst = gstOverride === '' ? gstAuto : gstOverride
    const sec = tds.data?.items.find(t => t.id === tdsId)
    const tdsApplies = !!sec && sub >= toNum(sec.threshold_single_bill)
    const tdsAmt = sec && tdsApplies ? r2((sub * toNum(sec.rate_pct)) / 100) : 0
    const net = r2(sub + toNum(gst) - tdsAmt)
    const already = invoices.filter(i => i.po_id === poId && i.status !== 'CANCELLED')
    const alreadyValue = already.reduce((s, i) => s + toNum(i.subtotal_amount), 0)
    const valid = !!poId && vno.trim() !== '' && !!date && positive(subtotal)

    async function submit() {
        const r = await run(() => api.post<BookResult & { status: string }>('/finance/purchase-invoices', {
            po_id: poId, vendor_invoice_no: vno.trim(), invoice_date: date, subtotal_amount: subtotal,
            ...(gstOverride !== '' ? { gst_amount: gstOverride } : {}), ...(tdsId ? { tds_section_id: tdsId } : {}), ...(bill ? { bill_attachment_url: bill } : {}),
        }))
        if (r) { setResult(r); onDone() }
    }

    return (
        <Modal open wide title="Book purchase invoice" onClose={onClose} footer={
            result ? <Button variant="primary" onClick={onClose}>Done</Button> : (
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>Book invoice</Button>
                </>
            )
        }>
            {result ? (
                <>
                    <Alert tone={result.held ? 'warn' : 'success'}>
                        <strong>{result.invoice_no} booked{result.held ? ' and put on hold' : ' as Draft'}.</strong>
                        <div className="small">Net payable {inr(result.net_payable_amount)}. Goods received value on the PO: {inr(result.matched_value)}.</div>
                    </Alert>
                    {result.held ? <HoldExplainer reason={result.hold_reason} openMismatches={match.openMismatches.length} /> : <p className="muted small">Approve it from the list when you are ready to pay.</p>}
                </>
            ) : (
                <div className="grid cols-2" style={{ alignItems: 'start' }}>
                    <div>
                        <Field label="Purchase order" hint="Only POs that are approved or have received goods can be invoiced.">
                            <Select value={poId} onChange={e => { setPoId(e.target.value); setGstOverride('') }} disabled={pos.loading}>
                                <option value="">{pos.loading ? 'Loading...' : invoiceable.length ? 'Select PO...' : 'No invoiceable POs'}</option>
                                {invoiceable.map(p => <option key={p.id} value={p.id}>{p.po_no} · {p.vendor.legal_name} · {p.project.project_code} · {inr(p.subtotal_amount)}</option>)}
                            </Select>
                        </Field>
                        {pos.error ? <Alert tone="danger">{pos.error}</Alert> : null}
                        <div className="form-grid">
                            <Field label="Vendor invoice no."><Input value={vno} onChange={e => setVno(e.target.value)} maxLength={50} /></Field>
                            <Field label="Invoice date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
                            <Field label="Subtotal (before GST)"><NumberInput value={subtotal} onChange={setSubtotal} min={0} step="0.01" /></Field>
                            <Field label="GST amount" hint={gstOverride === '' ? `Auto from the PO's GST ratio (${(match.gstRatio * 100).toFixed(1)}%)` : <>Edited by hand. <button type="button" className="btn btn-sm btn-ghost" onClick={() => setGstOverride('')}>Reset to PO ratio</button></>}>
                                <NumberInput value={gstOverride === '' ? (poId ? gstAuto : '') : gstOverride} onChange={v => setGstOverride(v)} min={0} step="0.01" disabled={!poId} />
                            </Field>
                            <Field label="TDS section" className="full" hint={sec ? (tdsApplies ? `${sec.rate_pct}% of the subtotal is deducted: ${inr(tdsAmt)}` : `Not deducted: the bill is below the ${inr(sec.threshold_single_bill)} single-bill threshold`) : 'Leave blank when no TDS applies'}>
                                <Select value={tdsId} onChange={e => setTdsId(e.target.value)} disabled={tds.loading}>
                                    <option value="">No TDS</option>
                                    {tds.data?.items.map(t => <option key={t.id} value={t.id}>{t.section_code} · {t.rate_pct}% · {t.description}</option>)}
                                </Select>
                            </Field>
                            <Field label="Vendor bill (photo or PDF)" className="full"><FileField value={bill} onChange={setBill} folder="bills" /></Field>
                        </div>
                        <div className="row small" style={{ justifyContent: 'space-between' }}>
                            <span className="muted">Net payable (preview)</span><strong>{inr(net)}</strong>
                        </div>
                        {already.length ? <p className="muted small">Already booked on this PO: {already.length} invoice{already.length > 1 ? 's' : ''} worth {inr(alreadyValue)}.</p> : null}
                    </div>
                    <div>
                        <h4 style={{ margin: '0 0 8px' }}>3-way match, live</h4>
                        {poId ? <ThreeWayPanel match={match} invoiceValue={sub} /> : <Alert tone="info">Pick a PO to compare its value, the goods the site has received, and this invoice. A bill that is more than the goods received is held automatically.</Alert>}
                        {error ? <Alert tone="danger">{error}</Alert> : null}
                        <p className="muted small">The API makes the final call and works out GST, TDS and the hold. This panel is a preview. Held invoices show on the On hold tab of the list.</p>
                    </div>
                </div>
            )}
        </Modal>
    )
}
