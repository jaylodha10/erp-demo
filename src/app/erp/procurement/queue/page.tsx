'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, qs, useApi } from '@/lib/api'
import { fmtDate, qty } from '@/lib/format'
import { useSession } from '@/lib/session'
import {
    Alert, Async, Button, Card, DataTable, Empty, Field, Icon, Input, Kpi, MasterSelect, Modal, PageHeader, ProjectSelect, ReasonDialog, Select, StatusBadge, Tabs, useAction, useDebounced,
    type Column,
} from '@/components/ui'
import { PURCHASERS, PURCHASE_READERS } from '../_lib'

interface MaterialRequest {
    id: string
    mr_no: string
    project_id: string
    site_id: string
    qty: number
    needed_by: string
    urgency: string
    remarks: string | null
    boq_breach_flag: boolean
    boq_qty: number | null
    cumulative_requested_qty: number | null
    status: string
    created_at: string
    item: { item_code: string; name: string }
    uom: { code: string }
    project: { project_code: string; name: string }
    site: { code: string; name: string; city: string }
    boq_line: { code: string } | null
    requested_by_user: { full_name: string }
}
interface RfqRow { id: string; rfq_no: string; status: string; project_code: string; lines: number; quotes: number; awarded_vendor: string | null; created_at: string }
interface VendorRow { id: string; code: string; legal_name: string; rating: number | null; is_active: boolean; supply_categories?: string[] }

const REQUEST_STATUSES = [
    { v: 'OPEN', l: 'Open (waiting for purchase)' },
    { v: 'IN_RFQ', l: 'In an RFQ' },
    { v: 'ORDERED', l: 'Ordered' },
    { v: 'CANCELLED', l: 'Cancelled' },
]

export default function PurchaseQueuePage() {
    const { can } = useSession()
    const canRfqs = can(...PURCHASE_READERS)
    const [tab, setTab] = useState<'requests' | 'rfqs'>('requests')
    return (
        <>
            <PageHeader
                title="Purchase queue"
                subtitle="Material requests raised from site, grouped into RFQs. Compare vendor quotes, award, then raise the purchase order."
                actions={can(...PURCHASERS) ? <Link className="btn btn-primary" href="/erp/procurement/orders/new"><Icon name="add" />New purchase order</Link> : undefined}
            />
            <Tabs
                tabs={[{ id: 'requests', label: 'Material requests' }, ...(canRfqs ? [{ id: 'rfqs' as const, label: 'RFQs and comparative statements' }] : [])]}
                value={tab}
                onChange={setTab}
            />
            {tab === 'requests' ? <RequestsTab /> : <RfqsTab />}
        </>
    )
}

