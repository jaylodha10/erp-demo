'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api, qs, useApi } from '@/lib/api'
import { fmtDate, fmtDateTime, humanize, inr, qty, toNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import { Alert, ApprovalChain, Async, Button, Card, DataTable, Empty, Icon, Kpi, PageHeader, ReasonDialog, StatusBadge, useAction } from '@/components/ui'
import { PURCHASE_READERS } from '../../_lib'

interface PoLine {
    id: string
    line_no: number
    qty: number
    rate: number
    line_amount: number
    received_qty: number
    item: { item_code: string; name: string }
    uom: { code: string }
    boq_line: { code: string } | null
    cost_centre: { code: string } | null
    gst_tax: { code: string; total_rate_pct: number } | null
}
interface GrnLine { id: string; po_line_id: string; ordered_qty: number; received_qty: number; damaged_qty: number; short_qty: number }
interface Grn { id: string; grn_no: string; received_on: string; vehicle_no: string | null; challan_photo_url: string | null; has_mismatch: boolean; remarks: string | null; goods_receipt_lines: GrnLine[] }
interface Step { id: string; step_order: number; status: string; reason: string | null; decided_at: string | null; approver_role: { code: string; name: string }; decided_by_user: { full_name: string } | null }
interface Breach { item_id: string; item: string; planned: number; ordered_before: number; ordering_now: number; over_qty: number; over_value: number; unbudgeted: boolean }
interface Po {
    id: string
    po_no: string
    po_date: string
    rfq_id: string | null
    project_id: string
    vendor_id: string
    delivery_destination: string
    expected_delivery_date: string | null
    subtotal_amount: number
    gst_amount: number
    total_amount: number
    status: string
    boq_breach_flag: boolean
    boq_breach_amount: number
    payment_terms_days: number | null
    remarks: string | null
    vendor: { legal_name: string; code: string; gstin: string | null; pan: string | null; contact_phone: string | null }
    project: { project_code: string; name: string }
    site: { code: string; name: string; full_address: string | null }
    warehouse: { code: string; name: string } | null
    created_by_user: { full_name: string }
    purchase_order_lines: PoLine[]
    goods_receipts: Grn[]
    workflow: { status: string; current_step: number; total_steps: number; flags: { breach_lines?: Breach[] } | null; workflow_steps: Step[] } | null
}
interface Invoice { id: string; po_id: string | null; invoice_no: string; vendor_invoice_no: string | null; invoice_date: string; subtotal_amount: number; gst_amount: number; net_payable_amount: number; balance_due: number; status: string; hold_reason: string | null }

export default function PurchaseOrderPage() {
    const { id } = useParams<{ id: string }>()
    const { can } = useSession()
    const state = useApi<Po>(`/procurement/purchase-orders/${id}`)
    const { run } = useAction()
    const [cancelOpen, setCancelOpen] = useState(false)
    const [closeOpen, setCloseOpen] = useState(false)

    return (
        <Async state={state}>
            {po => {
                const canAct = can(...PURCHASE_READERS)
                const canCancel = canAct && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(po.status)
                const canClose = canAct && ['PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status)
                const orderedValue = po.purchase_order_lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.rate), 0)
                const receivedValue = po.purchase_order_lines.reduce((s, l) => s + Math.min(toNum(l.received_qty), toNum(l.qty)) * toNum(l.rate), 0)
                const steps = po.workflow?.workflow_steps ?? []
                const breaches = po.workflow?.flags?.breach_lines ?? []
                return (
                    <>
                        <div className="no-print">
                            <PageHeader
                                title={po.po_no}
                                subtitle={<>{po.vendor.legal_name} · {po.project.project_code} · <StatusBadge status={po.status} />{po.boq_breach_flag ? <> <span className="badge danger"><Icon name="warning" />BOQ breach</span></> : null}</>}
                                actions={
                                    <>
                                        <Link className="btn" href="/erp/procurement/orders"><Icon name="arrow_back" />Purchase orders</Link>
                                        <Button icon="print" onClick={() => window.print()}>Print / Save as PDF</Button>
                                        {canClose ? <Button icon="task_alt" onClick={() => setCloseOpen(true)}>{po.status === 'PARTIALLY_RECEIVED' ? 'Close short' : 'Close PO'}</Button> : null}
                                        {canCancel ? <Button variant="danger" icon="cancel" onClick={() => setCancelOpen(true)}>Cancel PO</Button> : null}
                                    </>
                                }
                            />
                        </div>

                        <div className="no-print">
                            <div className="kpi-grid">
                                <Kpi label="Value (excl. GST)" value={inr(po.subtotal_amount)} sub="Used for the approval band" />
                                <Kpi label="GST" value={inr(po.gst_amount)} sub={`Total ${inr(po.total_amount)}`} />
                                <Kpi label="Received" value={`${orderedValue > 0 ? Math.round((receivedValue / orderedValue) * 100) : 0}%`} sub={`${inr(receivedValue)} of ${inr(orderedValue)}`} tone={po.goods_receipts.some(g => g.has_mismatch) ? 'warn' : undefined} />
                                <Kpi label="Approval" value={po.workflow ? `${humanize(po.workflow.status)}` : '—'} sub={po.workflow ? `Step ${po.workflow.current_step} of ${po.workflow.total_steps}` : undefined} />
                            </div>

                            {po.status === 'PARTIALLY_RECEIVED' ? <Alert tone="info">Part of the order has been received. If the vendor will not deliver the rest, use <strong>Close short</strong> and record why.</Alert> : null}
                            {po.status === 'REJECTED' ? <Alert tone="danger">This order was rejected. The material requests behind it are back in the purchase queue.</Alert> : null}

                            <Card title="Order details">
                                <div className="grid cols-3">
                                    <Info label="Project" value={`${po.project.project_code} · ${po.project.name}`} />
                                    <Info label="Site" value={`${po.site.code} · ${po.site.name}`} />
                                    <Info label="Vendor" value={`${po.vendor.code} · ${po.vendor.legal_name}`} />
                                    <Info label="Delivery" value={`${po.delivery_destination === 'DIRECT_TO_SITE' ? 'Direct to site' : 'Central store'}${po.warehouse ? ` (${po.warehouse.code})` : ''}`} />
                                    <Info label="Expected delivery" value={po.expected_delivery_date ? fmtDate(po.expected_delivery_date) : 'Not set'} />
                                    <Info label="Payment terms" value={po.payment_terms_days != null ? `${po.payment_terms_days} days` : '—'} />
                                    <Info label="Raised by" value={`${po.created_by_user.full_name} on ${fmtDate(po.po_date)}`} />
                                    <Info label="RFQ" value={po.rfq_id ? <Link href={`/erp/procurement/rfqs/${po.rfq_id}`}>View comparative statement</Link> : 'No RFQ'} />
                                    <Info label="Remarks" value={po.remarks || '—'} />
                                </div>
                            </Card>

                            {po.boq_breach_flag ? (
                                <Card title="BOQ breach" sub={`Over the planned material by ${inr(po.boq_breach_amount)}. Flagged to the Project Manager and Commercial.`}>
                                    {breaches.length ? (
                                        <DataTable
                                            rows={breaches}
                                            rowKey={b => b.item_id}
                                            columns={[
                                                { key: 'item', header: 'Item', render: b => <>{b.item}{b.unbudgeted ? <span className="badge danger" style={{ marginLeft: 6 }}>Not in BOQ</span> : null}</> },
                                                { key: 'planned', header: 'Planned', align: 'right', render: b => qty(b.planned) },
                                                { key: 'before', header: 'Ordered before', align: 'right', render: b => qty(b.ordered_before) },
                                                { key: 'now', header: 'This order', align: 'right', render: b => qty(b.ordering_now) },
                                                { key: 'over', header: 'Over by', align: 'right', render: b => <strong>{qty(b.over_qty)}</strong> },
                                                { key: 'value', header: 'Value over plan', align: 'right', render: b => inr(b.over_value) },
                                            ]}
                                        />
                                    ) : <div className="muted">The breach lines were not recorded on the approval.</div>}
                                </Card>
                            ) : null}

                            <Card title="Items, ordered and received">
                                <DataTable
                                    rows={po.purchase_order_lines}
                                    columns={[
                                        { key: 'no', header: '#', render: l => l.line_no, width: 40 },
                                        { key: 'item', header: 'Item', render: l => <><div>{l.item.name}</div><div className="muted small">{l.item.item_code}{l.boq_line ? ` · ${l.boq_line.code}` : ''}{l.cost_centre ? ` · ${l.cost_centre.code}` : ''}</div></> },
                                        { key: 'ordered', header: 'Ordered', align: 'right', render: l => `${qty(l.qty)} ${l.uom.code}` },
                                        { key: 'received', header: 'Received', align: 'right', render: l => qty(l.received_qty) },
                                        { key: 'open', header: 'Open', align: 'right', render: l => { const open = Math.max(0, toNum(l.qty) - toNum(l.received_qty)); return open > 0 ? <span className="strong">{qty(open)}</span> : <span className="badge success">Complete</span> } },
                                        { key: 'rate', header: 'Rate', align: 'right', render: l => inr(l.rate, true) },
                                        { key: 'gst', header: 'GST', align: 'right', render: l => (l.gst_tax ? `${l.gst_tax.total_rate_pct}%` : '—') },
                                        { key: 'amount', header: 'Amount', align: 'right', render: l => inr(l.line_amount, true) },
                                    ]}
                                    footer={<>
                                        <tr><td colSpan={7}>Subtotal</td><td className="num">{inr(po.subtotal_amount, true)}</td></tr>
                                        <tr><td colSpan={7}>GST</td><td className="num">{inr(po.gst_amount, true)}</td></tr>
                                        <tr><td colSpan={7}>Total</td><td className="num">{inr(po.total_amount, true)}</td></tr>
                                    </>}
                                />
                            </Card>

                            <Card title="Approval chain" sub={po.workflow ? `Approval band chosen from ${inr(po.subtotal_amount)} excluding GST` : undefined}>
                                {steps.length ? (
                                    <>
                                        <ApprovalChain steps={steps.map(s => ({ step: s.step_order, role: s.approver_role.code, status: s.status }))} />
                                        <div style={{ marginTop: 12 }}>
                                            <DataTable
                                                rows={steps}
                                                columns={[
                                                    { key: 'step', header: 'Step', render: s => s.step_order, width: 50 },
                                                    { key: 'role', header: 'Approver role', render: s => s.approver_role.name },
                                                    { key: 'status', header: 'Status', render: s => <StatusBadge status={s.status} /> },
                                                    { key: 'who', header: 'Decided by', render: s => s.decided_by_user?.full_name ?? <span className="muted">Not yet</span> },
                                                    { key: 'when', header: 'When', render: s => (s.decided_at ? fmtDateTime(s.decided_at) : '—') },
                                                    { key: 'why', header: 'Reason or note', render: s => s.reason ?? '—' },
                                                ]}
                                            />
                                        </div>
                                    </>
                                ) : <div className="muted">No approval workflow is recorded for this order.</div>}
                            </Card>

                            <Card title="Goods received (GRN history)" sub="Receipts booked by the site against this order">
                                {po.goods_receipts.length ? po.goods_receipts.map(g => (
                                    <div key={g.id} style={{ marginBottom: 14 }}>
                                        <div className="row" style={{ marginBottom: 6 }}>
                                            <strong>{g.grn_no}</strong>
                                            <span className="muted small">{fmtDate(g.received_on)}{g.vehicle_no ? ` · vehicle ${g.vehicle_no}` : ''}</span>
                                            {g.has_mismatch ? <span className="badge danger"><Icon name="report" />Mismatch: invoice held</span> : <span className="badge success">Matched</span>}
                                            {g.challan_photo_url ? <a href={g.challan_photo_url} target="_blank" rel="noreferrer" className="small">Challan photo</a> : null}
                                        </div>
                                        <DataTable
                                            rows={g.goods_receipt_lines}
                                            columns={[
                                                { key: 'item', header: 'Item', render: gl => po.purchase_order_lines.find(l => l.id === gl.po_line_id)?.item.name ?? '—' },
                                                { key: 'ord', header: 'Ordered', align: 'right', render: gl => qty(gl.ordered_qty) },
                                                { key: 'rec', header: 'Received', align: 'right', render: gl => qty(gl.received_qty) },
                                                { key: 'short', header: 'Short', align: 'right', render: gl => (toNum(gl.short_qty) > 0 ? <span className="badge danger">{qty(gl.short_qty)}</span> : '0') },
                                                { key: 'dam', header: 'Damaged', align: 'right', render: gl => (toNum(gl.damaged_qty) > 0 ? <span className="badge warning">{qty(gl.damaged_qty)}</span> : '0') },
                                            ]}
                                        />
                                        {g.remarks ? <div className="muted small" style={{ marginTop: 4 }}>{g.remarks}</div> : null}
                                    </div>
                                )) : <Empty title="No goods received yet" icon="local_shipping">Receipts appear here when the site books a goods inward against this order.</Empty>}
                            </Card>

                            <InvoicesCard po={po} />
                        </div>

                        <PrintDocument po={po} />

                        <ReasonDialog
                            open={cancelOpen}
                            title={`Cancel ${po.po_no}`}
                            label="Why is this order being cancelled?"
                            confirmLabel="Cancel purchase order"
                            danger
                            onClose={() => setCancelOpen(false)}
                            onSubmit={async reason => {
                                const ok = await run(() => api.post(`/procurement/purchase-orders/${po.id}/cancel`, { reason }), `${po.po_no} cancelled`)
                                if (ok) { setCancelOpen(false); void state.reload() }
                            }}
                        />
                        <ReasonDialog
                            open={closeOpen}
                            title={`Close ${po.po_no}`}
                            label="Closing note (for example: vendor will not supply the balance)"
                            confirmLabel="Close purchase order"
                            onClose={() => setCloseOpen(false)}
                            onSubmit={async note => {
                                const ok = await run(() => api.post(`/procurement/purchase-orders/${po.id}/close`, { note }), `${po.po_no} closed`)
                                if (ok) { setCloseOpen(false); void state.reload() }
                            }}
                        />
                    </>
                )
            }}
        </Async>
    )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
    return <div><div className="muted small" style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>{label}</div><div>{value}</div></div>
}

