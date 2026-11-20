'use client'
import { useState } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, humanize, inr, isoDate, pct, toNum } from '@/lib/format'
import {
    Alert, Button, Card, DataTable, Empty, Field, Input, Kpi, Modal, NumberInput, PageHeader, ProjectSelect, ReasonDialog, Select, StatusBadge, Tabs, useAction, useToast, type Column,
} from '@/components/ui'
import { KV, MathRow, MathTable, SearchBox, addDays, r2, useFormAction } from '../_components/common'

type InvoiceType = 'ADVANCE' | 'RA_BILL' | 'EXTRA_WORK_BILL' | 'FINAL_BILL'
interface SalesInvoice {
    id: string; invoice_no: string; invoice_type: InvoiceType; invoice_date: string; client_id: string; project_id: string
    gross_work_value: number; previous_billed_deduction: number; current_bill_subtotal: number; retention_deducted: number; advance_recovery_deducted: number
    other_deductions: number; taxable_amount: number; gst_amount: number; net_receivable_amount: number; received_amount: number; balance_due: number
    status: string; ra_sequence: number | null; variation_id: string | null
    client: { legal_name: string }; project: { project_code: string; name: string }; variation: { var_no: string } | null
}
interface ProjectRow {
    id: string; project_code: string; name: string; status: string
    metrics: { total_contract: number }
    billing: { billed_taxable: number; billed_total: number; collected: number; outstanding: number; retention_held: number }
}
interface ProjectDetail { id: string; work_order: { wo_no: string; advance_pct: number; retention_pct: number; contract_value: number } | null }
interface Variation { id: string; var_no: string; description: string; client_price: number; status: string; project_id: string }

const TYPE_LABEL: Record<InvoiceType, string> = { ADVANCE: 'Advance', RA_BILL: 'RA bill', EXTRA_WORK_BILL: 'Extra work bill', FINAL_BILL: 'Final bill' }
const TYPE_HELP: Record<InvoiceType, string> = {
    ADVANCE: 'Advance against the work order. No retention or advance recovery.',
    RA_BILL: 'Running account bill for work done to date, with retention and advance recovery.',
    EXTRA_WORK_BILL: 'Bill for client-approved extra work that has been completed.',
    FINAL_BILL: 'Closing bill for the remaining work, with retention and advance recovery.',
}
const VARIATION_WHY: Record<string, string> = {
    PENDING_APPROVAL: 'still in approval (PM, Commercial, Director and client sign-off are all needed)',
    APPROVED: 'approved, but the work is not marked completed yet',
    REJECTED: 'rejected',
    BILLED: 'already billed',
    PAID: 'already billed and paid',
    CANCELLED: 'cancelled',
}
const invLabel = (s: string) => (s === 'SENT' ? 'Issued' : s === 'PARTIALLY_RECEIVED' ? 'Part received' : undefined)

type Tab = 'ALL' | 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'PAID' | 'CANCELLED'

