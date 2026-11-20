'use client'
import { useState } from 'react'
import Link from 'next/link'
import { api, qs, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, humanize, inr, isoDate, pct, toNum } from '@/lib/format'
import {
    Alert, Button, Card, DataTable, Empty, Field, FileField, Icon, Input, Kpi, Modal, NumberInput, PageHeader, ReasonDialog, Select, StatusBadge, Tabs, Textarea, useAction, useToast,
} from '@/components/ui'
import { KV, MathRow, MathTable, addDays, r2, useFormAction } from '../_components/common'

// ---------------------------------------------------------------------------------------------- types
interface FundCard {
    id: string; code: string | null; project: { project_code: string; name: string }; site: { code: string; city: string; short_code: string | null }; custodian: string
    imprest_limit: number; replenishment_trigger_balance: number; current_book_balance: number; below_trigger: boolean
    last_reconciled_date: string | null; locked_until_date: string | null; reconciliation_due: boolean; expenses_to_review: number; funding_pending: number
}
interface Voucher {
    id: string; voucher_no: string | null; voucher_type: string; voucher_date: string; cash_in_amount: number; cash_out_amount: number; running_balance_after: number | null
    description: string; paid_to: string | null; bill_photo_url: string | null; status: string; rejection_reason: string | null; requested_by: string
    expense_category: { name: string } | null; requested_by_user: { full_name: string }; approved_by_user: { full_name: string } | null
}
interface Recon {
    id: string; recon_no: string; period_start: string; period_end: string; opening_balance: number; cash_received: number; expenses: number; expected_cash: number
    physical_cash: number; variance: number; variance_explanation: string | null; locked: boolean; reconciled_by_user: { full_name: string }
}
interface FundDetail {
    fund: Omit<FundCard, 'expenses_to_review' | 'funding_pending'>
    vouchers: Voucher[]; reconciliations: Recon[]; open_variances: { id: string; message: string }[]
}
interface Category { id: string; code: string; name: string; bill_photo_threshold: number; max_single_voucher_limit: number }
interface Preview { period_start: string; period_end: string; opening: number; received: number; expenses: number; expected: number; book_balance: number }

const TYPE_LABEL: Record<string, string> = { FUND_REQUEST: 'Fund request', REPLENISHMENT_IN: 'Replenishment', EXPENSE_OUT: 'Expense', RECONCILIATION_ADJ: 'Reconciliation adjustment' }
const REVIEWERS = ['PROJECT_MANAGER', 'ACCOUNTS', 'PROJECT_HEAD', 'DIRECTOR']
const RECONCILERS = ['SITE_SUPERVISOR', 'ACCOUNTS', 'PROJECT_MANAGER', 'DIRECTOR']
const LOCKERS = ['ACCOUNTS', 'DIRECTOR']
const dayAfter = (v: string | null) => (v ? isoDate(addDays(v, 1)) : '')
const statusLabel = (v: Pick<Voucher, 'status' | 'voucher_type'>) => (v.status === 'POSTED' && v.voucher_type === 'EXPENSE_OUT' ? 'Awaiting review' : v.status === 'POSTED' ? 'Posted' : undefined)