function InvoicesCard({ po }: { po: Po }) {
    const inv = useApi<{ items: Invoice[] }>(`/finance/purchase-invoices${qs({ vendor_id: po.vendor_id, project_id: po.project_id })}`)
    const mine = inv.data?.items.filter(i => i.po_id === po.id) ?? []
    return (
        <Card title="Linked vendor invoices" actions={<Link className="btn btn-sm" href="/erp/finance/purchase-invoices">Purchase invoices</Link>}>
            {inv.error ? <div className="muted">Invoices are not available to your role ({inv.error}).</div>
                : !inv.data ? <div className="muted">Loading...</div>
                    : (
                        <DataTable
                            rows={mine}
                            empty={<Empty title="No vendor invoice yet" icon="description">Accounts books the vendor invoice against this order and matches it with the goods received.</Empty>}
                            columns={[
                                { key: 'no', header: 'Invoice', render: i => <><div className="strong">{i.invoice_no}</div><div className="muted small">{i.vendor_invoice_no ?? ''}</div></> },
                                { key: 'date', header: 'Date', render: i => fmtDate(i.invoice_date) },
                                { key: 'sub', header: 'Excl. GST', align: 'right', render: i => inr(i.subtotal_amount) },
                                { key: 'net', header: 'Net payable', align: 'right', render: i => inr(i.net_payable_amount) },
                                { key: 'bal', header: 'Balance due', align: 'right', render: i => inr(i.balance_due) },
                                { key: 'st', header: 'Status', render: i => <><StatusBadge status={i.status} />{i.hold_reason ? <div className="muted small" style={{ maxWidth: 280, whiteSpace: 'normal' }}>{i.hold_reason}</div> : null}</> },
                            ]}
                        />
                    )}
        </Card>
    )
}

