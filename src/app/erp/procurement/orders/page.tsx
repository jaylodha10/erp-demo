'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { qs, useApi } from '@/lib/api'
import { fmtDate, humanize, inr, inrCompact } from '@/lib/format'
import { useSession } from '@/lib/session'
import { Async, DataTable, Empty, Field, Icon, Input, Kpi, MasterSelect, PageHeader, ProjectSelect, Select, StatusBadge, useDebounced, type Column } from '@/components/ui'
import { PURCHASERS } from '../_lib'

interface PoRow {
    id: string
    po_no: string
    po_date: string
    expected_delivery_date: string | null
    delivery_destination: string
    subtotal_amount: number
    gst_amount: number
    total_amount: number
    status: string
    boq_breach_flag: boolean
    boq_breach_amount: number
    vendor: { legal_name: string }
    project: { project_code: string; name: string }
    site: { code: string; city: string }
    created_by_user: { full_name: string }
}
interface WorkflowSummary { current_step: number; total_steps: number; status: string; workflow_steps: { step_order: number; status: string; approver_role: { code: string; name: string } }[] }

const STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'REJECTED', 'CANCELLED']

export default function PurchaseOrdersPage() {
    const { can } = useSession()
    const router = useRouter()
    const [status, setStatus] = useState('')
    const [projectId, setProjectId] = useState('')
    const [vendorId, setVendorId] = useState('')
    const [breachOnly, setBreachOnly] = useState(false)
    const [search, setSearch] = useState('')
    const debounced = useDebounced(search)
    const state = useApi<{ items: PoRow[] }>(`/procurement/purchase-orders${qs({ status, project_id: projectId, vendor_id: vendorId })}`)

    const rows = useMemo(() => {
        const q = debounced.trim().toLowerCase()
        return (state.data?.items ?? []).filter(r => (!breachOnly || r.boq_breach_flag) && (!q || `${r.po_no} ${r.vendor.legal_name} ${r.project.project_code}`.toLowerCase().includes(q)))
    }, [state.data, debounced, breachOnly])

    const all = state.data?.items ?? []
    const pending = all.filter(r => r.status === 'PENDING_APPROVAL')
    const live = all.filter(r => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(r.status))

    const columns: Column<PoRow>[] = [
        { key: 'po_no', header: 'Purchase order', render: r => <><Link href={`/erp/procurement/orders/${r.id}`} className="strong" onClick={e => e.stopPropagation()}>{r.po_no}</Link><div className="muted small">{fmtDate(r.po_date)} · {r.created_by_user.full_name}</div></> },
        { key: 'project', header: 'Project and site', render: r => <><div>{r.project.project_code}</div><div className="muted small">{r.site.code}, {r.site.city}</div></> },
        { key: 'vendor', header: 'Vendor', render: r => r.vendor.legal_name },
        { key: 'dest', header: 'Delivery', render: r => <><div>{r.delivery_destination === 'DIRECT_TO_SITE' ? 'Direct to site' : 'Central store'}</div><div className="muted small">{r.expected_delivery_date ? `By ${fmtDate(r.expected_delivery_date)}` : 'No date set'}</div></> },
        { key: 'sub', header: 'Value (excl. GST)', align: 'right', render: r => <><div>{inr(r.subtotal_amount)}</div><div className="muted small">Total {inr(r.total_amount)}</div></> },
        { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
        { key: 'approval', header: 'Approval', render: r => (r.status === 'PENDING_APPROVAL' ? <ApprovalStep id={r.id} /> : <span className="muted">{r.status === 'REJECTED' ? 'Rejected' : r.status === 'CANCELLED' ? 'Cancelled' : 'Complete'}</span>) },
        { key: 'boq', header: 'BOQ', render: r => (r.boq_breach_flag ? <span className="badge danger" title={`Over plan by ${inr(r.boq_breach_amount)}`}><Icon name="warning" />Breach {inrCompact(r.boq_breach_amount)}</span> : <span className="badge success">Within</span>) },
    ]

    return (
        <>
            <PageHeader
                title="Purchase orders"
                subtitle="Every PO with its approval step and BOQ check. PO value for approval is the amount excluding GST."
                actions={can(...PURCHASERS) ? <Link className="btn btn-primary" href="/erp/procurement/orders/new"><Icon name="add" />New purchase order</Link> : undefined}
            />
            <div className="kpi-grid">
                <Kpi label="Purchase orders" value={all.length} sub="Matching the filters" />
                <Kpi label="Waiting for approval" value={pending.length} tone={pending.length ? 'warn' : undefined} sub={inrCompact(pending.reduce((s, r) => s + r.subtotal_amount, 0))} />
                <Kpi label="Approved, goods awaited" value={live.length} sub={inrCompact(live.reduce((s, r) => s + r.subtotal_amount, 0))} />
                <Kpi label="BOQ breaches" value={all.filter(r => r.boq_breach_flag).length} tone={all.some(r => r.boq_breach_flag) ? 'bad' : undefined} sub="Beyond planned material" />
            </div>
            <section className="card">
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                    <Field label="Status">
                        <Select value={status} onChange={e => setStatus(e.target.value)}>
                            <option value="">All statuses</option>
                            {STATUSES.map(s => <option key={s} value={s}>{humanize(s)}</option>)}
                        </Select>
                    </Field>
                    <Field label="Project"><ProjectSelect value={projectId} onChange={id => setProjectId(id)} placeholder="All projects" /></Field>
                    <Field label="Vendor"><MasterSelect master="vendors" value={vendorId} onChange={id => setVendorId(id)} placeholder="All vendors" /></Field>
                    <Field label="Search"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="PO number, vendor, project" /></Field>
                </div>
                <label className="checkbox"><input type="checkbox" checked={breachOnly} onChange={e => setBreachOnly(e.target.checked)} />Only POs flagged for a BOQ breach</label>
            </section>
            <Async state={state}>
                {() => (
                    <DataTable
                        columns={columns}
                        rows={rows}
                        onRowClick={r => router.push(`/erp/procurement/orders/${r.id}`)}
                        empty={<Empty title="No purchase orders found" icon="receipt_long">Change the filters, or raise a new PO from an awarded RFQ.</Empty>}
                        footer={rows.length ? <tr><td colSpan={4}>{rows.length} purchase order{rows.length === 1 ? '' : 's'}</td><td className="num">{inr(rows.reduce((s, r) => s + r.subtotal_amount, 0))}</td><td colSpan={3} /></tr> : undefined}
                    />
                )}
            </Async>
        </>
    )
}

/** Which approval step a pending PO is waiting on. Loaded per row; only pending POs are asked. */
function ApprovalStep({ id }: { id: string }) {
    const wf = useApi<WorkflowSummary>(`/workflows/PO/${id}`)
    if (wf.error) return <span className="muted">—</span>
    if (!wf.data) return <span className="muted">...</span>
    const cur = wf.data.workflow_steps.find(s => s.status === 'PENDING')
    return <span>Step {wf.data.current_step} of {wf.data.total_steps}{cur ? <div className="muted small">Waiting for {cur.approver_role.name}</div> : null}</span>
}