export default function SalesInvoicesPage() {
    const { can } = useSession()
    const canRaise = can('COMMERCIAL', 'ACCOUNTS', 'DIRECTOR')
    const canCancel = can('ACCOUNTS', 'DIRECTOR')
    const invoices = useApi<{ items: SalesInvoice[] }>('/finance/sales-invoices')
    const projects = useApi<{ items: ProjectRow[] }>('/projects')
    const clients = useApi<{ items: { id: string; payment_terms_days: number }[] }>('/masters/clients?limit=200')
    const { run, busy } = useAction()
    const [tab, setTab] = useState<Tab>('ALL')
    const [projectId, setProjectId] = useState('')
    const [search, setSearch] = useState('')
    const [creating, setCreating] = useState(false)
    const [detail, setDetail] = useState<SalesInvoice | null>(null)
    const [cancelling, setCancelling] = useState<SalesInvoice | null>(null)

    const items = invoices.data?.items ?? []
    const terms = new Map((clients.data?.items ?? []).map(c => [c.id, c.payment_terms_days]))
    const scoped = projectId ? items.filter(i => i.project_id === projectId) : items
    const count = (s: string) => scoped.filter(i => i.status === s).length
    const q = search.trim().toLowerCase()
    const rows = scoped.filter(i => (tab === 'ALL' || i.status === tab) && (!q || [i.invoice_no, i.project.project_code, i.client.legal_name, i.variation?.var_no ?? ''].some(t => t.toLowerCase().includes(q))))

    const live = scoped.filter(i => i.status !== 'CANCELLED')
    const billed = live.reduce((s, i) => s + toNum(i.net_receivable_amount), 0)
    const received = live.reduce((s, i) => s + toNum(i.received_amount), 0)
    const open = live.reduce((s, i) => s + toNum(i.balance_due), 0)
    const drafts = scoped.filter(i => i.status === 'DRAFT').length

    const dueOf = (i: SalesInvoice) => (terms.has(i.client_id) ? addDays(i.invoice_date, terms.get(i.client_id)!) : null)
    const isOverdue = (i: SalesInvoice) => {
        const d = dueOf(i)
        return !!d && ['SENT', 'PARTIALLY_RECEIVED'].includes(i.status) && toNum(i.balance_due) > 0 && isoDate(d) < isoDate()
    }

    async function issue(i: SalesInvoice) {
        await run(() => api.post(`/finance/sales-invoices/${i.id}/issue`), `${i.invoice_no} issued to the client`)
        await invoices.reload(); await projects.reload()
    }

    const columns: Column<SalesInvoice>[] = [
        {
            key: 'invoice_no', header: 'Invoice', render: i => (
                <><div className="strong">{i.invoice_no}</div>
                    <div className="muted small">{TYPE_LABEL[i.invoice_type]}{i.ra_sequence ? ` #${i.ra_sequence}` : ''}{i.variation ? ` · ${i.variation.var_no}` : ''}</div></>
            ),
        },
        { key: 'project', header: 'Project and client', render: i => <><div>{i.project.project_code}</div><div className="muted small">{i.client.legal_name}</div></> },
        { key: 'invoice_date', header: 'Date', render: i => fmtDate(i.invoice_date) },
        { key: 'taxable_amount', header: 'Taxable', align: 'right', render: i => inr(i.taxable_amount) },
        { key: 'net', header: 'Net receivable', align: 'right', render: i => <><div className="strong">{inr(i.net_receivable_amount)}</div><div className="muted small">incl. GST {inr(i.gst_amount)}</div></> },
        { key: 'balance_due', header: 'Balance', align: 'right', render: i => inr(i.balance_due) },
        {
            key: 'status', header: 'Status and due', render: i => {
                const due = dueOf(i)
                const showDue = !!due && ['SENT', 'PARTIALLY_RECEIVED'].includes(i.status) && toNum(i.balance_due) > 0
                return (
                    <>
                        <StatusBadge status={i.status} label={invLabel(i.status)} />
                        {showDue ? <div className="small" style={{ marginTop: 4, color: isOverdue(i) ? 'var(--danger)' : undefined, fontWeight: isOverdue(i) ? 700 : undefined }}>{isOverdue(i) ? 'Overdue since ' : 'Due '}{fmtDate(due)}</div> : null}
                    </>
                )
            },
        },
        {
            key: 'actions', header: '', render: i => (
                <div className="actions" onClick={e => e.stopPropagation()}>
                    {i.status === 'DRAFT' && canRaise ? <Button size="sm" variant="primary" disabled={busy} onClick={() => issue(i)}>Issue</Button> : null}
                    {['DRAFT', 'SENT', 'APPROVED'].includes(i.status) && canCancel && toNum(i.received_amount) === 0 ? <Button size="sm" variant="danger" onClick={() => setCancelling(i)}>Cancel</Button> : null}
                </div>
            ),
        },
    ]

    const projRows = projects.data?.items ?? []
    const totals = projRows.reduce((t, p) => ({
        contract: t.contract + toNum(p.metrics?.total_contract), taxable: t.taxable + toNum(p.billing.billed_taxable), total: t.total + toNum(p.billing.billed_total),
        collected: t.collected + toNum(p.billing.collected), outstanding: t.outstanding + toNum(p.billing.outstanding), retention: t.retention + toNum(p.billing.retention_held),
    }), { contract: 0, taxable: 0, total: 0, collected: 0, outstanding: 0, retention: 0 })

    return (
        <>
            <PageHeader
                title="Client billing"
                subtitle="Advance, running account, extra work and final bills to the client. Retention and advance recovery are deducted, GST is charged on the taxable amount. The API does the maths when you create a bill."
                actions={canRaise ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>New bill</Button> : null}
            />

            <div className="kpi-grid">
                <Kpi label="Billed (incl. GST)" value={inr(billed)} sub={`${live.length} live invoice${live.length === 1 ? '' : 's'}`} />
                <Kpi label="Received" value={inr(received)} sub="cash plus client TDS" tone="good" />
                <Kpi label="Outstanding" value={inr(open)} sub="issued, still to collect" tone={open > 0 ? 'warn' : undefined} />
                <Kpi label="Draft bills" value={String(drafts)} sub="waiting to be issued" tone={drafts ? 'warn' : undefined} />
            </div>

            <Card title="Billed against contract, by project" sub="Taxable billing to date compared with the contract value including approved extra work. Click a project to filter the invoices below.">
                {projects.error && !projects.data ? <Alert tone="danger">{projects.error}</Alert> : !projects.data ? <Empty title="Loading projects..." icon="progress_activity" /> : (
                    <DataTable<ProjectRow> rows={projRows} rowKey={p => p.id} onRowClick={p => setProjectId(projectId === p.id ? '' : p.id)}
                        empty={<Empty title="No projects yet" icon="apartment" />}
                        columns={[
                            { key: 'project', header: 'Project', render: p => <><div className="strong">{p.project_code}{projectId === p.id ? ' (filtered)' : ''}</div><div className="muted small">{p.name}</div></> },
                            { key: 'contract', header: 'Contract', align: 'right', render: p => inr(p.metrics?.total_contract) },
                            {
                                key: 'billed', header: 'Billed (taxable)', align: 'right', render: p => {
                                    const c = toNum(p.metrics?.total_contract)
                                    const share = c > 0 ? (toNum(p.billing.billed_taxable) / c) * 100 : 0
                                    return (
                                        <div style={{ minWidth: 150 }}>
                                            <div>{inr(p.billing.billed_taxable)} <span className="muted small">({pct(share, 0)})</span></div>
                                            <div className={`progress ${share > 100 ? 'bad' : ''}`} role="img" aria-label={`${pct(share, 0)} of contract billed`}><div style={{ width: `${Math.min(100, share)}%` }} /></div>
                                        </div>
                                    )
                                },
                            },
                            { key: 'billed_total', header: 'Billed incl. GST', align: 'right', render: p => inr(p.billing.billed_total) },
                            { key: 'collected', header: 'Collected', align: 'right', render: p => inr(p.billing.collected) },
                            { key: 'outstanding', header: 'Outstanding', align: 'right', render: p => inr(p.billing.outstanding) },
                            { key: 'retention', header: 'Retention held', align: 'right', render: p => inr(p.billing.retention_held) },
                        ]}
                        footer={<tr><td>Total</td><td className="num">{inr(totals.contract)}</td><td className="num">{inr(totals.taxable)}</td><td className="num">{inr(totals.total)}</td><td className="num">{inr(totals.collected)}</td><td className="num">{inr(totals.outstanding)}</td><td className="num">{inr(totals.retention)}</td></tr>}
                    />
                )}
            </Card>

            <Card>
                <Tabs<Tab> value={tab} onChange={setTab} tabs={[
                    { id: 'ALL', label: 'All', count: scoped.length },
                    { id: 'DRAFT', label: 'Draft', count: count('DRAFT') },
                    { id: 'SENT', label: 'Issued', count: count('SENT') },
                    { id: 'PARTIALLY_RECEIVED', label: 'Part received', count: count('PARTIALLY_RECEIVED') },
                    { id: 'PAID', label: 'Paid', count: count('PAID') },
                    { id: 'CANCELLED', label: 'Cancelled', count: count('CANCELLED') },
                ]} />
                <div className="row" style={{ marginBottom: 12 }}>
                    <div style={{ minWidth: 220 }}><ProjectSelect value={projectId} onChange={setProjectId} placeholder="All projects" /></div>
                    <SearchBox value={search} onChange={setSearch} placeholder="Invoice, client or extra-work no." label="Search sales invoices" />
                </div>
                {invoices.error && !invoices.data ? (
                    <Alert tone="danger">{invoices.error} <Button size="sm" onClick={() => void invoices.reload()}>Try again</Button></Alert>
                ) : !invoices.data ? <Empty title="Loading invoices..." icon="progress_activity" /> : (
                    <DataTable columns={columns} rows={rows} onRowClick={setDetail}
                        empty={<Empty title={items.length ? 'No invoices match' : 'No client invoices yet'} icon="request_page">{!items.length && canRaise ? 'Use New bill to raise the advance or a running bill.' : 'Try another tab, project or search.'}</Empty>} />
                )}
            </Card>

            {creating ? <NewBill onClose={() => setCreating(false)} onDone={() => { void invoices.reload(); void projects.reload() }} /> : null}
            {detail ? (
                <Modal open title={`${detail.invoice_no} · ${TYPE_LABEL[detail.invoice_type]}`} onClose={() => setDetail(null)} footer={
                    <>
                        <Button onClick={() => setDetail(null)}>Close</Button>
                        {detail.status === 'DRAFT' && canRaise ? <Button variant="primary" loading={busy} onClick={async () => { await issue(detail); setDetail(null) }}>Issue to client</Button> : null}
                    </>
                }>
                    <div className="grid cols-3" style={{ marginBottom: 12 }}>
                        <KV label="Status"><StatusBadge status={detail.status} label={invLabel(detail.status)} /></KV>
                        <KV label="Project">{detail.project.project_code}</KV>
                        <KV label="Client">{detail.client.legal_name}</KV>
                        <KV label="Invoice date">{fmtDate(detail.invoice_date)}</KV>
                        <KV label="Due">{dueOf(detail) ? fmtDate(dueOf(detail)) : '—'}</KV>
                        <KV label="Received so far">{inr(detail.received_amount)}</KV>
                    </div>
                    <BillBreakdown inv={detail} />
                    {detail.status === 'DRAFT' ? <p className="muted small">Draft bills are not yet visible to the client and cannot take receipts. Issue the bill first.</p> : null}
                </Modal>
            ) : null}
            <ReasonDialog open={!!cancelling} danger title={`Cancel ${cancelling?.invoice_no ?? ''}`} label="Reason for cancelling" confirmLabel="Cancel invoice" onClose={() => setCancelling(null)}
                onSubmit={async reason => {
                    if (!cancelling) return
                    const r = await run(() => api.post(`/finance/sales-invoices/${cancelling.id}/cancel`, { reason }), `${cancelling.invoice_no} cancelled`)
                    if (r) { setCancelling(null); setDetail(null); await invoices.reload(); await projects.reload() }
                }} />
        </>
    )
}

