'use client'
import { useState } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, inr, isoDate, toNum } from '@/lib/format'
import {
    Alert, Button, Card, DataTable, Empty, Field, FileField, Input, Kpi, MasterSelect, Modal, NumberInput, PageHeader, ProjectSelect, Select, Textarea, type ProjectOption,
} from '@/components/ui'
import { SearchBox, positive, r2, useFormAction } from '../_components/common'

interface Expense {
    id: string; voucher_no: string; expense_date: string; project_id: string; paid_to: string; description: string; base_amount: number; gst_amount: number; total_amount: number
    payment_mode: string; bill_attachment_url: string | null; status: string
    project: { project_code: string }; site: { code: string }; cost_centre: { code: string }; expense_category: { name: string }
}
interface Category { id: string; code: string; name: string; bill_photo_threshold: number; max_single_voucher_limit: number }
const MODES = ['CASH', 'NEFT', 'UPI', 'CHEQUE', 'RTGS', 'IMPS']

export default function DirectExpensesPage() {
    const { can } = useSession()
    const canPost = can('ACCOUNTS', 'PROJECT_MANAGER', 'DIRECTOR')
    const state = useApi<{ items: Expense[] }>('/finance/direct-expenses')
    const [projectId, setProjectId] = useState('')
    const [search, setSearch] = useState('')
    const [creating, setCreating] = useState(false)

    const all = state.data?.items ?? []
    const q = search.trim().toLowerCase()
    const rows = all.filter(e => (!projectId || e.project_id === projectId)
        && (!q || [e.voucher_no, e.paid_to, e.description, e.expense_category.name, e.project.project_code].some(t => t.toLowerCase().includes(q))))
    const total = rows.reduce((s, e) => s + toNum(e.total_amount), 0)
    const gst = rows.reduce((s, e) => s + toNum(e.gst_amount), 0)
    const monthKey = isoDate().slice(0, 7)
    const thisMonth = rows.filter(e => String(e.expense_date).slice(0, 7) === monthKey).reduce((s, e) => s + toNum(e.total_amount), 0)

    return (
        <>
            <PageHeader
                title="Direct expenses"
                subtitle="Project costs that do not go through a purchase order, such as travel, crane hire or site electricity. They post straight to the project cost ledger when you save."
                actions={canPost ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>New expense</Button> : null}
            />
            <div className="kpi-grid">
                <Kpi label="Total posted" value={inr(total)} sub={`${rows.length} voucher${rows.length === 1 ? '' : 's'}${projectId ? ' for this project' : ''}`} />
                <Kpi label="This month" value={inr(thisMonth)} sub="by expense date" />
                <Kpi label="GST paid on these" value={inr(gst)} sub="input tax, not project cost" />
            </div>
            <Card>
                <div className="row" style={{ marginBottom: 12 }}>
                    <div style={{ minWidth: 220 }}><ProjectSelect value={projectId} onChange={setProjectId} placeholder="All projects" /></div>
                    <SearchBox value={search} onChange={setSearch} placeholder="Voucher, payee, category" label="Search expenses" />
                </div>
                {state.error && !state.data ? (
                    <Alert tone="danger">{state.error} <Button size="sm" onClick={() => void state.reload()}>Try again</Button></Alert>
                ) : !state.data ? <Empty title="Loading expenses..." icon="progress_activity" /> : (
                    <DataTable<Expense> rows={rows}
                        empty={<Empty title={all.length ? 'No expenses match' : 'No direct expenses yet'} icon="account_balance_wallet">{!all.length && canPost ? 'Use New expense to log a project cost that has no PO.' : undefined}</Empty>}
                        columns={[
                            { key: 'voucher_no', header: 'Voucher', render: e => <><div className="strong">{e.voucher_no}</div><div className="muted small">{fmtDate(e.expense_date)}</div></> },
                            { key: 'project', header: 'Project and site', render: e => <><div>{e.project.project_code}</div><div className="muted small">{e.site.code} · {e.cost_centre.code}</div></> },
                            { key: 'category', header: 'Category', render: e => e.expense_category.name },
                            { key: 'paid_to', header: 'Paid to and for', render: e => <><div>{e.paid_to}</div><div className="muted small" style={{ maxWidth: 280 }}>{e.description}</div></> },
                            { key: 'base_amount', header: 'Base', align: 'right', render: e => inr(e.base_amount) },
                            { key: 'gst_amount', header: 'GST', align: 'right', render: e => inr(e.gst_amount) },
                            { key: 'total_amount', header: 'Total', align: 'right', render: e => <span className="strong">{inr(e.total_amount)}</span> },
                            { key: 'mode', header: 'Mode', render: e => e.payment_mode },
                            { key: 'bill', header: 'Bill', render: e => e.bill_attachment_url ? <a href={e.bill_attachment_url} target="_blank" rel="noreferrer">View bill</a> : <span className="muted">None</span> },
                        ]}
                        footer={<tr><td colSpan={4}>Total ({rows.length})</td><td className="num">{inr(rows.reduce((s, e) => s + toNum(e.base_amount), 0))}</td><td className="num">{inr(gst)}</td><td className="num">{inr(total)}</td><td colSpan={2} /></tr>} />
                )}
            </Card>
            {creating ? <NewExpense onClose={() => setCreating(false)} onDone={() => void state.reload()} /> : null}
        </>
    )
}

