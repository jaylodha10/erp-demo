'use client'
import { useState } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, inr, isoDate, pct, toNum } from '@/lib/format'
import {
    Alert, Button, Card, DataTable, Empty, Field, Input, Kpi, Modal, NumberInput, PageHeader, ProjectSelect, Select, StatusBadge, Textarea,
} from '@/components/ui'
import { BANK_MODES, KV, MathRow, MathTable, SearchBox, r2, useFormAction } from '../_components/common'

interface Receipt {
    id: string; receipt_no: string; receipt_date: string; project_id: string; sales_invoice_id: string
    amount_received: number; tds_deducted_by_client: number; total_settled_amount: number; payment_mode: string; bank_reference_no: string | null; remarks: string | null
    client: { legal_name: string }; project: { project_code: string }; sales_invoice: { invoice_no: string; invoice_type: string }
}
interface Invoice {
    id: string; invoice_no: string; invoice_type: string; project_id: string; status: string; net_receivable_amount: number; received_amount: number; balance_due: number
    client: { legal_name: string }; project: { project_code: string; name: string }
}
interface ProjectRow {
    id: string; project_code: string; name: string
    billing: { billed_total: number; collected: number; outstanding: number; retention_held: number }
}
const TYPE_LABEL: Record<string, string> = { ADVANCE: 'Advance', RA_BILL: 'RA bill', EXTRA_WORK_BILL: 'Extra work', FINAL_BILL: 'Final bill' }
const invLabel = (s: string) => (s === 'SENT' ? 'Issued' : s === 'PARTIALLY_RECEIVED' ? 'Part received' : undefined)