// ---------------------------------------------------------------------------------------------- page
export default function PettyCashPage() {
    const funds = useApi<{ items: FundCard[] }>('/finance/petty-cash/funds')
    const [openId, setOpenId] = useState<string | null>(null)

    if (openId) return <FundView id={openId} onBack={() => { setOpenId(null); void funds.reload() }} />

    const items = funds.data?.items ?? []
    return (
        <>
            <PageHeader title="Petty cash and period lock" subtitle="Each site holds an imprest float. Spends are posted at once and reviewed by a PM or Accounts, top-ups go through approval, and Accounts locks each month once the cash is counted." />
            <div className="kpi-grid">
                <Kpi label="Cash in site funds" value={inr(items.reduce((s, f) => s + toNum(f.current_book_balance), 0))} sub={`${items.length} fund${items.length === 1 ? '' : 's'}`} />
                <Kpi label="Below top-up trigger" value={String(items.filter(f => f.below_trigger).length)} sub="need replenishment" tone={items.some(f => f.below_trigger) ? 'warn' : undefined} />
                <Kpi label="Reconciliation due" value={String(items.filter(f => f.reconciliation_due).length)} sub="last month not counted" tone={items.some(f => f.reconciliation_due) ? 'bad' : undefined} />
                <Kpi label="Expenses to review" value={String(items.reduce((s, f) => s + f.expenses_to_review, 0))} sub="posted, awaiting PM or Accounts" tone={items.some(f => f.expenses_to_review) ? 'warn' : undefined} />
            </div>
            {funds.error && !funds.data ? (
                <Alert tone="danger">{funds.error} <Button size="sm" onClick={() => void funds.reload()}>Try again</Button></Alert>
            ) : !funds.data ? <Empty title="Loading funds..." icon="progress_activity" /> : items.length === 0 ? (
                <Card><Empty title="No petty cash funds yet" icon="wallet">A fund is created automatically when a project site is set up.</Empty></Card>
            ) : (
                <div className="grid cols-3">
                    {items.map(f => <FundSummary key={f.id} f={f} onOpen={() => setOpenId(f.id)} />)}
                </div>
            )}
        </>
    )
}

function FundSummary({ f, onOpen }: { f: FundCard; onOpen: () => void }) {
    const share = f.imprest_limit > 0 ? Math.min(100, (f.current_book_balance / f.imprest_limit) * 100) : 0
    return (
        <section className="card" style={{ marginBottom: 0 }}>
            <div className="card-header" style={{ marginBottom: 8 }}>
                <div>
                    <h2>{f.code ?? f.site.code}</h2>
                    <div className="sub">{f.project.project_code} · {f.site.city} · {f.custodian}</div>
                </div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{inr(f.current_book_balance)}</div>
            <div className="muted small" style={{ marginBottom: 6 }}>of {inr(f.imprest_limit)} imprest limit · top-up trigger {inr(f.replenishment_trigger_balance)}</div>
            <div className={`progress ${f.below_trigger ? 'bad' : 'good'}`} role="img" aria-label={`${pct(share, 0)} of imprest limit`}><div style={{ width: `${share}%` }} /></div>
            <div className="row" style={{ margin: '12px 0', gap: 6 }}>
                {f.below_trigger ? <span className="badge warning"><Icon name="warning" /> Below trigger</span> : null}
                {f.reconciliation_due ? <span className="badge danger"><Icon name="event_busy" /> Reconciliation due</span> : null}
                {f.expenses_to_review > 0 ? <span className="badge info">{f.expenses_to_review} to review</span> : null}
                {f.funding_pending > 0 ? <span className="badge purple">{f.funding_pending} funding pending</span> : null}
                {!f.below_trigger && !f.reconciliation_due && !f.expenses_to_review && !f.funding_pending ? <span className="badge success">All clear</span> : null}
            </div>
            <div className="muted small" style={{ marginBottom: 12 }}>
                {f.locked_until_date ? <>Locked until {fmtDate(f.locked_until_date)}</> : 'No period locked yet'} · {f.last_reconciled_date ? <>counted {fmtDate(f.last_reconciled_date)}</> : 'never counted'}
            </div>
            <Button variant="primary" onClick={onOpen} icon="open_in_new" aria-label={`Open fund ${f.code ?? f.site.code}`}>Open fund</Button>
        </section>
    )
}

// ---------------------------------------------------------------------------------------------- fund detail
type Tab = 'LEDGER' | 'REVIEW' | 'RECON'