function NewExpense({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const { run, busy, error } = useFormAction()
    const cats = useApi<{ items: Category[] }>('/finance/expense-categories')
    const [project, setProject] = useState<ProjectOption | null>(null)
    const [siteId, setSiteId] = useState('')
    const [catId, setCatId] = useState('')
    const [cc, setCc] = useState('')
    const [paidTo, setPaidTo] = useState('')
    const [desc, setDesc] = useState('')
    const [base, setBase] = useState<number | ''>('')
    const [gst, setGst] = useState<number | ''>('')
    const [mode, setMode] = useState('CASH')
    const [date, setDate] = useState(isoDate())
    const [bill, setBill] = useState<string | null>(null)
    const [done, setDone] = useState<{ voucher_no: string; total_amount: number } | null>(null)

    const sites = project?.sites ?? []
    const effectiveSite = siteId || (sites.length === 1 ? sites[0].id : '')
    const cat = cats.data?.items.find(c => c.id === catId)
    const threshold = toNum(cat?.bill_photo_threshold)
    const billRequired = !!cat && positive(base) && base >= threshold
    const total = r2(toNum(base) + toNum(gst))
    const valid = !!project && !!effectiveSite && !!cat && paidTo.trim() !== '' && desc.trim() !== '' && positive(base) && !(billRequired && !bill)

    async function submit() {
        const r = await run(() => api.post<{ voucher_no: string; total_amount: number }>('/finance/direct-expenses', {
            project_id: project!.id, site_id: effectiveSite, expense_category_id: catId, ...(cc ? { cost_centre_id: cc } : {}), paid_to: paidTo.trim(), description: desc.trim(),
            base_amount: base, gst_amount: toNum(gst), payment_mode: mode, expense_date: date, ...(bill ? { bill_attachment_url: bill } : {}),
        }))
        if (r) { setDone(r); onDone() }
    }

    return (
        <Modal open title="New direct expense" onClose={onClose} footer={
            done ? <Button variant="primary" onClick={onClose}>Done</Button> : (
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>Post expense</Button>
                </>
            )
        }>
            {done ? (
                <Alert tone="success"><strong>{done.voucher_no} posted for {inr(done.total_amount)}.</strong> <span className="small">It is now part of the project&apos;s actual cost.</span></Alert>
            ) : (
                <>
                    <Alert tone="info">This posts straight to the project cost ledger, with no approval step. Use a purchase order for material and a petty cash voucher for small site cash spends.</Alert>
                    <div className="form-grid">
                        <Field label="Project"><ProjectSelect value={project?.id ?? ''} onChange={(_id, p) => { setProject(p ?? null); setSiteId('') }} /></Field>
                        <Field label="Site">
                            <Select value={effectiveSite} onChange={e => setSiteId(e.target.value)} disabled={!project}>
                                <option value="">{project ? 'Select site...' : 'Choose a project first'}</option>
                                {sites.map(s => <option key={s.id} value={s.id}>{s.code} · {s.city}</option>)}
                            </Select>
                        </Field>
                        <Field label="Expense category" hint={cat ? `A bill is required from ${inr(threshold)}. Category cap per voucher: ${inr(cat.max_single_voucher_limit)}.` : undefined}>
                            <Select value={catId} onChange={e => setCatId(e.target.value)} disabled={cats.loading}>
                                <option value="">{cats.loading ? 'Loading...' : 'Select category...'}</option>
                                {cats.data?.items.map(c => <option key={c.id} value={c.id}>{c.name} (bill from {inr(c.bill_photo_threshold)})</option>)}
                            </Select>
                        </Field>
                        <Field label="Cost centre" hint="Optional: defaults from the category"><MasterSelect master="cost-centres" value={cc} onChange={setCc} placeholder="Category default" /></Field>
                        <Field label="Paid to"><Input value={paidTo} onChange={e => setPaidTo(e.target.value)} maxLength={150} /></Field>
                        <Field label="Expense date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
                        <Field label="Description" className="full"><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></Field>
                        <Field label="Base amount"><NumberInput value={base} onChange={setBase} min={0} step="0.01" /></Field>
                        <Field label="GST amount" hint="Input tax, kept out of project cost"><NumberInput value={gst} onChange={setGst} min={0} step="0.01" /></Field>
                        <Field label="Payment mode"><Select value={mode} onChange={e => setMode(e.target.value)}>{MODES.map(m => <option key={m} value={m}>{m}</option>)}</Select></Field>
                        <Field label="Total paid"><Input readOnly value={inr(total)} className="num" aria-readonly="true" /></Field>
                        <Field label={billRequired ? 'Bill (required)' : 'Bill (optional below the threshold)'} className="full" error={billRequired && !bill ? `A bill is required for expenses of ${inr(threshold)} or more` : undefined}>
                            <FileField value={bill} onChange={setBill} folder="bills" />
                        </Field>
                    </div>
                    {error ? <Alert tone="danger">{error}</Alert> : null}
                </>
            )}
        </Modal>
    )
}