export default function ReceiptsPage() {
    const { can } = useSession()
    const canRecord = can('ACCOUNTS', 'DIRECTOR')
    const receipts = useApi<{ items: Receipt[] }>('/finance/client-receipts')
    const invoices = useApi<{ items: Invoice[] }>('/finance/sales-invoices')
    const projects = useApi<{ items: ProjectRow[] }>('/projects')
    const [projectId, setProjectId] = useState('')
    const [search, setSearch] = useState('')
    const [recording, setRecording] = useState(false)

    const invById = new Map((invoices.data?.items ?? []).map(i => [i.id, i]))
    const all = receipts.data?.items ?? []
    const q = search.trim().toLowerCase()
    const rows = all.filter(r => (!projectId || r.project_id === projectId)
        && (!q || [r.receipt_no, r.bank_reference_no ?? '', r.sales_invoice.invoice_no, r.project.project_code, r.client.legal_name].some(t => t.toLowerCase().includes(q))))
    const sum = (k: 'amount_received' | 'tds_deducted_by_client' | 'total_settled_amount') => rows.reduce((s, r) => s + toNum(r[k]), 0)
    const projRows = projects.data?.items ?? []
    const open = (invoices.data?.items ?? []).filter(i => ['SENT', 'PARTIALLY_RECEIVED'].includes(i.status) && toNum(i.balance_due) > 0)

    function refresh() { void receipts.reload(); void invoices.reload(); void projects.reload() }

    return (
        <>
            <PageHeader
                title="Client receipts"
                subtitle="Money collected from clients against issued invoices, including the TDS the client deducted. Each receipt reduces the invoice balance and the project's outstanding."
                actions={canRecord ? <Button variant="primary" icon="add" onClick={() => setRecording(true)} disabled={!!invoices.data && open.length === 0} title={open.length === 0 ? 'No issued invoice has a balance' : undefined}>Record receipt</Button> : null}
            />

            <div className="kpi-grid">
                <Kpi label="Received in bank" value={inr(sum('amount_received'))} sub={`${rows.length} receipt${rows.length === 1 ? '' : 's'}`} tone="good" />
                <Kpi label="Client TDS deducted" value={inr(sum('tds_deducted_by_client'))} sub="credit against client's certificate" />
                <Kpi label="Total settled" value={inr(sum('total_settled_amount'))} sub="bank plus TDS" />
                <Kpi label="Open invoices" value={String(open.length)} sub={`${inr(open.reduce((s, i) => s + toNum(i.balance_due), 0))} still to collect`} tone={open.length ? 'warn' : undefined} />
            </div>

            <Card title="Collected vs outstanding, by project" sub="Click a project to filter the register.">
                {projects.error && !projects.data ? <Alert tone="danger">{projects.error}</Alert> : !projects.data ? <Empty title="Loading projects..." icon="progress_activity" /> : (
                    <DataTable<ProjectRow> rows={projRows} rowKey={p => p.id} onRowClick={p => setProjectId(projectId === p.id ? '' : p.id)}
                        empty={<Empty title="No projects yet" icon="apartment" />}
                        columns={[
                            { key: 'project', header: 'Project', render: p => <><div className="strong">{p.project_code}{projectId === p.id ? ' (filtered)' : ''}</div><div className="muted small">{p.name}</div></> },
                            { key: 'billed', header: 'Billed incl. GST', align: 'right', render: p => inr(p.billing.billed_total) },
                            { key: 'collected', header: 'Collected', align: 'right', render: p => inr(p.billing.collected) },
                            {
                                key: 'share', header: 'Collected %', render: p => {
                                    const share = toNum(p.billing.billed_total) > 0 ? (toNum(p.billing.collected) / toNum(p.billing.billed_total)) * 100 : 0
                                    return <div style={{ minWidth: 120 }}><div className="small">{pct(share, 0)}</div><div className="progress good" role="img" aria-label={`${pct(share, 0)} collected`}><div style={{ width: `${Math.min(100, share)}%` }} /></div></div>
                                },
                            },
                            { key: 'outstanding', header: 'Outstanding', align: 'right', render: p => <span style={{ color: toNum(p.billing.outstanding) > 0 ? 'var(--warning)' : undefined, fontWeight: 700 }}>{inr(p.billing.outstanding)}</span> },
                            { key: 'retention', header: 'Retention held', align: 'right', render: p => inr(p.billing.retention_held) },
                        ]} />
                )}
            </Card>

            <Card title="Receipts register">
                <div className="row" style={{ marginBottom: 12 }}>
                    <div style={{ minWidth: 220 }}><ProjectSelect value={projectId} onChange={setProjectId} placeholder="All projects" /></div>
                    <SearchBox value={search} onChange={setSearch} placeholder="Receipt, invoice, UTR or client" label="Search receipts" />
                </div>
                {receipts.error && !receipts.data ? (
                    <Alert tone="danger">{receipts.error} <Button size="sm" onClick={() => void receipts.reload()}>Try again</Button></Alert>
                ) : !receipts.data ? <Empty title="Loading receipts..." icon="progress_activity" /> : (
                    <DataTable<Receipt> rows={rows}
                        empty={<Empty title={all.length ? 'No receipts match' : 'No receipts yet'} icon="savings">{!all.length && canRecord ? 'Record a receipt once a client pays an issued invoice.' : undefined}</Empty>}
                        columns={[
                            { key: 'receipt_no', header: 'Receipt', render: r => <><div className="strong">{r.receipt_no}</div><div className="muted small">{fmtDate(r.receipt_date)}</div></> },
                            { key: 'project', header: 'Project and client', render: r => <><div>{r.project.project_code}</div><div className="muted small">{r.client.legal_name}</div></> },
                            {
                                key: 'invoice', header: 'Against invoice', render: r => {
                                    const inv = invById.get(r.sales_invoice_id)
                                    return <><div>{r.sales_invoice.invoice_no}</div><div className="small">{TYPE_LABEL[r.sales_invoice.invoice_type] ?? r.sales_invoice.invoice_type}{inv ? <> · <StatusBadge status={inv.status} label={invLabel(inv.status)} /></> : null}</div></>
                                },
                            },
                            { key: 'amount_received', header: 'Received', align: 'right', render: r => inr(r.amount_received) },
                            { key: 'tds', header: 'Client TDS', align: 'right', render: r => inr(r.tds_deducted_by_client) },
                            { key: 'total_settled_amount', header: 'Settled', align: 'right', render: r => <span className="strong">{inr(r.total_settled_amount)}</span> },
                            { key: 'mode', header: 'Mode and reference', render: r => <><div>{r.payment_mode}</div><div className="muted small mono">{r.bank_reference_no ?? 'No reference'}</div></> },
                        ]}
                        footer={<tr><td colSpan={3}>Total ({rows.length})</td><td className="num">{inr(sum('amount_received'))}</td><td className="num">{inr(sum('tds_deducted_by_client'))}</td><td className="num">{inr(sum('total_settled_amount'))}</td><td /></tr>} />
                )}
            </Card>

            {recording ? <RecordReceipt open={open} loading={invoices.loading && !invoices.data} onClose={() => setRecording(false)} onDone={refresh} /> : null}
        </>
    )
}

interface ReceiptResult { receipt_no: string; invoice_status: string; balance_due: number; total_settled_amount: number }

