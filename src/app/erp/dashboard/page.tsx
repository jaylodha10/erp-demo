'use client'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { humanize, inr, inrCompact, pct, toNum } from '@/lib/format'
import { Alert, Async, Card, DataTable, Empty, Field, Icon, Kpi, PageHeader, Select, StatusBadge, Tabs, type Column } from '@/components/ui'

// ------------------------------------------------------------------------------------------------ types
interface CeoSummary {
    sales_pipeline: { open_enquiries: number; value: number; by_status: { status: string; count: number; value: number }[] }
    order_book: { total_contract_value: number; unbilled_balance: number }
    active_projects: number
    projects_at_risk: { project_id: string; project_code: string; name: string; reasons: string[]; projected_margin_pct: number; schedule_status: string }[]
    receivables: number
    payables: { total: number; vendors: number; subcontractors: number; on_hold_mismatch: number }
    projected_profit: { value: number; on_contract_value: number }
    open_exceptions: number
    pending_approvals: number
    projects: CeoProject[]
}
interface CeoProject {
    project_id: string; project_code: string; name: string; client: string; total_contract: number; actual_total: number; eac: number
    projected_profit: number; projected_margin_pct: number; physical_progress_pct: number; schedule_status: string; at_risk: boolean
}
type Buckets = { MATERIAL_CONSUMED: number; SITE_LABOUR: number; SUBCONTRACTOR_BILL: number; PETTY_CASH: number; DIRECT_EXPENSE: number }
interface ProfitRow {
    project_id: string; project_code: string; name: string; client: string; city: string | null; status: string; current_stage: string
    physical_progress_pct: number; schedule_status: string; contract_value: number; approved_variation_value: number; total_contract: number
    baseline_estimated_cost: number; revised_estimated_cost: number; po_committed: number; open_commitment: number; pending_po_value: number
    site_stock_value: number; actual: Buckets; actual_total: number; eac: number; projected_profit: number; projected_margin_pct: number
    billed: number; collected: number; outstanding: number; risk_reasons: string[]; at_risk: boolean
}

const CEO_ROLES = ['DIRECTOR', 'PROJECT_HEAD', 'ADMIN']
const PROJECT_ROLES = ['DIRECTOR', 'PROJECT_HEAD', 'PROJECT_MANAGER', 'COMMERCIAL', 'ACCOUNTS']

/** Cost bucket colours: categorical slots 1 to 5 of the validated reference palette, in fixed order. */
const BUCKETS: { key: keyof Buckets; label: string; color: string }[] = [
    { key: 'MATERIAL_CONSUMED', label: 'Material consumed', color: '#2a78d6' },
    { key: 'SITE_LABOUR', label: 'Site labour', color: '#eb6834' },
    { key: 'SUBCONTRACTOR_BILL', label: 'Subcontractor', color: '#1baf7a' },
    { key: 'PETTY_CASH', label: 'Petty cash', color: '#eda100' },
    { key: 'DIRECT_EXPENSE', label: 'Direct expense', color: '#e87ba4' },
]
const NEUTRAL = '#94a3b8'
const INK = '#334155'

const marginTone = (m: number): 'good' | 'warn' | 'bad' => (m < 10 ? 'bad' : m < 20 ? 'warn' : 'good')

