'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { api, useApi } from '@/lib/api'
import { inr, qty, toNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import { Alert, Async, Button, Card, Field, Icon, Input, Kpi, MasterSelect, Modal, NumberInput, PageHeader, StatusBadge, Textarea, useAction } from '@/components/ui'
import { PURCHASERS } from '../../_lib'

interface RfqLine {
    rfq_line_id: string
    item_code: string
    item: string
    qty: number
    uom: string
    mr_no: string | null
    rates: { vendor_id: string; rate: number | null; is_lowest: boolean }[]
}
interface RfqVendor {
    quote_id: string
    vendor_id: string
    vendor: string
    rating: number
    delivery_days: number | null
    payment_terms_days: number | null
    remarks: string | null
    total_amount: number
    quoted_lines: number
    is_lowest_total: boolean
}
interface Rfq {
    id: string
    rfq_no: string
    status: string
    project: { project_code: string; name: string }
    awarded_vendor_id: string | null
    awarded_vendor: string | null
    award_note: string | null
    lines: RfqLine[]
    vendors: RfqVendor[]
}

export default function RfqPage() {
    const { id } = useParams<{ id: string }>()
    const { can } = useSession()
    const state = useApi<Rfq>(`/procurement/rfqs/${id}`)
    const canAct = can(...PURCHASERS)
    const [quoteFor, setQuoteFor] = useState<{ vendor_id: string; vendor: string } | null>(null)
    const [awardFor, setAwardFor] = useState<RfqVendor | null>(null)
    const [newVendor, setNewVendor] = useState('')

    return (
        <Async state={state}>
            {rfq => {
                const open = rfq.status === 'OPEN'
                const complete = (v: RfqVendor) => v.quoted_lines === rfq.lines.length && rfq.lines.length > 0
                const lowestTotal = Math.min(...rfq.vendors.filter(complete).map(v => v.total_amount), Infinity)
                const awarded = rfq.vendors.find(v => v.vendor_id === rfq.awarded_vendor_id)
                return (
                    <>
                        <PageHeader
                            title={`Comparative statement ${rfq.rfq_no}`}
                            subtitle={<>{rfq.project.project_code} · {rfq.project.name} · <StatusBadge status={rfq.status} /></>}
                            actions={
                                <>
                                    <Link className="btn" href="/erp/procurement/queue"><Icon name="arrow_back" />Purchase queue</Link>
                                    {rfq.status === 'AWARDED' && canAct ? <Link className="btn btn-primary" href={`/erp/procurement/orders/new?rfq_id=${rfq.id}`}><Icon name="receipt_long" />Create purchase order</Link> : null}
                                </>
                            }
                        />

                        {rfq.status === 'AWARDED' ? (
                            <Alert tone="success">
                                Awarded to <strong>{rfq.awarded_vendor}</strong>{awarded ? <> at {inr(awarded.total_amount)} (excluding GST)</> : null}.
                                {rfq.award_note ? <> Reason on record: {rfq.award_note}</> : null}
                                {canAct ? <> Next step: create the purchase order, which opens prefilled with this vendor&apos;s rates.</> : null}
                            </Alert>
                        ) : null}

                        <div className="kpi-grid">
                            <Kpi label="Lines" value={rfq.lines.length} sub="Items being compared" />
                            <Kpi label="Vendors" value={rfq.vendors.length} sub={`${rfq.vendors.filter(complete).length} quoted every line`} />
                            <Kpi label="Lowest total" value={Number.isFinite(lowestTotal) ? inr(lowestTotal) : '—'} tone={Number.isFinite(lowestTotal) ? 'good' : undefined} sub={Number.isFinite(lowestTotal) ? rfq.vendors.find(v => complete(v) && v.total_amount === lowestTotal)?.vendor : 'Waiting for complete quotes'} />
                        </div>

                        <Card
                            title="Rate matrix"
                            sub="Rate per purchase unit, excluding GST. Green cells are the lowest rate for the line."
                            actions={open && canAct ? (
                                <div className="row">
                                    <div style={{ minWidth: 220 }}>
                                        <MasterSelect master="vendors" value={newVendor} onChange={v => setNewVendor(v)} placeholder="Add another vendor..." />
                                    </div>
                                    <Button size="sm" icon="add" disabled={!newVendor || rfq.vendors.some(v => v.vendor_id === newVendor)} onClick={() => { setQuoteFor({ vendor_id: newVendor, vendor: 'New vendor' }); setNewVendor('') }}>Enter quote</Button>
                                </div>
                            ) : undefined}
                        >
                            {!rfq.vendors.length ? (
                                <div className="empty"><Icon name="storefront" /><strong>No vendors yet</strong>Add a vendor above and enter the rates they quoted.</div>
                            ) : (
                                <div className="table-wrap">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Item</th>
                                                <th className="num">Quantity</th>
                                                {rfq.vendors.map(v => (
                                                    <th key={v.vendor_id} className="num" style={{ minWidth: 150 }}>
                                                        {v.vendor}
                                                        {rfq.awarded_vendor_id === v.vendor_id ? <div><span className="badge success">Awarded</span></div> : null}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rfq.lines.map(l => (
                                                <tr key={l.rfq_line_id}>
                                                    <td><div className="strong">{l.item}</div><div className="muted small">{l.item_code}{l.mr_no ? ` · ${l.mr_no}` : ''}</div></td>
                                                    <td className="num">{qty(l.qty)} {l.uom}</td>
                                                    {rfq.vendors.map(v => {
                                                        const r = l.rates.find(x => x.vendor_id === v.vendor_id)
                                                        const low = !!r?.is_lowest && r.rate !== null
                                                        return (
                                                            <td key={v.vendor_id} className="num" style={low ? { background: 'var(--success-bg)' } : undefined}>
                                                                {r?.rate != null ? (
                                                                    <>
                                                                        <div className="strong">{inr(r.rate, true)}</div>
                                                                        <div className="muted small">{inr(r.rate * l.qty)} {low ? <span className="badge success" style={{ marginLeft: 4 }}>Lowest</span> : null}</div>
                                                                    </>
                                                                ) : <span className="muted">Not quoted</span>}
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={2}>Total (excluding GST)</td>
                                                {rfq.vendors.map(v => {
                                                    const low = complete(v) && v.total_amount === lowestTotal
                                                    return (
                                                        <td key={v.vendor_id} className="num" style={low ? { background: 'var(--success-bg)' } : undefined}>
                                                            {v.quoted_lines ? inr(v.total_amount) : '—'}
                                                            {low ? <div><span className="badge success">Lowest total</span></div> : null}
                                                            {!complete(v) && v.quoted_lines ? <div className="muted small" style={{ fontWeight: 400 }}>{v.quoted_lines} of {rfq.lines.length} lines</div> : null}
                                                        </td>
                                                    )
                                                })}
                                            </tr>
                                            <tr>
                                                <td colSpan={2} style={{ fontWeight: 600 }}>Delivery and payment</td>
                                                {rfq.vendors.map(v => (
                                                    <td key={v.vendor_id} className="num" style={{ fontWeight: 400 }}>
                                                        <div>{v.delivery_days != null ? `${v.delivery_days} days delivery` : 'Delivery not given'}</div>
                                                        <div>{v.payment_terms_days != null ? `Pay in ${v.payment_terms_days} days` : 'Terms not given'}</div>
                                                        <div className="muted small">Rating {v.rating ? v.rating.toFixed(1) : '—'}</div>
                                                        {v.remarks ? <div className="muted small">{v.remarks}</div> : null}
                                                    </td>
                                                ))}
                                            </tr>
                                            {open && canAct ? (
                                                <tr>
                                                    <td colSpan={2} style={{ fontWeight: 600 }}>Actions</td>
                                                    {rfq.vendors.map(v => (
                                                        <td key={v.vendor_id} className="num">
                                                            <div className="actions" style={{ justifyContent: 'flex-end' }}>
                                                                <Button size="sm" onClick={() => setQuoteFor({ vendor_id: v.vendor_id, vendor: v.vendor })}>{v.quoted_lines ? 'Edit quote' : 'Enter quote'}</Button>
                                                                <Button size="sm" variant="success" disabled={!complete(v)} title={complete(v) ? undefined : 'This vendor has not quoted every line'} onClick={() => setAwardFor(v)}>Award</Button>
                                                            </div>
                                                        </td>
                                                    ))}
                                                </tr>
                                            ) : null}
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                            {open && !canAct ? <div className="muted small" style={{ marginTop: 10 }}>Only the Purchase Manager or Director can enter quotes and award a vendor.</div> : null}
                        </Card>

                        {quoteFor ? (
                            <QuoteModal
                                rfq={rfq}
                                vendorId={quoteFor.vendor_id}
                                vendorName={rfq.vendors.find(v => v.vendor_id === quoteFor.vendor_id)?.vendor ?? quoteFor.vendor}
                                onClose={() => setQuoteFor(null)}
                                onSaved={() => { setQuoteFor(null); void state.reload() }}
                            />
                        ) : null}
                        {awardFor ? (
                            <AwardModal
                                rfq={rfq}
                                vendor={awardFor}
                                lowestTotal={lowestTotal}
                                onClose={() => setAwardFor(null)}
                                onAwarded={() => { setAwardFor(null); void state.reload() }}
                            />
                        ) : null}
                    </>
                )
            }}
        </Async>
    )
}

// ---------------------------------------------------------------------------------------------- quote entry
function QuoteModal({ rfq, vendorId, vendorName, onClose, onSaved }: { rfq: Rfq; vendorId: string; vendorName: string; onClose: () => void; onSaved: () => void }) {
    const existing = rfq.vendors.find(v => v.vendor_id === vendorId)
    const [days, setDays] = useState<number | ''>(existing?.delivery_days ?? '')
    const [terms, setTerms] = useState<number | ''>(existing?.payment_terms_days ?? '')
    const [remarks, setRemarks] = useState(existing?.remarks ?? '')
    const [rates, setRates] = useState<Record<string, number | ''>>(() => Object.fromEntries(rfq.lines.map(l => [l.rfq_line_id, l.rates.find(r => r.vendor_id === vendorId)?.rate ?? ''])))
    const { run, busy } = useAction()
    const vendorLabel = useApi<{ items: { id: string; label: string }[] }>(existing ? null : '/masters/vendors/options')
    const name = existing ? vendorName : vendorLabel.data?.items.find(v => v.id === vendorId)?.label ?? vendorName

    const lines = rfq.lines.map(l => ({ l, rate: rates[l.rfq_line_id] }))
    const quoted = lines.filter(x => x.rate !== '')
    const total = quoted.reduce((s, x) => s + toNum(x.rate) * x.l.qty, 0)
    const negative = quoted.some(x => toNum(x.rate) < 0)

    const save = async () => {
        const ok = await run(() => api.post(`/procurement/rfqs/${rfq.id}/quotes`, {
            vendor_id: vendorId,
            delivery_days: days === '' ? undefined : days,
            payment_terms_days: terms === '' ? undefined : terms,
            remarks: remarks.trim() || undefined,
            lines: quoted.map(x => ({ rfq_line_id: x.l.rfq_line_id, rate: toNum(x.rate) })),
        }), 'Quote saved')
        if (ok) onSaved()
    }

    return (
        <Modal
            open
            wide
            title={`Quote from ${name}`}
            onClose={onClose}
            footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!quoted.length || negative} onClick={save}>Save quote</Button></>}
        >
            <div className="form-grid">
                <Field label="Delivery time (days)"><NumberInput value={days} min={0} onChange={setDays} /></Field>
                <Field label="Payment terms (days)"><NumberInput value={terms} min={0} onChange={setTerms} /></Field>
                <Field label="Remarks" className="full"><Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Validity, freight, brand offered" /></Field>
            </div>
            <div className="table-wrap">
                <table className="table">
                    <thead><tr><th>Item</th><th className="num">Quantity</th><th className="num" style={{ width: 150 }}>Rate (excl. GST)</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                        {lines.map(({ l, rate }) => (
                            <tr key={l.rfq_line_id}>
                                <td>{l.item}<div className="muted small">{l.item_code}</div></td>
                                <td className="num">{qty(l.qty)} {l.uom}</td>
                                <td className="num">
                                    <input
                                        className="input num cell-input"
                                        type="number"
                                        min={0}
                                        step="any"
                                        aria-label={`Rate for ${l.item} per ${l.uom}`}
                                        value={rate}
                                        onChange={e => setRates(r => ({ ...r, [l.rfq_line_id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                    />
                                </td>
                                <td className="num">{rate === '' ? '—' : inr(toNum(rate) * l.qty)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot><tr><td colSpan={3}>Quote total</td><td className="num">{inr(total)}</td></tr></tfoot>
                </table>
            </div>
            {quoted.length && quoted.length < lines.length ? <Alert tone="warn">{lines.length - quoted.length} line(s) have no rate. A vendor can only be awarded once every line is quoted.</Alert> : null}
            {negative ? <Alert tone="danger">A rate cannot be negative.</Alert> : null}
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- award
function AwardModal({ rfq, vendor, lowestTotal, onClose, onAwarded }: { rfq: Rfq; vendor: RfqVendor; lowestTotal: number; onClose: () => void; onAwarded: () => void }) {
    const [note, setNote] = useState('')
    const { run, busy } = useAction()
    const dearer = vendor.total_amount > lowestTotal + 0.5
    const lowestVendor = rfq.vendors.find(v => v.quoted_lines === rfq.lines.length && v.total_amount === lowestTotal)
    const submit = async () => {
        const ok = await run(() => api.post(`/procurement/rfqs/${rfq.id}/award`, { vendor_id: vendor.vendor_id, note: note.trim() || undefined }), `${vendor.vendor} awarded`)
        if (ok) onAwarded()
    }
    return (
        <Modal
            open
            title={`Award ${rfq.rfq_no} to ${vendor.vendor}`}
            onClose={onClose}
            footer={<><Button onClick={onClose}>Cancel</Button><Button variant="success" loading={busy} disabled={dearer && !note.trim()} onClick={submit}>Award vendor</Button></>}
        >
            <p style={{ marginTop: 0 }}>Total quote <strong>{inr(vendor.total_amount)}</strong> excluding GST{vendor.delivery_days != null ? `, delivery in ${vendor.delivery_days} days` : ''}{vendor.payment_terms_days != null ? `, payment in ${vendor.payment_terms_days} days` : ''}.</p>
            {dearer ? (
                <Alert tone="warn">
                    This is not the lowest quote{lowestVendor ? ` (${lowestVendor.vendor} quoted ${inr(lowestTotal)})` : ''}, {inr(vendor.total_amount - lowestTotal)} more. Record why this vendor is being chosen.
                </Alert>
            ) : <Alert tone="success">This is the lowest complete quote.</Alert>}
            <Field label={dearer ? 'Reason for choosing this vendor (required)' : 'Note (optional)'}>
                <Textarea value={note} onChange={e => setNote(e.target.value)} autoFocus placeholder={dearer ? 'Quality, delivery time, past performance...' : ''} />
            </Field>
            <div className="muted small">Awarding closes the RFQ. The purchase order is raised next and goes through the approval matrix.</div>
        </Modal>
    )
}
