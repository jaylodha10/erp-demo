'use client'
import Link from 'next/link'
import { useApi } from '@/lib/api'
import { Alert, Icon, Loading } from '@/components/ui'
import { inr, toNum } from '@/lib/format'
import { r2 } from './common'

/** What the 3-way match needs from a PO: value ordered, goods the site has accepted, and any open delivery problems. */
export interface PoLine { id: string; line_no: number; qty: number; rate: number; received_qty: number; line_amount: number; item?: { name: string } | null; uom?: { code: string } | null }
export interface PoDetail {
    id: string; po_no: string; status: string; subtotal_amount: number; gst_amount: number; total_amount: number
    vendor?: { legal_name: string }; project?: { project_code: string; name: string }
    purchase_order_lines: PoLine[]; goods_receipts: { id: string }[]
}
interface ExceptionRow { id: string; source_doc_id: string | null; source_doc_no: string | null; message: string }

export interface PoMatch {
    loading: boolean
    error: string | null
    po: PoDetail | null
    receivedValue: number
    openMismatches: ExceptionRow[]
    /** GST as a share of subtotal, used to prefill the invoice GST. */
    gstRatio: number
}

/** Loads a PO and its open GRN mismatch exceptions and works out the goods-received value, as the API does. */
export function usePoMatch(poId: string | null): PoMatch {
    const po = useApi<PoDetail>(poId ? `/procurement/purchase-orders/${poId}` : null)
    const ex = useApi<{ items: ExceptionRow[] }>(poId ? '/exceptions?type=GRN_MISMATCH&status=OPEN' : null)
    const mine = po.data && po.data.id === poId ? po.data : null
    const grnIds = new Set((mine?.goods_receipts ?? []).map(g => g.id))
    const openMismatches = (ex.data?.items ?? []).filter(e => e.source_doc_id && grnIds.has(e.source_doc_id))
    const receivedValue = r2((mine?.purchase_order_lines ?? []).reduce((s, l) => s + toNum(l.received_qty) * toNum(l.rate), 0))
    const gstRatio = mine && toNum(mine.subtotal_amount) > 0 ? toNum(mine.gst_amount) / toNum(mine.subtotal_amount) : 0
    return { loading: !!poId && (!mine && !po.error), error: po.error, po: mine, receivedValue, openMismatches, gstRatio }
}

/** Plain-words verdict for a held invoice. */
export function HoldExplainer({ reason, openMismatches, invoiceValue, receivedValue }: { reason?: string | null; openMismatches: number; invoiceValue?: number; receivedValue?: number }) {
    const over = invoiceValue !== undefined && receivedValue !== undefined && invoiceValue > receivedValue + 0.5
    return (
        <Alert tone="danger">
            <strong>On hold, so it cannot be approved or paid.</strong>
            {reason ? <div>{reason}</div> : null}
            <div className="small" style={{ marginTop: 6 }}>
                {over ? <>The vendor billed more than the site has accepted (good quantity at PO rate). </> : null}
                {openMismatches > 0
                    ? <>What clears it: the Purchase team settles the short or damaged delivery (credit note, re-delivery or accept short) by resolving the GRN mismatch exception on <Link href="/erp/exceptions">Exceptions</Link>. The invoice then returns to Draft by itself and can be approved.</>
                    : <>No open delivery exception is linked to this PO. Check that the goods inward for this PO is fully recorded, or ask the vendor to correct the bill. Open <Link href="/erp/exceptions">Exceptions</Link> to see any delivery problems.</>}
            </div>
        </Alert>
    )
}

/** PO value vs goods received vs this invoice, with the hold verdict the API will reach. */
export function ThreeWayPanel({ match, invoiceValue, booked, hideVerdict }: { match: PoMatch; invoiceValue: number; booked?: boolean; hideVerdict?: boolean }) {
    if (match.loading) return <Loading label="Checking the PO and goods received..." />
    if (match.error) return <Alert tone="warn">Could not load the PO to preview the match: {match.error}. The API still checks it when you book.</Alert>
    if (!match.po) return null
    const poValue = toNum(match.po.subtotal_amount)
    const received = match.receivedValue
    const over = invoiceValue > received + 0.5
    const mismatch = match.openMismatches.length > 0
    const hold = invoiceValue > 0 && (over || mismatch)
    const overPo = invoiceValue > poValue + 0.5
    const box = (label: string, value: number, sub: string, tone?: 'bad' | 'good') => (
        <div className={`kpi ${tone ?? ''}`} style={{ padding: '10px 12px' }}>
            <div className="label">{label}</div>
            <div className="value" style={{ fontSize: 18 }}>{inr(value)}</div>
            <div className="sub">{sub}</div>
        </div>
    )
    return (
        <div aria-live="polite">
            <div className="grid cols-3" style={{ marginBottom: 12 }}>
                {box('1. PO value', poValue, `${match.po.po_no}, before GST`)}
                {box('2. Goods received', received, 'Good qty accepted at PO rate', received + 0.5 < poValue ? undefined : 'good')}
                {box('3. This invoice', invoiceValue, 'Vendor subtotal, before GST', invoiceValue > 0 && over ? 'bad' : invoiceValue > 0 ? 'good' : undefined)}
            </div>
            {hideVerdict ? null : invoiceValue <= 0 ? (
                <Alert tone="info">Enter the invoice subtotal to see whether it passes the 3-way match.</Alert>
            ) : hold ? (
                <Alert tone="warn">
                    <strong>{booked ? 'This invoice does not pass the match.' : 'This invoice will be booked On hold.'}</strong>
                    <div className="small">
                        {over ? <>It is {inr(invoiceValue - received)} more than the goods the site has actually received. </> : null}
                        {mismatch ? <>{match.openMismatches.length} open short or damaged delivery exception{match.openMismatches.length > 1 ? 's' : ''} on this PO. </> : null}
                        It cannot be approved or paid until the Purchase team resolves the GRN mismatch on <Link href="/erp/exceptions">Exceptions</Link>.
                    </div>
                </Alert>
            ) : (
                <Alert tone="success"><strong>Within goods received.</strong> <span className="small">{booked ? 'It passes the match.' : 'It will be booked as Draft and can be approved.'}</span></Alert>
            )}
            {overPo && invoiceValue > 0 ? <Alert tone="warn"><span className="small"><Icon name="info" /> The invoice is above the PO value of {inr(poValue)}. Check with Purchase before approving.</span></Alert> : null}
        </div>
    )
}