// ------------------------------------------------------------------------------------------------ page
export default function DashboardPage() {
    const { can } = useSession()
    const canCeo = can(...CEO_ROLES)
    const canProject = can(...PROJECT_ROLES)
    const [tab, setTab] = useState<'company' | 'project' | null>(null)
    const [projectId, setProjectId] = useState('')
    const view = tab ?? (canCeo ? 'company' : 'project')

    const ceo = useApi<CeoSummary>(canCeo ? '/dashboards/ceo-summary' : null)
    const prof = useApi<{ items: ProfitRow[] }>(canProject ? '/dashboards/project-profitability' : null)

    if (!canCeo && !canProject) {
        return (
            <>
                <PageHeader title="Dashboard" />
                <Alert tone="info">Your role does not include the profitability dashboards.</Alert>
            </>
        )
    }

    function openProject(id: string) { setProjectId(id); setTab('project') }

    return (
        <>
            <PageHeader
                title={view === 'company' ? 'Company profitability and project risk' : 'Project profitability'}
                subtitle={view === 'company'
                    ? 'Where the order book stands, which projects are at risk, and what money is expected to be made.'
                    : 'Contract value against estimated, committed, actual and projected final cost for one project.'}
            />
            {canCeo && canProject ? (
                <Tabs value={view} onChange={t => setTab(t)} tabs={[{ id: 'company', label: 'Company view' }, { id: 'project', label: 'Project view' }]} />
            ) : null}
            {view === 'company' ? <Async state={ceo}>{d => <CompanyView d={d} onOpen={canProject ? openProject : undefined} />}</Async> : null}
            {view === 'project' ? <Async state={prof}>{d => <ProjectView items={d.items} projectId={projectId} onChange={setProjectId} />}</Async> : null}
        </>
    )
}