function FundView({ id, onBack }: { id: string; onBack: () => void }) {
    const { user, can } = useSession()
    const state = useApi<FundDetail>(`/finance/petty-cash/funds/${id}`)
    const { run, busy } = useAction()
    const [tab, setTab] = useState<Tab>('LEDGER')
    const [requesting, setRequesting] = useState(false)
    const [logging, setLogging] = useState(false)
    const [reconciling, setReconciling] = useState(false)
    const [locking, setLocking] = useState<Recon | null>(null)
    const [rejecting, setRejecting] = useState<Voucher | null>(null)

    const canReview = can(...REVIEWERS)
    const canRecon = can(...RECONCILERS)
    const canLock = can(...LOCKERS)

    if (state.error && !state.data) return <><Button icon="arrow_back" onClick={onBack}>All funds</Button><div style={{ marginTop: 12 }}><Alert tone="danger">{state.error} <Button size="sm" onClick={() => void state.reload()}>Try again</Button></Alert></div></>
    if (!state.data) return <Empty title="Loading fund..." icon="progress_activity" />
    const { fund, vouchers, reconciliations, open_variances } = state.data
    const toReview = vouchers.filter(v => v.voucher_type === 'EXPENSE_OUT' && v.status === 'POSTED')
    const pendingFunding = vouchers.filter(v => ['FUND_REQUEST', 'REPLENISHMENT_IN'].includes(v.voucher_type) && v.status === 'PENDING_APPROVAL')
    const share = fund.imprest_limit > 0 ? Math.min(100, (fund.current_book_balance / fund.imprest_limit) * 100) : 0

    async function review(v: Voucher, decision: 'APPROVE' | 'REJECT', reason?: string) {
        const r = await run(() => api.post(`/finance/petty-cash/vouchers/${v.id}/review`, { decision, ...(reason ? { reason } : {}) }),
            decision === 'APPROVE' ? `${v.voucher_no} approved` : `${v.voucher_no} rejected: cash restored and cost reversed`)
        await state.reload()
        return r
    }

    const ledgerCols = [
        { key: 'date', header: 'Date', render: (v: Voucher) => fmtDate(v.voucher_date) },
        { key: 'voucher_no', header: 'Voucher', render: (v: Voucher) => <><div className="strong">{v.voucher_no ?? 'Pending'}</div><div className="muted small">{TYPE_LABEL[v.voucher_type] ?? humanize(v.voucher_type)}</div></> },
        {
            key: 'particulars', header: 'Particulars', render: (v: Voucher) => (
                <div style={{ maxWidth: 320 }}>
                    <div>{v.expense_category ? <strong>{v.expense_category.name}: </strong> : null}{v.description}</div>
                    <div className="muted small">{v.paid_to ? `Paid to ${v.paid_to} · ` : ''}by {v.requested_by_user.full_name}{v.approved_by_user ? ` · approved by ${v.approved_by_user.full_name}` : ''}</div>
                    {v.status === 'REJECTED' && v.rejection_reason ? <div className="small" style={{ color: 'var(--danger)' }}>Rejected: {v.rejection_reason}</div> : null}
                </div>
            ),
        },
        { key: 'in', header: 'Cash in', align: 'right' as const, render: (v: Voucher) => (toNum(v.cash_in_amount) ? inr(v.cash_in_amount) : '—') },
        { key: 'out', header: 'Cash out', align: 'right' as const, render: (v: Voucher) => (toNum(v.cash_out_amount) ? inr(v.cash_out_amount) : '—') },
        { key: 'bal', header: 'Balance after', align: 'right' as const, render: (v: Voucher) => (v.running_balance_after === null ? <span className="muted">—</span> : <span className="strong">{inr(v.running_balance_after)}</span>) },
        { key: 'status', header: 'Status', render: (v: Voucher) => <StatusBadge status={v.status} label={statusLabel(v)} /> },
        { key: 'bill', header: 'Bill', render: (v: Voucher) => (v.bill_photo_url ? <a href={v.bill_photo_url} target="_blank" rel="noreferrer">View photo</a> : v.voucher_type === 'EXPENSE_OUT' ? <span className="muted">None</span> : null) },
    ]

    return (
        <>
            <div style={{ marginBottom: 10 }}><Button icon="arrow_back" onClick={onBack}>All funds</Button></div>
            <PageHeader
                title={`${fund.code ?? fund.site.code} · ${fund.project.project_code}`}
                subtitle={`${fund.project.name}, ${fund.site.city}. Custodian ${fund.custodian}.`}
                actions={
                    <>
                        <Button icon="add_card" onClick={() => setRequesting(true)}>Request funds</Button>
                        <Button icon="receipt_long" onClick={() => setLogging(true)}>Log expense</Button>
                        {canRecon ? <Button variant="primary" icon="fact_check" onClick={() => setReconciling(true)}>Reconcile cash</Button> : null}
                    </>
                }
            />
            <div className="kpi-grid">
                <Kpi label="Book balance" value={inr(fund.current_book_balance)} sub={`of ${inr(fund.imprest_limit)} limit`} tone={fund.below_trigger ? 'warn' : 'good'} />
                <Kpi label="Top-up trigger" value={inr(fund.replenishment_trigger_balance)} sub={fund.below_trigger ? 'balance is below it' : 'balance is above it'} tone={fund.below_trigger ? 'bad' : undefined} />
                <Kpi label="Period locked until" value={fund.locked_until_date ? fmtDate(fund.locked_until_date) : 'Not locked'} sub="earlier dates reject entries" />
                <Kpi label="Last counted" value={fund.last_reconciled_date ? fmtDate(fund.last_reconciled_date) : 'Never'} sub={fund.reconciliation_due ? 'reconciliation is due' : 'up to date'} tone={fund.reconciliation_due ? 'bad' : undefined} />
            </div>
            <div className={`progress ${fund.below_trigger ? 'bad' : 'good'}`} style={{ marginBottom: 16 }} role="img" aria-label={`${pct(share, 0)} of imprest limit`}><div style={{ width: `${share}%` }} /></div>

            {fund.below_trigger ? <Alert tone="warn">The balance is below the {inr(fund.replenishment_trigger_balance)} trigger. A replenishment request is queued automatically; you can also ask for funds yourself.</Alert> : null}
            {fund.reconciliation_due ? <Alert tone="danger">The previous month has not been reconciled. Count the cash and reconcile, then Accounts can lock the month.</Alert> : null}
            {pendingFunding.map(v => (
                <Alert key={v.id} tone="info"><strong>{TYPE_LABEL[v.voucher_type]} of {inr(v.cash_in_amount)} is waiting for approval.</strong> <span className="small">Project Manager and Accounts approve it in the <Link href="/erp/inbox">Approval inbox</Link>; the cash is added to the fund once approved.</span></Alert>
            ))}
            {open_variances.map(v => <Alert key={v.id} tone="warn"><span className="small">Open cash variance: {v.message}. It closes when Accounts locks the period.</span></Alert>)}

            <Card>
                <Tabs<Tab> value={tab} onChange={setTab} tabs={[
                    { id: 'LEDGER', label: 'Voucher ledger', count: vouchers.length },
                    { id: 'REVIEW', label: 'Expenses to review', count: toReview.length },
                    { id: 'RECON', label: 'Reconciliations', count: reconciliations.length },
                ]} />

                {tab === 'LEDGER' ? (
                    <DataTable<Voucher> rows={vouchers} columns={ledgerCols} empty={<Empty title="No vouchers yet" icon="receipt_long">Request the initial float to start the fund.</Empty>} />
                ) : null}

                {tab === 'REVIEW' ? (
                    <>
                        <p className="muted small" style={{ marginTop: 0 }}>Expenses are posted to the project cost when the site logs them. Approving confirms them. Rejecting puts the cash back in the fund and reverses the cost. You cannot review a voucher you raised yourself.</p>
                        <DataTable<Voucher> rows={toReview} empty={<Empty title="Nothing to review" icon="task_alt">All posted expenses have been reviewed.</Empty>}
                            columns={[
                                ...ledgerCols.filter(c => ['date', 'voucher_no', 'particulars', 'out', 'bill'].includes(c.key)),
                                {
                                    key: 'actions', header: '', render: (v: Voucher) => {
                                        if (!canReview) return <span className="muted small">Reviewers only</span>
                                        const own = v.requested_by === user?.id
                                        return own ? <span className="muted small">You raised this: another reviewer must review it</span> : (
                                            <div className="actions">
                                                <Button size="sm" variant="success" disabled={busy} onClick={() => review(v, 'APPROVE')}>Approve</Button>
                                                <Button size="sm" variant="danger" disabled={busy} onClick={() => setRejecting(v)}>Reject</Button>
                                            </div>
                                        )
                                    },
                                },
                            ]} />
                    </>
                ) : null}

                {tab === 'RECON' ? (
                    <DataTable<Recon> rows={reconciliations} empty={<Empty title="No reconciliations yet" icon="fact_check">{canRecon ? 'Use Reconcile cash to count the cash against the book.' : undefined}</Empty>}
                        columns={[
                            { key: 'recon_no', header: 'Reconciliation', render: r => <><div className="strong">{r.recon_no}</div><div className="muted small">{fmtDate(r.period_start)} to {fmtDate(r.period_end)}</div></> },
                            { key: 'opening', header: 'Opening', align: 'right', render: r => inr(r.opening_balance) },
                            { key: 'received', header: '+ Received', align: 'right', render: r => inr(r.cash_received) },
                            { key: 'expenses', header: '- Expenses', align: 'right', render: r => inr(r.expenses) },
                            { key: 'expected', header: 'Expected cash', align: 'right', render: r => inr(r.expected_cash) },
                            { key: 'counted', header: 'Counted', align: 'right', render: r => <span className="strong">{inr(r.physical_cash)}</span> },
                            {
                                key: 'variance', header: 'Variance', align: 'right', render: r => (
                                    <span style={{ color: toNum(r.variance) < 0 ? 'var(--danger)' : toNum(r.variance) > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 700 }}>
                                        {toNum(r.variance) === 0 ? 'Nil' : `${toNum(r.variance) < 0 ? 'Short ' : 'Excess '}${inr(Math.abs(toNum(r.variance)))}`}
                                    </span>
                                ),
                            },
                            { key: 'why', header: 'Explanation', render: r => <div style={{ maxWidth: 240 }} className="small">{r.variance_explanation ?? <span className="muted">Not needed</span>}<div className="muted">by {r.reconciled_by_user.full_name}</div></div> },
                            {
                                key: 'lock', header: 'Period', render: r => r.locked ? <span className="badge success"><Icon name="lock" /> Locked</span> : canLock
                                    ? <Button size="sm" variant="primary" icon="lock" onClick={() => setLocking(r)}>Lock period</Button> : <span className="badge warning">Open</span>,
                            },
                        ]} />
                ) : null}
            </Card>

            {requesting ? <RequestFunds fund={fund} onClose={() => setRequesting(false)} onDone={() => void state.reload()} /> : null}
            {logging ? <LogExpense fund={fund} onClose={() => setLogging(false)} onDone={() => void state.reload()} /> : null}
            {reconciling ? <Reconcile fund={fund} onClose={() => setReconciling(false)} onDone={() => { void state.reload(); setTab('RECON') }} /> : null}
            {locking ? <LockPeriod fundId={fund.id} recon={locking} onClose={() => setLocking(null)} onDone={() => void state.reload()} /> : null}
            <ReasonDialog open={!!rejecting} danger title={`Reject ${rejecting?.voucher_no ?? 'expense'}`} label="Reason for rejecting" confirmLabel="Reject expense" onClose={() => setRejecting(null)}
                onSubmit={async reason => { if (rejecting) { await review(rejecting, 'REJECT', reason); setRejecting(null) } }} />
        </>
    )
}