function RecordReceipt({ open, loading, onClose, onDone }: { open: Invoice[]; loading: boolean; onClose: () => void; onDone: () => void }) {
    const { run, busy, error } = useFormAction()
    const [invId, setInvId] = useState('')
    const [amount, setAmount] = useState<number | ''>('')
    const [tds, setTds] = useState<number | ''>('')
    const [mode, setMode] = useState<string>('NEFT')
    const [ref, setRef] = useState('')
    const [date, setDate] = useState(isoDate())
    const [remarks, setRemarks] = useState('')
    const [result, setResult] = useState<ReceiptResult | null>(null)

    const inv = open.find(i => i.id === invId)
    const balance = toNum(inv?.balance_due)
    const settled = r2(toNum(amount) + toNum(tds))
    const after = r2(balance - settled)
    const over = !!inv && settled > balance + 0.5
    const valid = !!inv && settled > 0 && !!date

    async function submit() {
        const r = await run(() => api.post<ReceiptResult>('/finance/client-receipts', {
            sales_invoice_id: invId, amount_received: toNum(amount), tds_deducted_by_client: toNum(tds), payment_mode: mode, receipt_date: date,
            ...(ref.trim() ? { bank_reference_no: ref.trim() } : {}), ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
        }))
        if (r) { setResult(r); onDone() }
    }

    return (
        <Modal open title="Record client receipt" onClose={onClose} footer={
            result ? <Button variant="primary" onClick={onClose}>Done</Button> : (
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>Record receipt</Button>
                </>
            )
        }>
            {result ? (
                <Alert tone="success">
                    <strong>{result.receipt_no} recorded for {inr(result.total_settled_amount)}.</strong>
                    <div className="small">{inv?.invoice_no} is now <StatusBadge status={result.invoice_status} label={invLabel(result.invoice_status)} />{toNum(result.balance_due) > 0 ? <> with {inr(result.balance_due)} still outstanding.</> : ' and fully settled.'}</div>
                </Alert>
            ) : (
                <>
                    <Field label="Issued invoice" hint="Only issued invoices with a balance can take a receipt. Draft bills must be issued first.">
                        <Select value={invId} onChange={e => { setInvId(e.target.value); setAmount(''); setTds('') }} disabled={loading}>
                            <option value="">{loading ? 'Loading...' : open.length ? 'Select invoice...' : 'No issued invoice has a balance'}</option>
                            {open.map(i => <option key={i.id} value={i.id}>{i.invoice_no} · {i.project.project_code} · {TYPE_LABEL[i.invoice_type]} · balance {inr(i.balance_due)}</option>)}
                        </Select>
                    </Field>
                    {inv ? (
                        <MathTable>
                            <MathRow label={`${inv.client.legal_name}: net receivable`} value={inr(inv.net_receivable_amount)} />
                            <MathRow label="Already received or settled" value={inr(inv.received_amount)} sign="-" />
                            <MathRow label="Balance on the invoice" value={inr(balance)} sign="=" strong />
                        </MathTable>
                    ) : null}
                    <div className="form-grid" style={{ marginTop: 14 }}>
                        <Field label="Amount received in bank"><NumberInput value={amount} onChange={setAmount} min={0} step="0.01" disabled={!inv} /></Field>
                        <Field label="TDS deducted by client" hint="Settles the invoice but is not cash"><NumberInput value={tds} onChange={setTds} min={0} step="0.01" disabled={!inv} /></Field>
                        <Field label="Payment mode"><Select value={mode} onChange={e => setMode(e.target.value)}>{BANK_MODES.map(m => <option key={m} value={m}>{m}</option>)}</Select></Field>
                        <Field label="Receipt date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
                        <Field label="Bank reference / UTR / cheque no." className="full"><Input value={ref} onChange={e => setRef(e.target.value)} maxLength={60} /></Field>
                        <Field label="Remarks" className="full"><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} /></Field>
                    </div>
                    {inv && settled > 0 ? (
                        over
                            ? <Alert tone="warn">Bank plus TDS ({inr(settled)}) is more than the {inr(balance)} outstanding. The API will refuse this receipt.</Alert>
                            : <Alert tone="info">After this receipt the invoice will be <strong>{after <= 0.5 ? 'Paid' : 'Part received'}</strong>{after > 0.5 ? <> with {inr(after)} still outstanding</> : null}.</Alert>
                    ) : null}
                    {error ? <Alert tone="danger">{error}</Alert> : null}
                    <KV label="Settled by this receipt">{inr(settled)}</KV>
                </>
            )}
        </Modal>
    )
}