// ------------------------------------------------------------------------------------------------ company view
function CompanyView({ d, onOpen }: { d: CeoSummary; onOpen?: (id: string) => void }) {
    const margin = d.projected_profit.on_contract_value > 0 ? (d.projected_profit.value / d.projected_profit.on_contract_value) * 100 : 0
    const risk = d.projects_at_risk
    const cols: Column<CeoProject>[] = [
        { key: 'project', header: 'Project', render: p => <div style={{ minWidth: 190 }}><Link href={`/erp/projects/${p.project_id}`} className="strong" style={{ whiteSpace: 'nowrap' }}>{p.project_code}</Link><div className="small muted">{p.name}</div></div> },
        { key: 'client', header: 'Client', render: p => <div style={{ minWidth: 130 }}>{p.client}</div> },
        { key: 'contract', header: 'Contract', align: 'right', render: p => inr(p.total_contract) },
        { key: 'actual', header: 'Actual cost', align: 'right', render: p => inr(p.actual_total) },
        { key: 'eac', header: 'Projected cost', align: 'right', render: p => <span style={{ color: p.eac > p.total_contract ? 'var(--danger)' : undefined }}>{inr(p.eac)}</span> },
        { key: 'profit', header: 'Projected profit', align: 'right', render: p => <span className="strong" style={{ color: p.projected_profit < 0 ? 'var(--danger)' : undefined }}>{inr(p.projected_profit)}</span> },
        { key: 'margin', header: 'Margin', align: 'right', render: p => <span className={`badge ${p.projected_margin_pct < 10 ? 'danger' : p.projected_margin_pct < 20 ? 'warning' : 'success'}`}>{pct(p.projected_margin_pct)}</span> },
        { key: 'progress', header: 'Progress', render: p => <div style={{ minWidth: 90 }}><div className="small mono">{pct(p.physical_progress_pct, 0)}</div><div className="progress"><div style={{ width: `${Math.min(100, toNum(p.physical_progress_pct))}%` }} /></div></div> },
        { key: 'schedule', header: 'Schedule', render: p => <div className="row" style={{ gap: 6 }}><StatusBadge status={p.schedule_status} />{p.at_risk ? <span className="badge danger"><Icon name="warning" />At risk</span> : null}</div> },
        ...(onOpen ? [{ key: 'open', header: '', render: (p: CeoProject) => <button className="btn btn-sm" onClick={() => onOpen(p.project_id)}>Cost detail</button> }] : []),
    ]
    const totals = d.projects.reduce((s, p) => ({ contract: s.contract + p.total_contract, actual: s.actual + p.actual_total, eac: s.eac + p.eac, profit: s.profit + p.projected_profit }), { contract: 0, actual: 0, eac: 0, profit: 0 })

    return (
        <>
            <div className="kpi-grid">
                <Kpi label="Sales pipeline" value={inrCompact(d.sales_pipeline.value)} sub={`${d.sales_pipeline.open_enquiries} open enquiries`} />
                <Kpi label="Order book" value={inrCompact(d.order_book.total_contract_value)} sub={`${inrCompact(d.order_book.unbilled_balance)} not yet billed`} />
                <Kpi label="Active projects" value={d.active_projects} />
                <Kpi label="Projects at risk" value={risk.length} sub={risk.length ? 'see reasons below' : 'none flagged'} tone={risk.length ? 'bad' : 'good'} />
                <Kpi label="Receivables" value={inrCompact(d.receivables)} sub="client invoices unpaid" />
                <Kpi label="Payables" value={inrCompact(d.payables.total)} sub={`vendors ${inrCompact(d.payables.vendors)} · subcontractors ${inrCompact(d.payables.subcontractors)}${d.payables.on_hold_mismatch > 0 ? ` · ${inrCompact(d.payables.on_hold_mismatch)} on hold` : ''}`} tone={d.payables.on_hold_mismatch > 0 ? 'warn' : undefined} />
                <Kpi label="Projected profit" value={inrCompact(d.projected_profit.value)} sub={`${pct(margin)} on ${inrCompact(d.projected_profit.on_contract_value)} contract value`} tone={d.projected_profit.on_contract_value ? marginTone(margin) : undefined} />
            </div>

            <div className="grid cols-2">
                <Card title="Projects at risk" sub="Delayed schedule, projected cost above budget, or margin under 10%">
                    {!risk.length ? <Empty title="No project is at risk" icon="verified" /> : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                            {risk.map(p => (
                                <li key={p.project_id} style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 10, padding: 10 }}>
                                    <div className="row" style={{ justifyContent: 'space-between' }}>
                                        <Link href={`/erp/projects/${p.project_id}`} className="strong">{p.project_code} · {p.name}</Link>
                                        <div className="row" style={{ gap: 6 }}><StatusBadge status={p.schedule_status} /><span className="badge danger">Margin {pct(p.projected_margin_pct)}</span></div>
                                    </div>
                                    <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{p.reasons.map(r => <li key={r}>{r}</li>)}</ul>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
                <div>
                    <Card title="Needs attention">
                        <div className="grid cols-2">
                            <Link href="/erp/exceptions" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div className="label">Open exceptions</div>
                                <div className="value" style={{ color: d.open_exceptions ? 'var(--danger)' : undefined }}>{d.open_exceptions}</div>
                                <div className="sub">Review exceptions <Icon name="arrow_forward" /></div>
                            </Link>
                            <Link href="/erp/inbox" className="kpi" style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div className="label">Pending approvals</div>
                                <div className="value" style={{ color: d.pending_approvals ? 'var(--warning)' : undefined }}>{d.pending_approvals}</div>
                                <div className="sub">Open approval inbox <Icon name="arrow_forward" /></div>
                            </Link>
                        </div>
                    </Card>
                    <Card title="Sales pipeline by stage" sub="Open enquiries, by expected value">
                        <Pipeline rows={d.sales_pipeline.by_status} />
                    </Card>
                </div>
            </div>

            <Card title="Contract value against projected cost" sub="Active projects. The table below has the same numbers.">
                {!d.projects.length ? <Empty title="No active projects yet" icon="apartment" /> : <ContractVsCost rows={d.projects} />}
            </Card>

            <Card title="Profitability by project">
                <DataTable
                    columns={cols}
                    rows={d.projects}
                    rowKey={p => p.project_id}
                    empty={<Empty title="No active projects yet" icon="apartment" />}
                    footer={d.projects.length ? (
                        <tr>
                            <td>Total</td><td />
                            <td className="num">{inr(totals.contract)}</td><td className="num">{inr(totals.actual)}</td><td className="num">{inr(totals.eac)}</td>
                            <td className="num">{inr(totals.profit)}</td><td className="num">{totals.contract ? pct((totals.profit / totals.contract) * 100) : '—'}</td>
                            <td /><td />{onOpen ? <td /> : null}
                        </tr>
                    ) : undefined}
                />
            </Card>
        </>
    )
}

function Pipeline({ rows }: { rows: { status: string; count: number; value: number }[] }) {
    if (!rows.length) return <Empty title="No open enquiries" icon="request_quote" />
    const max = Math.max(...rows.map(r => r.value), 1)
    return (
        <div style={{ display: 'grid', gap: 8 }}>
            {rows.map(r => (
                <div key={r.status} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 140px) 1fr auto', gap: 10, alignItems: 'center' }}>
                    <span className="small">{humanize(r.status)} <span className="muted">({r.count})</span></span>
                    <div style={{ height: 12, background: '#f1f5f9', borderRadius: 4 }}><div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: '#2a78d6', borderRadius: '0 4px 4px 0' }} /></div>
                    <span className="small mono">{inrCompact(r.value)}</span>
                </div>
            ))}
        </div>
    )
}