function BillBreakdown({ inv }: { inv: SalesInvoice }) {
    const gstPct = toNum(inv.taxable_amount) > 0 ? (toNum(inv.gst_amount) / toNum(inv.taxable_amount)) * 100 : 0
    return (
        <MathTable>
            <MathRow label="Work value" value={inr(inv.gross_work_value)} sign="+" />
            {toNum(inv.previous_billed_deduction) ? <MathRow label="Less previously billed" value={inr(inv.previous_billed_deduction)} sign="-" /> : null}
            <MathRow label="This bill's work value" value={inr(inv.current_bill_subtotal)} sign="=" strong />
            <MathRow label="Less retention" value={inr(inv.retention_deducted)} sign="-" muted={!toNum(inv.retention_deducted)} />
            <MathRow label="Less advance recovery" value={inr(inv.advance_recovery_deducted)} sign="-" muted={!toNum(inv.advance_recovery_deducted)} />
            <MathRow label="Less other deductions" value={inr(inv.other_deductions)} sign="-" muted={!toNum(inv.other_deductions)} />
            <MathRow label="Taxable amount" value={inr(inv.taxable_amount)} sign="=" strong />
            <MathRow label={`Add GST (${pct(gstPct, 1)})`} value={inr(inv.gst_amount)} sign="+" />
            <MathRow label="Net receivable" value={inr(inv.net_receivable_amount)} sign="=" strong />
            <MathRow label="Balance still due" value={inr(inv.balance_due)} muted />
        </MathTable>
    )
}