// ---------------------------------------------------------------------------------------------- requests
function RequestsTab() {
    const { can } = useSession()
    const router = useRouter()
    const [status, setStatus] = useState('OPEN')
    const [projectId, setProjectId] = useState('')
    const [search, setSearch] = useState('')
    const debounced = useDebounced(search)
    const [urgency, setUrgency] = useState('')
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [rfqOpen, setRfqOpen] = useState(false)
    const [now] = useState(() => Date.now())
    const [cancelFor, setCancelFor] = useState<MaterialRequest | null>(null)
    const { run } = useAction()
    const state = useApi<{ items: MaterialRequest[] }>(`/procurement/queue${qs({ status, project_id: projectId })}`)
    const canRfq = can(...PURCHASERS)
    const canCancel = can('PURCHASE_MGR', 'DIRECTOR', 'PROJECT_MANAGER', 'PROJECT_HEAD')

    const rows = useMemo(() => {
        const q = debounced.trim().toLowerCase()
        return (state.data?.items ?? []).filter(r =>
            (!urgency || r.urgency === urgency) &&
            (!q || `${r.mr_no} ${r.item.name} ${r.item.item_code} ${r.project.project_code} ${r.site.name}`.toLowerCase().includes(q)))
    }, [state.data, debounced, urgency])

    // Selection is derived from what is currently visible, so changing a filter never leaves hidden rows selected.
    const selectable = rows.filter(r => r.status === 'OPEN')
    const selected = selectable.filter(r => picked.has(r.id))
    const toggle = (id: string) => setPicked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
    const allPicked = selectable.length > 0 && selected.length === selectable.length

    const all = state.data?.items ?? []
    const columns: Column<MaterialRequest>[] = [
        ...(canRfq && status === 'OPEN' ? [{
            key: 'pick',
            header: <input type="checkbox" aria-label="Select all open requests" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(selectable.map(r => r.id)))} />,
            width: 36,
            render: (r: MaterialRequest) => <input type="checkbox" aria-label={`Select ${r.mr_no}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} />,
        }] : []),
        { key: 'mr_no', header: 'Request', render: r => <><div className="strong">{r.mr_no}</div><div className="muted small">{fmtDate(r.created_at)} · {r.requested_by_user.full_name}</div></> },
        { key: 'project', header: 'Project and site', render: r => <><div>{r.project.project_code}</div><div className="muted small">{r.site.name}, {r.site.city}</div></> },
        { key: 'item', header: 'Item', render: r => <><div>{r.item.name}</div><div className="muted small">{r.item.item_code}{r.boq_line ? ` · ${r.boq_line.code}` : ''}</div></> },
        { key: 'qty', header: 'Quantity', align: 'right', render: r => <>{qty(r.qty)} {r.uom.code}</> },
        {
            key: 'plan', header: 'Against plan', align: 'right',
            render: r => r.boq_qty ? <span className={r.boq_breach_flag ? 'strong' : ''}>{qty(r.cumulative_requested_qty)} of {qty(r.boq_qty)}</span> : <span className="muted">Not in BOQ</span>,
        },
        { key: 'flag', header: 'BOQ check', render: r => r.boq_breach_flag ? <span className="badge danger"><Icon name="warning" />Over BOQ</span> : <span className="badge success">Within BOQ</span> },
        { key: 'urgency', header: 'Urgency', render: r => <span className={`badge ${r.urgency === 'URGENT' ? 'danger' : ''}`}>{r.urgency === 'URGENT' ? 'Urgent' : 'Normal'}</span> },
        { key: 'needed_by', header: 'Needed by', render: r => <NeededBy date={r.needed_by} open={r.status === 'OPEN'} now={now} /> },
        { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
        ...(canCancel && status === 'OPEN' ? [{ key: 'act', header: '', render: (r: MaterialRequest) => <Button size="sm" variant="danger" onClick={() => setCancelFor(r)}>Cancel</Button> }] : []),
    ]

    return (
        <>
            {status === 'OPEN' && state.data ? (
                <div className="kpi-grid">
                    <Kpi label="Open requests" value={all.length} sub={`${new Set(all.map(r => r.project_id)).size} projects`} />
                    <Kpi label="Urgent" value={all.filter(r => r.urgency === 'URGENT').length} tone={all.some(r => r.urgency === 'URGENT') ? 'bad' : undefined} />
                    <Kpi label="Over BOQ plan" value={all.filter(r => r.boq_breach_flag).length} tone={all.some(r => r.boq_breach_flag) ? 'warn' : undefined} sub="Requested more than the project planned" />
                    <Kpi label="Selected" value={selected.length} sub={selected.length ? 'Ready for an RFQ' : 'Tick requests to group them'} />
                </div>
            ) : null}

            <Card>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                    <Field label="Status">
                        <Select value={status} onChange={e => { setStatus(e.target.value); setPicked(new Set()) }}>
                            {REQUEST_STATUSES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                        </Select>
                    </Field>
                    <Field label="Project"><ProjectSelect value={projectId} onChange={id => setProjectId(id)} placeholder="All projects" /></Field>
                    <Field label="Urgency">
                        <Select value={urgency} onChange={e => setUrgency(e.target.value)}>
                            <option value="">Any urgency</option>
                            <option value="URGENT">Urgent</option>
                            <option value="NORMAL">Normal</option>
                        </Select>
                    </Field>
                    <Field label="Search"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Request no, item, project" /></Field>
                </div>
            </Card>

            {canRfq && status === 'OPEN' ? (
                <div className="row" style={{ marginBottom: 12 }}>
                    <Button variant="primary" icon="request_quote" disabled={!selected.length} onClick={() => setRfqOpen(true)}>Create RFQ{selected.length ? ` (${selected.length})` : ''}</Button>
                    {selected.length ? <Button variant="ghost" onClick={() => setPicked(new Set())}>Clear selection</Button> : <span className="muted small">Select open requests from one project to start an RFQ.</span>}
                </div>
            ) : null}

            <Async state={state}>
                {() => (
                    <DataTable
                        columns={columns}
                        rows={rows}
                        empty={<Empty title={status === 'OPEN' ? 'No open material requests' : 'Nothing matches these filters'} icon="shopping_cart">
                            {status === 'OPEN' ? 'Requests raised from the site app will appear here.' : 'Change the status or project filter.'}
                        </Empty>}
                    />
                )}
            </Async>

            {rfqOpen ? (
                <CreateRfqModal
                    requests={selected}
                    onClose={() => setRfqOpen(false)}
                    onCreated={id => { setRfqOpen(false); router.push(`/erp/procurement/rfqs/${id}`) }}
                />
            ) : null}
            <ReasonDialog
                open={!!cancelFor}
                title={cancelFor ? `Cancel ${cancelFor.mr_no}` : 'Cancel request'}
                label="Why is this request being cancelled?"
                confirmLabel="Cancel request"
                danger
                onClose={() => setCancelFor(null)}
                onSubmit={async reason => {
                    if (!cancelFor) return
                    const ok = await run(() => api.post(`/procurement/material-requests/${cancelFor.id}/cancel`, { reason }), `${cancelFor.mr_no} cancelled`)
                    if (ok) { setCancelFor(null); void state.reload() }
                }}
            />
        </>
    )
}

function NeededBy({ date, open, now }: { date: string; open: boolean; now: number }) {
    const days = Math.ceil((new Date(date).getTime() - now) / 86400000)
    return (
        <>
            <div>{fmtDate(date)}</div>
            {open ? (days < 0 ? <span className="badge danger">Overdue by {-days} d</span> : days <= 3 ? <span className="badge warning">In {days} d</span> : <span className="muted small">In {days} days</span>) : null}
        </>
    )
}

// ---------------------------------------------------------------------------------------------- create RFQ
function CreateRfqModal({ requests, onClose, onCreated }: { requests: MaterialRequest[]; onClose: () => void; onCreated: (rfqId: string) => void }) {
    const [vendors, setVendors] = useState<string[]>(['', '', ''])
    const [suggesting, setSuggesting] = useState(false)
    const { run, busy } = useAction()
    const projects = new Set(requests.map(r => r.project_id))
    const mixed = projects.size > 1
    const chosen = vendors.filter(Boolean)
    const duplicate = new Set(chosen).size !== chosen.length

    const setVendor = (i: number, id: string) => setVendors(v => v.map((x, j) => (j === i ? id : x)))
    const suggest = async () => {
        setSuggesting(true)
        await run(async () => {
            const r = await api.get<{ items: VendorRow[] }>('/masters/vendors?limit=200')
            const top = r.items.filter(v => v.is_active).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3)
            setVendors([...top.map(v => v.id), '', '', ''].slice(0, 3))
        })
        setSuggesting(false)
    }
    const submit = async () => {
        const res = await run(() => api.post<{ id: string; rfq_no: string }>('/procurement/rfqs', { material_request_ids: requests.map(r => r.id), vendor_ids: chosen }), 'RFQ created')
        if (res) onCreated(res.id)
    }

    return (
        <Modal
            open
            title="Create RFQ"
            onClose={onClose}
            wide
            footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={mixed || duplicate} onClick={submit}>Create RFQ</Button></>}
        >
            {mixed ? <Alert tone="danger">The selected requests belong to {projects.size} projects. An RFQ covers one project, so go back and select requests from a single project.</Alert> : null}
            <h4 style={{ fontSize: 13, marginBottom: 8 }}>Requests in this RFQ ({requests.length})</h4>
            <DataTable
                rows={requests}
                columns={[
                    { key: 'mr', header: 'Request', render: r => r.mr_no },
                    { key: 'item', header: 'Item', render: r => r.item.name },
                    { key: 'qty', header: 'Quantity', align: 'right', render: r => `${qty(r.qty)} ${r.uom.code}` },
                    { key: 'site', header: 'Site', render: r => r.site.code },
                    { key: 'flag', header: 'BOQ', render: r => (r.boq_breach_flag ? <span className="badge danger">Over BOQ</span> : <span className="badge success">Within</span>) },
                ]}
            />
            <div className="card-header" style={{ marginTop: 18 }}>
                <div>
                    <h2>Vendors to invite</h2>
                    <div className="sub">Up to 3 vendors for a comparative statement. You can add more when entering quotes.</div>
                </div>
                <Button size="sm" icon="auto_awesome" loading={suggesting} onClick={suggest}>Suggest top 3 by rating</Button>
            </div>
            <div className="grid cols-3">
                {vendors.map((v, i) => (
                    <Field key={i} label={`Vendor ${i + 1}${i === 0 ? '' : ' (optional)'}`}>
                        <MasterSelect master="vendors" value={v} onChange={id => setVendor(i, id)} placeholder="Choose vendor..." />
                    </Field>
                ))}
            </div>
            {duplicate ? <Alert tone="warn">The same vendor is chosen twice. Pick different vendors.</Alert> : null}
            {!chosen.length ? <div className="muted small">No vendor chosen: the RFQ is created empty and vendors can be added while entering quotes.</div> : null}
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- RFQ list
function RfqsTab() {
    const router = useRouter()
    const [status, setStatus] = useState('')
    const state = useApi<{ items: RfqRow[] }>('/procurement/rfqs')
    return (
        <>
            <Card>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                    <Field label="Status">
                        <Select value={status} onChange={e => setStatus(e.target.value)}>
                            <option value="">All</option>
                            <option value="OPEN">Open (collecting quotes)</option>
                            <option value="AWARDED">Awarded</option>
                        </Select>
                    </Field>
                </div>
            </Card>
            <Async state={state}>
                {d => (
                    <DataTable
                        rows={d.items.filter(r => !status || r.status === status)}
                        onRowClick={r => router.push(`/erp/procurement/rfqs/${r.id}`)}
                        empty={<Empty title="No RFQs yet" icon="request_quote">Select open material requests on the first tab and create an RFQ.</Empty>}
                        columns={[
                            { key: 'rfq_no', header: 'RFQ', render: r => <Link href={`/erp/procurement/rfqs/${r.id}`} className="strong">{r.rfq_no}</Link> },
                            { key: 'project', header: 'Project', render: r => r.project_code },
                            { key: 'lines', header: 'Lines', align: 'right', render: r => r.lines },
                            { key: 'quotes', header: 'Vendors quoted', align: 'right', render: r => r.quotes },
                            { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
                            { key: 'awarded', header: 'Awarded to', render: r => r.awarded_vendor ?? <span className="muted">Not awarded</span> },
                            { key: 'created', header: 'Created', render: r => fmtDate(r.created_at) },
                        ]}
                    />
                )}
            </Async>
        </>
    )
}
