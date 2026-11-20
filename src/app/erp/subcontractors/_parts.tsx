'use client'
import { useEffect, type ReactNode } from 'react'
import { fmtDate, inr, qty } from '@/lib/format'
import { Icon } from '@/components/ui'

/** Types and small shared pieces for the subcontractor screen. */

export interface WoRow {
    id: string
    swo_no: string
    project_id: string
    site_id: string
    subcontractor_id: string
    boq_line_id: string | null
    scope: string
    qty: number
    rate: number
    wo_value: number
    advance_amount: number
    advance_recovered: number
    retention_pct: number
    tds_section_id: string
    gst_tax_id: string | null
    status: string
    created_at: string
    subcontractor: { legal_name: string }
    project: { project_code: string; name: string }
    uom: { code: string }
    boq_line: { code: string } | null
    billed_gross: number
    paid_amount: number
    balance_payable: number
    completed_qty: number
    completed_pct: number
}
export interface Measurement {
    id: string
    swo_id: string
    measured_qty: number
    measured_on: string
    notes: string | null
    billed: boolean
    created_at: string
    engineer?: { full_name: string }
}
export interface Bill {
    id: string
    bill_no: string
    swo_id: string
    subcontractor_id?: string
    bill_date: string
    measured_qty: number
    cumulative_qty: number
    gross_amount: number
    advance_recovery: number
    gst_amount: number
    retention_amount: number
    tds_amount: number
    net_payable: number
    paid_amount: number
    balance_due: number
    status: string
    measurement_ids: string[]
    created_at: string
    subcontractor?: { legal_name: string }
    project?: { project_code: string }
    swo?: { swo_no: string; scope: string }
}
export interface WoDetail extends Omit<WoRow, 'subcontractor' | 'boq_line' | 'billed_gross' | 'paid_amount' | 'balance_payable' | 'completed_qty' | 'completed_pct'> {
    subcontractor: { id: string; legal_name: string; code: string; pan: string | null; gstin: string | null }
    boq_line: { code: string; description: string; qty: number } | null
    tds_section: { id: string; section_code: string; description: string; rate_pct: number; threshold_single_bill: number; threshold_annual: number }
    subcontractor_running_bills: Bill[]
    boq_measurements: Measurement[]
}

export const WO_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'CANCELLED']

/** The running-bill arithmetic laid out line by line, the way the subcontractor's bill is settled. */
export function BillMath({ gross, gstPct, gst, retentionPct, retention, tdsLabel, tds, advance, net, qtyText, note }: {
    gross: number; gstPct?: number; gst: number; retentionPct?: number; retention: number; tdsLabel?: string; tds: number; advance: number; net: number; qtyText?: string; note?: ReactNode
}) {
    const row = (label: ReactNode, value: ReactNode, opts?: { strong?: boolean; sign?: '+' | '-'; muted?: boolean }) => (
        <tr style={opts?.strong ? { fontWeight: 800, background: '#f8fafc' } : undefined}>
            <td style={opts?.muted ? { color: 'var(--muted)' } : undefined}>{label}</td>
            <td className="num" style={opts?.muted ? { color: 'var(--muted)' } : undefined}>{opts?.sign ? `${opts.sign} ` : ''}{value}</td>
        </tr>
    )
    return (
        <div>
            <div className="table-wrap">
                <table className="table" aria-label="Running bill calculation">
                    <tbody>
                        {row(<>Gross bill, basic{qtyText ? <span className="muted small"> ({qtyText})</span> : null}</>, inr(gross, true), { strong: true })}
                        {row(<>GST{gstPct !== undefined ? ` at ${gstPct}%` : ''} on basic</>, inr(gst, true), { sign: '+' })}
                        {row('Invoice total', inr(gross + gst, true), { muted: true })}
                        {row(<>Retention{retentionPct !== undefined ? ` ${retentionPct}%` : ''} on basic</>, inr(retention, true), { sign: '-' })}
                        {row(<>TDS{tdsLabel ? ` ${tdsLabel}` : ''} on basic{tds === 0 ? <span className="muted small"> (below threshold, none deducted)</span> : null}</>, inr(tds, true), { sign: '-' })}
                        {row('Advance recovery', inr(advance, true), { sign: '-' })}
                        {row('Net payable to subcontractor', inr(net, true), { strong: true })}
                    </tbody>
                </table>
            </div>
            <div className="muted small" style={{ marginTop: 8 }}>
                <Icon name="info" /> Only the <strong>basic gross {inr(gross, true)}</strong> posts to project cost (subcontractor bill). GST goes to input tax credit, and retention is held payable until the defect liability period ends.
            </div>
            {note ? <div style={{ marginTop: 8 }}>{note}</div> : null}
        </div>
    )
}

/** Right-hand panel with a dimmed backdrop. Closes on Escape or a click outside. */
export function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
    useEffect(() => {
        if (!open) return
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [open, onClose])
    if (!open) return null
    return (
        <div className="overlay" style={{ padding: 0, justifyContent: 'flex-end', alignItems: 'stretch' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
            <aside role="dialog" aria-modal="true" aria-label={title} style={{ background: '#fff', width: '100%', maxWidth: 720, height: '100vh', overflowY: 'auto', boxShadow: '-20px 0 40px rgba(0,0,0,.2)' }}>
                <div className="modal-head" style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                    <h3>{title}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
                </div>
                <div style={{ padding: '18px 20px' }}>{children}</div>
            </aside>
        </div>
    )
}

export const fmtQty = (v: number, uom: string) => `${qty(v)} ${uom}`
export const billDate = (b: Bill) => fmtDate(b.bill_date)