/** Paired bars per project: contract value and projected final cost. Text alternative is the table under it. */
function ContractVsCost({ rows }: { rows: CeoProject[] }) {
    const max = Math.max(...rows.flatMap(r => [r.total_contract, r.eac]), 1)
    return (
        <div role="img" aria-label={`Contract value and projected cost for ${rows.length} active projects. The table below lists the figures.`}>
            <div className="row small" style={{ gap: 14, marginBottom: 10 }}>
                <Legend color="#2a78d6" label="Contract incl. variations" /><Legend color={NEUTRAL} label="Projected final cost" /><Legend color="#e34948" label="Projected cost above contract" />
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
                {rows.map(r => (
                    <div key={r.project_id} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 120px) 1fr', gap: 10, alignItems: 'center' }}>
                        <span className="small strong">{r.project_code}</span>
                        <div style={{ display: 'grid', gap: 4 }}>
                            <BarLine value={r.total_contract} max={max} color="#2a78d6" />
                            <BarLine value={r.eac} max={max} color={r.eac > r.total_contract ? '#e34948' : NEUTRAL} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function BarLine({ value, max, color }: { value: number; max: number; color: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 12, minWidth: 0 }}><div title={inr(value)} style={{ width: `${Math.max(0.5, (value / max) * 100)}%`, height: '100%', background: color, borderRadius: '0 4px 4px 0' }} /></div>
            <span className="small mono" style={{ minWidth: 70, textAlign: 'right', color: INK }}>{inrCompact(value)}</span>
        </div>
    )
}

function Legend({ color, label }: { color: string; label: string }) {
    return <span className="row" style={{ gap: 6 }}><span aria-hidden="true" style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block' }} />{label}</span>
}

// ------------------------------------------------------------------------------------------------ project view
function ProjectView({ items, projectId, onChange }: { items: ProfitRow[]; projectId: string; onChange: (id: string) => void }) {
    if (!items.length) return <Card><Empty title="No projects to show" icon="apartment">Projects you are assigned to appear here once they are set up.</Empty></Card>
    const p = items.find(i => i.project_id === projectId) ?? items.find(i => i.status === 'ACTIVE') ?? items[0]
    const buckets = BUCKETS.map(b => ({ ...b, value: toNum(p.actual[b.key]) }))
    const spendPct = p.eac > 0 ? (p.actual_total / p.eac) * 100 : 0
    const progress = toNum(p.physical_progress_pct)
    const ahead = spendPct - progress > 15

    const bars: { label: string; value: number; kind?: 'stack' | 'eac'; note?: string }[] = [
        { label: 'Contract incl. variations', value: p.total_contract, note: `${inr(p.contract_value)} + ${inr(p.approved_variation_value)} variations` },
        { label: 'Baseline estimated cost', value: p.baseline_estimated_cost },
        { label: 'Actual cost to date', value: p.actual_total, kind: 'stack' },
        { label: 'Committed POs', value: p.po_committed, note: `${inr(p.open_commitment)} still to be received` },
        { label: 'Stock on site', value: p.site_stock_value, note: 'an asset until consumed' },
        { label: 'Projected final cost (EAC)', value: p.eac, kind: 'eac' },
    ]
    const max = Math.max(...bars.map(b => b.value), 1)

    return (
        <>
            <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <Field label="Project">
                    <Select value={p.project_id} onChange={e => onChange(e.target.value)} style={{ minWidth: 280 }}>
                        {items.map(i => <option key={i.project_id} value={i.project_id}>{i.project_code} · {i.name}{i.status !== 'ACTIVE' ? ` (${humanize(i.status)})` : ''}</option>)}
                    </Select>
                </Field>
                <div className="row" style={{ marginBottom: 12 }}>
                    <StatusBadge status={p.schedule_status} /><span className="badge">{p.current_stage}</span>
                    <Link href={`/erp/projects/${p.project_id}`} className="btn btn-sm"><Icon name="open_in_new" />Open workspace</Link>
                </div>
            </div>

            {p.risk_reasons.length ? <Alert tone="warn"><div className="strong">At risk</div><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{p.risk_reasons.map(r => <li key={r}>{r}</li>)}</ul></Alert> : null}

            <div className="kpi-grid">
                <Kpi label="Contract incl. variations" value={inrCompact(p.total_contract)} sub={`${p.client}${p.city ? ` · ${p.city}` : ''}`} />
                <Kpi label="Estimated cost" value={inrCompact(p.revised_estimated_cost)} sub={`baseline ${inrCompact(p.baseline_estimated_cost)}`} />
                <Kpi label="Actual cost to date" value={inrCompact(p.actual_total)} sub={`${pct(spendPct, 0)} of projected cost`} />
                <Kpi label="Projected final cost" value={inrCompact(p.eac)} tone={p.eac > p.total_contract ? 'bad' : undefined} sub={p.eac > p.revised_estimated_cost + 0.5 ? 'above approved budget' : 'within approved budget'} />
                <Kpi label="Projected profit" value={inrCompact(p.projected_profit)} tone={p.total_contract ? marginTone(p.projected_margin_pct) : undefined} sub={`${pct(p.projected_margin_pct)} margin`} />
                <Kpi label="Physical progress" value={pct(progress, 0)} sub={`${humanize(p.schedule_status)} schedule`} />
            </div>

            <Card title="Where the money stands" sub="Each bar is on the same scale. Actual cost is split by where it was booked.">
                <div role="img" aria-label={`Cost position for ${p.project_code}: contract ${inr(p.total_contract)}, baseline estimate ${inr(p.baseline_estimated_cost)}, actual cost ${inr(p.actual_total)}, committed POs ${inr(p.po_committed)}, stock on site ${inr(p.site_stock_value)}, projected final cost ${inr(p.eac)}. The table below lists the figures.`}>
                    <div style={{ display: 'grid', gap: 14 }}>
                        {bars.map(b => (
                            <div key={b.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 200px) 1fr minmax(76px, auto)', gap: 10, alignItems: 'center' }}>
                                <div><div className="small strong">{b.label}</div>{b.note ? <div className="small muted">{b.note}</div> : null}</div>
                                <div style={{ height: 22, display: 'flex', gap: 2, minWidth: 0 }}>
                                    {b.kind === 'stack' ? buckets.filter(s => s.value > 0).map(s => (
                                        <div key={s.key} title={`${s.label}: ${inr(s.value)}`} style={{ width: `${(s.value / max) * 100}%`, background: s.color, borderRadius: 3, minWidth: 2 }} />
                                    )) : <div title={inr(b.value)} style={{ width: `${(b.value / max) * 100}%`, minWidth: b.value > 0 ? 2 : 0, background: b.kind === 'eac' ? (p.eac > p.total_contract ? '#e34948' : '#334155') : NEUTRAL, borderRadius: '0 4px 4px 0' }} />}
                                </div>
                                <span className="mono strong" style={{ textAlign: 'right' }}>{inrCompact(b.value)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="row small" style={{ gap: 14, marginTop: 14 }}>
                        <span className="muted">Actual cost by bucket:</span>
                        {BUCKETS.map(b => <Legend key={b.key} color={b.color} label={b.label} />)}
                    </div>
                </div>
            </Card>

            <div className="grid cols-2">
                <Card title="Figures" sub="The numbers behind the chart">
                    <div className="table-wrap">
                        <table className="table">
                            <caption className="muted small" style={{ textAlign: 'left', padding: '0 0 6px', captionSide: 'top' }}>{p.project_code} cost position, in rupees</caption>
                            <thead><tr><th>Measure</th><th className="num">Amount</th></tr></thead>
                            <tbody>
                                <Row label="Contract value" value={p.contract_value} />
                                <Row label="Approved variations" value={p.approved_variation_value} />
                                <Row label="Contract incl. variations" value={p.total_contract} bold />
                                <Row label="Baseline estimated cost" value={p.baseline_estimated_cost} />
                                <Row label="Revised estimated cost" value={p.revised_estimated_cost} />
                                {BUCKETS.map(b => <Row key={b.key} label={`Actual: ${b.label}`} value={p.actual[b.key]} indent />)}
                                <Row label="Actual cost to date" value={p.actual_total} bold />
                                <Row label="Committed POs (approved, incl. received)" value={p.po_committed} />
                                <Row label="Open commitment (not yet received)" value={p.open_commitment} indent />
                                <Row label="POs awaiting approval" value={p.pending_po_value} indent />
                                <Row label="Stock on site" value={p.site_stock_value} />
                                <Row label="Projected final cost (EAC)" value={p.eac} bold />
                                <Row label="Projected profit" value={p.projected_profit} bold />
                            </tbody>
                        </table>
                    </div>
                    <p className="small muted" style={{ marginBottom: 0 }}>
                        EAC is worked out per cost centre as the larger of the BOQ budget and (actual cost + stock on site + open PO commitments), then added up. Projected profit is contract incl. variations minus EAC.
                    </p>
                </Card>
                <div>
                    <Card title="Spend against progress" sub="Cost used as a share of projected cost, next to work completed">
                        <Meter label="Physical progress" value={progress} />
                        <Meter label="Cost used (actual / projected cost)" value={spendPct} warn={ahead} />
                        {ahead ? <Alert tone="warn">Spend is running well ahead of the work completed. Check the BOQ progress against actuals in the project workspace.</Alert> : null}
                    </Card>
                    <Card title="Billing" sub="Taxable value of client invoices">
                        <table className="table"><tbody>
                            <tr><td>Billed</td><td className="num strong">{inr(p.billed)}</td></tr>
                            <tr><td>Collected</td><td className="num strong">{inr(p.collected)}</td></tr>
                            <tr><td>Outstanding</td><td className="num strong" style={{ color: p.outstanding > 0 ? 'var(--warning)' : undefined }}>{inr(p.outstanding)}</td></tr>
                        </tbody></table>
                        <div style={{ height: 10 }} />
                        <Meter label="Billed against contract" value={p.total_contract > 0 ? (p.billed / p.total_contract) * 100 : 0} />
                    </Card>
                </div>
            </div>
        </>
    )
}

function Row({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }): ReactNode {
    return (
        <tr>
            <td style={{ paddingLeft: indent ? 28 : undefined, fontWeight: bold ? 700 : undefined }}>{label}</td>
            <td className="num" style={{ fontWeight: bold ? 700 : undefined, color: toNum(value) < 0 ? 'var(--danger)' : undefined }}>{inr(value)}</td>
        </tr>
    )
}

function Meter({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
    const v = Math.max(0, Math.min(100, toNum(value)))
    return (
        <div style={{ marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="small">{label}</span><span className="small strong mono">{pct(value, 0)}</span></div>
            <div className={`progress ${warn ? 'bad' : ''}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${v}%` }} /></div>
        </div>
    )
}