// ---------------------------------------------------------------------------------------------- request funds
function RequestFunds({ fund, onClose, onDone }: { fund: FundDetail['fund']; onClose: () => void; onDone: () => void }) {
    const { run, busy, error } = useFormAction()
    const [kind, setKind] = useState<'FUND_REQUEST' | 'REPLENISHMENT_IN'>(fund.current_book_balance > 0 ? 'REPLENISHMENT_IN' : 'FUND_REQUEST')
    const [amount, setAmount] = useState<number | ''>(Math.max(0, r2(fund.imprest_limit - fund.current_book_balance)) || '')
    const [note, setNote] = useState('')
    const [done, setDone] = useState<{ over_imprest?: boolean } | null>(null)
    const over = toNum(amount) > 0 && fund.current_book_balance + toNum(amount) > fund.imprest_limit

    async function submit() {
        const r = await run(() => api.post<{ over_imprest?: boolean }>('/finance/petty-cash/vouchers', { voucher_type: kind, fund_id: fund.id, amount: toNum(amount), ...(note.trim() ? { description: note.trim() } : {}) }))
        if (r) { setDone(r); onDone() }
    }
    return (
        <Modal open title="Request funds" onClose={onClose} footer={
            done ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!(toNum(amount) > 0)} onClick={submit}>Send for approval</Button></>
        }>
            {done ? (
                <Alert tone="success"><strong>Request sent for approval.</strong> <span className="small">It now sits in the <Link href="/erp/inbox">Approval inbox</Link> for the Project Manager and Accounts. The cash is added to the fund only when approval is complete.{done.over_imprest ? ' It would take the fund above its imprest limit, which approvers will see.' : ''}</span></Alert>
            ) : (
                <>
                    <Field label="Type"><Select value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
                        <option value="FUND_REQUEST">Initial float / fund request</option>
                        <option value="REPLENISHMENT_IN">Replenishment (top-up)</option>
                    </Select></Field>
                    <Field label="Amount needed" hint={`Balance ${inr(fund.current_book_balance)}, imprest limit ${inr(fund.imprest_limit)}. Prefilled to top up to the limit.`}><NumberInput value={amount} onChange={setAmount} min={0} step="1" /></Field>
                    <Field label="Note for approvers" hint="Optional"><Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} /></Field>
                    {over ? <Alert tone="warn">This would take the fund to {inr(fund.current_book_balance + toNum(amount))}, above the {inr(fund.imprest_limit)} imprest limit.</Alert> : null}
                    <p className="muted small">Funding requests are approved by the Project Manager and Accounts through the Approval inbox. Only one request can be open per site at a time.</p>
                    {error ? <Alert tone="danger">{error}</Alert> : null}
                </>
            )}
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- log expense on behalf of the site
function LogExpense({ fund, onClose, onDone }: { fund: FundDetail['fund']; onClose: () => void; onDone: () => void }) {
    const { run, busy, error } = useFormAction()
    const toast = useToast()
    const cats = useApi<{ items: Category[] }>('/finance/expense-categories')
    const minDate = dayAfter(fund.locked_until_date)
    const [catId, setCatId] = useState('')
    const [amount, setAmount] = useState<number | ''>('')
    const [desc, setDesc] = useState('')
    const [paidTo, setPaidTo] = useState('')
    const [date, setDate] = useState(() => (minDate && minDate > isoDate() ? minDate : isoDate()))
    const [photo, setPhoto] = useState<string | null>(null)
    const [done, setDone] = useState<{ voucher_no: string; running_balance_after: number; below_trigger: boolean; auto_replenishment: { amount: number } | null } | null>(null)

    const cat = cats.data?.items.find(c => c.id === catId)
    const amt = toNum(amount)
    const after = r2(fund.current_book_balance - amt)
    const billNeeded = !!cat && amt >= toNum(cat.bill_photo_threshold) && amt > 0
    const overCap = !!cat && amt > toNum(cat.max_single_voucher_limit)
    const locked = !!fund.locked_until_date && date !== '' && date <= isoDate(new Date(fund.locked_until_date))
    const valid = !!cat && amt > 0 && desc.trim() !== '' && !!date

    async function submit() {
        const r = await run(() => api.post<NonNullable<typeof done>>('/finance/petty-cash/vouchers', {
            voucher_type: 'EXPENSE_OUT', fund_id: fund.id, expense_category_id: catId, amount: amt, description: desc.trim(), voucher_date: date,
            ...(paidTo.trim() ? { paid_to: paidTo.trim() } : {}), ...(photo ? { bill_photo_url: photo } : {}),
        }))
        if (r) { setDone(r); onDone(); toast.success(`${r.voucher_no} posted`) }
    }

    return (
        <Modal open title={`Log expense for ${fund.site.code}`} onClose={onClose} footer={
            done ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>Post expense</Button></>
        }>
            {done ? (
                <>
                    <Alert tone="success"><strong>{done.voucher_no} posted.</strong> <span className="small">Balance is now {inr(done.running_balance_after)}. A Project Manager or Accounts reviewer other than you must approve it.</span></Alert>
                    {done.below_trigger ? <Alert tone="warn"><span className="small">The balance fell below the top-up trigger{done.auto_replenishment ? `, so a replenishment request of ${inr(done.auto_replenishment.amount)} was queued for approval` : ''}.</span></Alert> : null}
                </>
            ) : (
                <>
                    <p className="muted small" style={{ marginTop: 0 }}>You are logging this on behalf of the site. The cash leaves the fund at once and you will not be able to review it yourself.</p>
                    <div className="form-grid">
                        <Field label="Category" className="full" hint={cat ? `Bill photo required from ${inr(cat.bill_photo_threshold)}. Cap per voucher ${inr(cat.max_single_voucher_limit)}.` : undefined}>
                            <Select value={catId} onChange={e => setCatId(e.target.value)} disabled={cats.loading}>
                                <option value="">{cats.loading ? 'Loading...' : 'Select category...'}</option>
                                {cats.data?.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                        </Field>
                        <Field label="Amount" hint={amt > 0 ? `Balance after: ${inr(after)}` : `Balance now ${inr(fund.current_book_balance)}`}><NumberInput value={amount} onChange={setAmount} min={0} step="1" /></Field>
                        <Field label="Voucher date" hint={fund.locked_until_date ? `Dates up to ${fmtDate(fund.locked_until_date)} are locked` : undefined}><Input type="date" value={date} min={minDate || undefined} onChange={e => setDate(e.target.value)} /></Field>
                        <Field label="What was it for" className="full"><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></Field>
                        <Field label="Paid to" className="full"><Input value={paidTo} onChange={e => setPaidTo(e.target.value)} maxLength={150} /></Field>
                        <Field label={billNeeded ? 'Bill photo (required)' : 'Bill photo'} className="full" error={billNeeded && !photo ? `A bill photo is required for ${cat?.name} expenses of ${inr(cat?.bill_photo_threshold)} or more` : undefined}>
                            <FileField value={photo} onChange={setPhoto} folder="petty-cash" accept="image/*" />
                        </Field>
                    </div>
                    {amt > fund.current_book_balance ? <Alert tone="warn">Not enough cash: the fund holds {inr(fund.current_book_balance)}. The API will refuse it; request a replenishment first.</Alert> : null}
                    {overCap ? <Alert tone="warn">{cat?.name} is capped at {inr(cat?.max_single_voucher_limit)} per voucher. Raise a direct expense or split the voucher.</Alert> : null}
                    {locked ? <Alert tone="warn">This date falls in a locked period. The API will refuse it.</Alert> : null}
                    {error ? <Alert tone="danger">{error}</Alert> : null}
                </>
            )}
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- reconcile
function Reconcile({ fund, onClose, onDone }: { fund: FundDetail['fund']; onClose: () => void; onDone: () => void }) {
    const { run, busy, error } = useFormAction()
    const firstDay = () => { const t = new Date(); return isoDate(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))) }
    const defStart = fund.locked_until_date ? dayAfter(fund.locked_until_date) : firstDay()
    const [start, setStart] = useState(defStart)
    const [end, setEnd] = useState(isoDate() < defStart ? defStart : isoDate())
    const [counted, setCounted] = useState<number | ''>('')
    const [why, setWhy] = useState('')
    const [done, setDone] = useState<{ recon_no: string; variance: number } | null>(null)

    const validDates = !!start && !!end && start <= end
    const preview = useApi<Preview>(validDates ? `/finance/petty-cash/${fund.id}/reconcile${qs({ period_start: start, period_end: end })}` : null)
    const p = validDates ? preview.data : null
    const expected = toNum(p?.expected)
    const variance = typeof counted === 'number' && p ? r2(counted - expected) : 0
    const needsWhy = variance !== 0
    const locked = !!fund.locked_until_date && !!end && end <= isoDate(new Date(fund.locked_until_date))
    const valid = validDates && !!p && typeof counted === 'number' && counted >= 0 && !(needsWhy && !why.trim())

    async function submit() {
        const r = await run(() => api.post<{ recon_no: string; variance: number }>(`/finance/petty-cash/${fund.id}/reconcile`, {
            period_start: start, period_end: end, physical_cash: counted, ...(why.trim() ? { variance_explanation: why.trim() } : {}),
        }))
        if (r) { setDone(r); onDone() }
    }

    return (
        <Modal open title={`Reconcile cash: ${fund.code ?? fund.site.code}`} onClose={onClose} footer={
            done ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>Submit reconciliation</Button></>
        }>
            {done ? (
                <Alert tone={toNum(done.variance) === 0 ? 'success' : 'warn'}>
                    <strong>{done.recon_no} recorded.</strong>
                    <div className="small">{toNum(done.variance) === 0 ? 'The cash matches the book.' : `${toNum(done.variance) < 0 ? 'Short' : 'Excess'} by ${inr(Math.abs(toNum(done.variance)))}: an adjustment was posted and a cash variance exception raised.`} Accounts can now lock this period.</div>
                </Alert>
            ) : (
                <>
                    <div className="form-grid">
                        <Field label="Period start" hint={fund.locked_until_date ? `Locked until ${fmtDate(fund.locked_until_date)}` : undefined}><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
                        <Field label="Period end"><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field>
                    </div>
                    {!validDates ? <Alert tone="warn">The period start must be on or before the end.</Alert> : preview.error && !p ? <Alert tone="danger">{preview.error}</Alert> : !p ? <Empty title="Calculating..." icon="progress_activity" /> : (
                        <MathTable>
                            <MathRow label="Opening balance" value={inr(p.opening)} note="Cash in minus cash out before the period" />
                            <MathRow label="Cash received in period" value={inr(p.received)} sign="+" />
                            <MathRow label="Expenses in period" value={inr(p.expenses)} sign="-" />
                            <MathRow label="Expected cash in the box" value={inr(p.expected)} sign="=" strong />
                        </MathTable>
                    )}
                    <div style={{ marginTop: 14 }}>
                        <Field label="Cash counted (physical)" hint="Count the notes and coins at site, then enter the total."><NumberInput value={counted} onChange={setCounted} min={0} step="1" /></Field>
                    </div>
                    {typeof counted === 'number' && p ? (
                        variance === 0 ? <Alert tone="success">The counted cash matches the book. No explanation is needed.</Alert>
                            : <Alert tone="warn"><strong>{variance < 0 ? 'Short' : 'Excess'} by {inr(Math.abs(variance))}.</strong> <span className="small">An explanation is mandatory. {variance < 0 ? 'The shortage is booked as a site cost.' : 'The surplus is booked as recovered cost.'} Either way the book is corrected to the counted cash.</span></Alert>
                    ) : null}
                    {needsWhy ? <Field label="Variance explanation" error={!why.trim() ? 'Explain the difference before submitting' : undefined}><Textarea value={why} onChange={e => setWhy(e.target.value)} rows={2} /></Field> : null}
                    {locked ? <Alert tone="warn">This period ends inside a locked period. The API will refuse it.</Alert> : null}
                    {error ? <Alert tone="danger">{error}</Alert> : null}
                </>
            )}
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- lock period
function LockPeriod({ fundId, recon, onClose, onDone }: { fundId: string; recon: Recon; onClose: () => void; onDone: () => void }) {
    const { run, busy, error } = useFormAction()
    const toast = useToast()
    async function confirm() {
        const r = await run(() => api.post<{ locked_until_date: string }>(`/finance/petty-cash/${fundId}/lock-period`, { recon_id: recon.id }))
        if (r) { toast.success(`Period locked until ${fmtDate(r.locked_until_date)}`); onDone(); onClose() }
    }
    return (
        <Modal open title={`Lock period to ${fmtDate(recon.period_end)}`} onClose={onClose} footer={
            <><Button onClick={onClose}>Cancel</Button><Button variant="danger-solid" icon="lock" loading={busy} onClick={confirm}>Lock period</Button></>
        }>
            <Alert tone="warn">
                <strong>Locked dates reject new or changed entries.</strong>
                <div className="small">Once locked, no expense, funding or reconciliation dated on or before {fmtDate(recon.period_end)} can be added, and expenses in that period can no longer be rejected. This screen has no way to unlock it.</div>
            </Alert>
            <div className="grid cols-2" style={{ marginBottom: 8 }}>
                <KV label="Reconciliation">{recon.recon_no}</KV>
                <KV label="Variance">{toNum(recon.variance) === 0 ? 'Nil' : inr(recon.variance)}</KV>
                <KV label="Counted cash">{inr(recon.physical_cash)}</KV>
                <KV label="Expected cash">{inr(recon.expected_cash)}</KV>
            </div>
            {recon.variance_explanation ? <p className="small">Explanation on file: {recon.variance_explanation}</p> : null}
            {error ? <Alert tone="danger">{error}</Alert> : null}
        </Modal>
    )
}