/** The printable purchase order. Hidden on screen, shown by the print stylesheet (`.print-only`). */
function PrintDocument({ po }: { po: Po }) {
    return (
        <div className="print-only" style={{ color: '#000', fontSize: 12, lineHeight: 1.45 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 12 }}>
                <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>Radius 9</div>
                    <div>Interiors and fit-out</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>PURCHASE ORDER</div>
                    <div><strong>{po.po_no}</strong></div>
                    <div>Date: {fmtDate(po.po_date)}</div>
                    <div>Status: {humanize(po.status)}</div>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                <div>
                    <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>Vendor</div>
                    <div><strong>{po.vendor.legal_name}</strong></div>
                    {po.vendor.gstin ? <div>GSTIN: {po.vendor.gstin}</div> : null}
                    {po.vendor.pan ? <div>PAN: {po.vendor.pan}</div> : null}
                    {po.vendor.contact_phone ? <div>Phone: {po.vendor.contact_phone}</div> : null}
                </div>
                <div>
                    <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}>Deliver to</div>
                    <div><strong>{po.project.project_code} · {po.project.name}</strong></div>
                    <div>{po.site.name}</div>
                    {po.site.full_address ? <div>{po.site.full_address}</div> : null}
                    <div>{po.delivery_destination === 'DIRECT_TO_SITE' ? 'Direct to site store' : 'Central store'}{po.warehouse ? ` (${po.warehouse.code})` : ''}</div>
                </div>
            </div>
            <div style={{ marginBottom: 10 }}>
                Expected delivery: <strong>{po.expected_delivery_date ? fmtDate(po.expected_delivery_date) : 'As agreed'}</strong> · Payment terms: <strong>{po.payment_terms_days != null ? `${po.payment_terms_days} days` : 'As agreed'}</strong>
            </div>
            <table className="table" style={{ fontSize: 12 }}>
                <thead><tr><th>#</th><th>Item</th><th>Unit</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
                <tbody>
                    {po.purchase_order_lines.map(l => (
                        <tr key={l.id}>
                            <td>{l.line_no}</td>
                            <td>{l.item.name}<div style={{ fontSize: 10 }}>{l.item.item_code}</div></td>
                            <td>{l.uom.code}</td>
                            <td className="num">{qty(l.qty)}</td>
                            <td className="num">{inr(l.rate, true)}</td>
                            <td className="num">{l.gst_tax ? `${l.gst_tax.total_rate_pct}%` : '—'}</td>
                            <td className="num">{inr(l.line_amount, true)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr><td colSpan={6}>Subtotal</td><td className="num">{inr(po.subtotal_amount, true)}</td></tr>
                    <tr><td colSpan={6}>GST</td><td className="num">{inr(po.gst_amount, true)}</td></tr>
                    <tr><td colSpan={6}>Total</td><td className="num">{inr(po.total_amount, true)}</td></tr>
                </tfoot>
            </table>
            {po.remarks ? <div style={{ marginTop: 10 }}><strong>Remarks:</strong> {po.remarks}</div> : null}
            <div style={{ marginTop: 10 }}>
                <strong>Terms:</strong> Goods must match the specification and quantity above. Short or damaged supply is recorded at the site and the invoice is held until settled. Quote this PO number on every challan and invoice.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 40 }}>
                {(po.workflow?.workflow_steps ?? []).map(s => (
                    <div key={s.id} style={{ borderTop: '1px solid #000', paddingTop: 4 }}>
                        <div>{s.approver_role.name}</div>
                        <div style={{ fontSize: 10 }}>{s.status === 'APPROVED' ? `Approved by ${s.decided_by_user?.full_name ?? ''} on ${fmtDate(s.decided_at)}` : humanize(s.status)}</div>
                    </div>
                ))}
                <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>
                    <div>Prepared by {po.created_by_user.full_name}</div>
                    <div style={{ fontSize: 10 }}>Purchase department</div>
                </div>
            </div>
        </div>
    )
}