// ---------------------------------------------------------------------------------------------- create bill with live calculator
function NewBill({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const { run, busy, error } = useFormAction()
    const toast = useToast()
    const [projectId, setProjectId] = useState('')
    const [type, setType] = useState<InvoiceType>('RA_BILL')
    const [date, setDate] = useState(isoDate())
    const [gross, setGross] = useState<number | ''>('')
    const [prevOv, setPrevOv] = useState<number | ''>('')
    const [retOv, setRetOv] = useState<number | ''>('')
    const [advOv, setAdvOv] = useState<number | ''>('')
    const [other, setOther] = useState<number | ''>('')
    const [gstPct, setGstPct] = useState<number | ''>(18)
    const [varId, setVarId] = useState('')

    const proj = useApi<ProjectDetail>(projectId ? `/projects/${projectId}` : null)
    const hist = useApi<{ items: SalesInvoice[] }>(projectId ? `/finance/sales-invoices?project_id=${projectId}` : null)
    const vars = useApi<{ items: Variation[] }>(projectId && type === 'EXTRA_WORK_BILL' ? `/variations?project_id=${projectId}` : null)

    const wo = proj.data && proj.data.id === projectId ? proj.data.work_order : null
    const loadingCtx = !!projectId && (!proj.data || proj.data.id !== projectId)
    const past = (hist.data?.items ?? []).filter(i => i.project_id === projectId && i.status !== 'CANCELLED')
    const sum = (l: SalesInvoice[], k: keyof SalesInvoice) => l.reduce((s, i) => s + toNum(i[k]), 0)
    const advanceBilled = sum(past.filter(i => i.invoice_type === 'ADVANCE'), 'taxable_amount')
    const recovered = sum(past, 'advance_recovery_deducted')
    const advOutstanding = r2(advanceBilled - recovered)
    const workBilled = sum(past.filter(i => i.invoice_type === 'RA_BILL' || i.invoice_type === 'FINAL_BILL'), 'current_bill_subtotal')
    const contract = toNum(wo?.contract_value)

    const isRA = type === 'RA_BILL' || type === 'FINAL_BILL'
    const allVars = (vars.data?.items ?? []).filter(v => v.project_id === projectId)
    const billable = allVars.filter(v => v.status === 'WORK_COMPLETED')
    const blocked = allVars.filter(v => v.status !== 'WORK_COMPLETED')
    const variation = billable.find(v => v.id === varId) ?? null

    const grossNum = type === 'EXTRA_WORK_BILL' ? toNum(variation?.client_price) : toNum(gross)
    const previous = isRA ? (prevOv === '' ? workBilled : prevOv) : 0
    const subtotal = r2(grossNum - previous)
    const retPct = retOv === '' ? toNum(wo?.retention_pct) : retOv
    const retention = isRA ? r2((subtotal * retPct) / 100) : 0
    const advDefault = Math.max(0, Math.min(r2((subtotal * toNum(wo?.advance_pct)) / 100), advOutstanding))
    const recovery = isRA ? (advOv === '' ? advDefault : advOv) : 0
    const otherNum = toNum(other)
    const taxable = r2(subtotal - retention - recovery - otherNum)
    const gstNum = toNum(gstPct)
    const gst = r2((taxable * gstNum) / 100)
    const net = r2(taxable + gst)

    const warnings: string[] = []
    if (isRA && contract > 0 && workBilled + subtotal > contract + 0.5) warnings.push(`Billing would exceed the contract value of ${inr(contract)}. Raise extra work as a variation instead.`)
    if (isRA && recovery > advOutstanding + 0.005) warnings.push(`Only ${inr(advOutstanding)} of advance is left to recover.`)
    if (taxable < 0) warnings.push('Deductions are more than the bill value.')
    if (isRA && grossNum > 0 && subtotal <= 0) warnings.push('The work value must be more than what has already been billed.')

    const ready = !!projectId && !!wo && taxable >= 0 && (type === 'EXTRA_WORK_BILL' ? !!variation : toNum(gross) > 0) && (!isRA || subtotal > 0)

    function pickProject(id: string) { setProjectId(id); setPrevOv(''); setRetOv(''); setAdvOv(''); setVarId('') }

    async function submit() {
        const body: Record<string, unknown> = { project_id: projectId, invoice_type: type, invoice_date: date, gst_pct: gstNum, other_deductions: otherNum }
        if (type === 'EXTRA_WORK_BILL') body.variation_id = variation!.id
        else body.gross_work_value = toNum(gross)
        if (isRA) { body.previous_billed_deduction = previous; body.retention_pct = retPct; body.advance_recovery = recovery }
        const r = await run(() => api.post<{ invoice_no: string; net_receivable_amount: number }>('/finance/sales-invoices', body))
        if (r) {
            toast.success(`${r.invoice_no} created as a draft for ${inr(r.net_receivable_amount)}. Issue it when it is ready to send.`)
            onDone(); onClose()
        }
    }

    return (
        <Modal open wide title="New client bill" onClose={onClose} footer={
            <>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" loading={busy} disabled={!ready} onClick={submit}>Create draft bill</Button>
            </>
        }>
            <div className="grid cols-2" style={{ alignItems: 'start' }}>
                <div>
                    <Field label="Project"><ProjectSelect value={projectId} onChange={pickProject} /></Field>
                    <div className="form-grid">
                        <Field label="Bill type" hint={TYPE_HELP[type]}>
                            <Select value={type} onChange={e => { setType(e.target.value as InvoiceType); setVarId(''); setAdvOv('') }}>
                                {(Object.keys(TYPE_LABEL) as InvoiceType[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                            </Select>
                        </Field>
                        <Field label="Invoice date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
                    </div>

                    {projectId && loadingCtx ? <Alert tone="info">Loading the work order...</Alert> : null}
                    {projectId && !loadingCtx && !wo ? <Alert tone="danger">This project has no client work order to bill against.</Alert> : null}
                    {wo ? (
                        <div className="grid cols-2" style={{ marginBottom: 12 }}>
                            <KV label="Work order">{wo.wo_no}</KV>
                            <KV label="Contract value">{inr(contract)}</KV>
                            <KV label="Advance / retention in work order">{pct(wo.advance_pct, 0)} / {pct(wo.retention_pct, 0)}</KV>
                            <KV label="Work billed so far (RA and final)">{inr(workBilled)}</KV>
                            <KV label="Advance billed">{inr(advanceBilled)}</KV>
                            <KV label="Advance still to recover">{inr(advOutstanding)}</KV>
                        </div>
                    ) : null}

                    {type === 'EXTRA_WORK_BILL' ? (
                        <>
                            <Field label="Extra work to bill" hint="Only extra work that is fully approved and marked completed can be billed.">
                                <Select value={varId} onChange={e => setVarId(e.target.value)} disabled={!projectId || vars.loading}>
                                    <option value="">{!projectId ? 'Choose a project first' : vars.loading ? 'Loading...' : billable.length ? 'Select extra work...' : 'Nothing is ready to bill'}</option>
                                    {billable.map(v => <option key={v.id} value={v.id}>{v.var_no} · {v.description} · {inr(v.client_price)}</option>)}
                                </Select>
                            </Field>
                            {projectId && !vars.loading && blocked.length ? (
                                <Alert tone="info">
                                    <div className="strong">Not available to bill</div>
                                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                        {blocked.map(v => <li key={v.id} className="small">{v.var_no}: {VARIATION_WHY[v.status] ?? humanize(v.status).toLowerCase()}</li>)}
                                    </ul>
                                </Alert>
                            ) : null}
                            {vars.error ? <Alert tone="danger">{vars.error}</Alert> : null}
                        </>
                    ) : (
                        <Field label={isRA ? 'Work value to date (cumulative, before GST)' : 'Advance amount (before GST)'}
                            hint={type === 'ADVANCE' && wo ? <>Work order says {pct(wo.advance_pct, 0)} advance, which is {inr(r2((contract * toNum(wo.advance_pct)) / 100))}. <button type="button" className="btn btn-sm btn-ghost" onClick={() => setGross(r2((contract * toNum(wo.advance_pct)) / 100))}>Use that</button></> : isRA ? 'Total certified work value to date. Earlier bills are deducted below.' : undefined}>
                            <NumberInput value={gross} onChange={setGross} min={0} step="0.01" />
                        </Field>
                    )}
                    {isRA ? (
                        <div className="form-grid">
                            <Field label="Less previously billed" hint="Defaults to earlier RA and final bills"><NumberInput value={prevOv === '' ? workBilled : prevOv} onChange={setPrevOv} min={0} step="0.01" /></Field>
                            <Field label="Retention %" hint="Default from the work order"><NumberInput value={retOv === '' ? toNum(wo?.retention_pct) : retOv} onChange={setRetOv} min={0} max={100} step="0.01" /></Field>
                            <Field label="Advance recovery" hint={`Default: advance % of this bill, capped at the ${inr(advOutstanding)} still outstanding`} className="full"><NumberInput value={advOv === '' ? advDefault : advOv} onChange={setAdvOv} min={0} step="0.01" /></Field>
                        </div>
                    ) : null}
                    <div className="form-grid">
                        <Field label="Other deductions"><NumberInput value={other} onChange={setOther} min={0} step="0.01" /></Field>
                        <Field label="GST %"><NumberInput value={gstPct} onChange={setGstPct} min={0} max={100} step="0.01" /></Field>
                    </div>
                </div>

                <div>
                    <h4 style={{ margin: '0 0 8px' }}>Bill calculator, live</h4>
                    <MathTable>
                        <MathRow label={type === 'EXTRA_WORK_BILL' ? 'Extra work client price' : type === 'ADVANCE' ? 'Advance amount' : 'Work value to date'} value={inr(grossNum)} sign="+" />
                        {isRA ? <MathRow label="Less previously billed" value={inr(previous)} sign="-" /> : null}
                        <MathRow label="This bill's work value" value={inr(subtotal)} sign="=" strong />
                        {isRA ? <MathRow label={`Less retention (${pct(retPct, 1)})`} value={inr(retention)} sign="-" /> : null}
                        {isRA ? <MathRow label="Less advance recovery" value={inr(recovery)} sign="-" /> : null}
                        <MathRow label="Less other deductions" value={inr(otherNum)} sign="-" muted={!otherNum} />
                        <MathRow label="Taxable amount" value={inr(taxable)} sign="=" strong />
                        <MathRow label={`Add GST (${pct(gstNum, 1)})`} value={inr(gst)} sign="+" />
                        <MathRow label="Net receivable" value={inr(net)} sign="=" strong />
                    </MathTable>
                    {error ? <div style={{ marginTop: 10 }}><Alert tone="danger">{error}</Alert></div> : null}
                    {warnings.map(w => <div key={w} style={{ marginTop: 10 }}><Alert tone="warn">{w}</Alert></div>)}
                    <p className="muted small" style={{ marginTop: 10 }}>This is a preview. The server recalculates everything when the draft is created and rejects over-billing or too much advance recovery with its own message.</p>
                </div>
            </div>
        </Modal>
    )
}
