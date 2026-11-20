'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, fmtDateTime, humanize, inr, inrCompact, pct, qty, toNum } from '@/lib/format'
import { Alert, Async, Button, Card, DataTable, Empty, Field, Icon, Kpi, ReasonDialog, Select, StatusBadge, Tabs, useAction, type Column } from '@/components/ui'
import { ageLabel, currentGate, MarginBadge, VariationDetail, type VariationRow } from '@/app/erp/variations/VariationDetail'

// ------------------------------------------------------------------------------------------------ types
type Buckets = { MATERIAL_CONSUMED: number; SITE_LABOUR: number; SUBCONTRACTOR_BILL: number; PETTY_CASH: number; DIRECT_EXPENSE: number }
interface Metrics {
    contract_value: number; approved_variation_value: number; total_contract: number; baseline_cost: number; revised_cost: number
    actual_by_bucket: Buckets; actual_total: number; po_committed: number; open_commitment: number; pending_po_value: number
    site_stock_value: number; eac: number; projected_profit: number; projected_margin_pct: number; over_budget: boolean
}
interface FundLite { code: string | null; imprest_limit: number; current_book_balance: number; replenishment_trigger_balance: number }
interface SiteLite {
    id: string; code: string; name: string; city: string; full_address: string
    site_supervisor: { full_name: string; phone: string } | null; storekeeper: { full_name: string } | null
    warehouses: { code: string; name: string } | { code: string; name: string }[] | null
    petty_cash_funds: FundLite | FundLite[] | null
}
interface Project {
    id: string; project_code: string; name: string; status: string; current_stage: string; schedule_status: string; physical_progress_pct: number
    start_date: string; target_completion_date: string; carpet_area_sqft: number | null
    client: { legal_name: string }; project_type: { name: string } | null
    pm_user: { full_name: string; phone: string } | null; project_head: { full_name: string } | null
    sites: SiteLite[]
    user_site_assignments: { assignment_role: string; user: { id: string; full_name: string; phone: string } }[]
    work_order: { wo_no: string } | null; enquiry: { enquiry_no: string } | null
    metrics: Metrics
    billing: { billed_taxable: number; billed_total: number; collected: number; outstanding: number; retention_held: number }
    stages: string[]
}
interface DprItem {
    id: string; completed_qty: number; zone: string | null; remarks: string | null; photo_url: string | null; progress_delta_pct: number; created_at: string
    boq_line: { code: string; description: string; uom: { code: string } }; created_by_user: { full_name: string }; dpr: { report_date: string }
}
interface LabourDay { date: string; total_amount: number; workers: number; lines: { headcount: number; trade: { name: string } }[] }
interface Photo { id: string; stage: string | null; caption: string | null; photo_url: string; taken_at: string; uploaded_by_user: { full_name: string } }
interface Issue {
    id: string; issue_no: string; category: string; severity: string; description: string; photo_url: string | null; status: string
    created_at: string; resolved_at: string | null; resolution_note: string | null; raised_by_user: { full_name: string }
}
interface BoqProgress { id: string; code: string; description: string; uom: string; cost_centre: string; qty: number; completed_qty: number; progress_pct: number; source: string }
interface Workspace {
    dpr_items: DprItem[]; labour_trend: LabourDay[]; photos: Photo[]; issues: Issue[]
    stage_progress: { cost_centre: string; progress_pct: number }[]; boq_progress: BoqProgress[]
}
interface BoqRow {
    cost_centre_id: string; cost_centre: string; name: string; boq_estimate: number; po_committed: number; material_consumed: number; site_labour: number
    subcontractor: number; petty_and_direct: number; total_actual: number; site_stock: number; open_commitment: number; eac: number; budget_used_pct: number; health: 'OK' | 'WATCH' | 'OVER'
}

const BUCKETS: { key: keyof Buckets; label: string; color: string }[] = [
    { key: 'MATERIAL_CONSUMED', label: 'Material consumed', color: '#2a78d6' },
    { key: 'SITE_LABOUR', label: 'Site labour', color: '#eb6834' },
    { key: 'SUBCONTRACTOR_BILL', label: 'Subcontractor', color: '#1baf7a' },
    { key: 'PETTY_CASH', label: 'Petty cash', color: '#eda100' },
    { key: 'DIRECT_EXPENSE', label: 'Direct expense', color: '#e87ba4' },
]
const BOQ_ROLES = ['PROJECT_MANAGER', 'PROJECT_HEAD', 'COMMERCIAL', 'DIRECTOR', 'ESTIMATION', 'ACCOUNTS']
const STAGE_ROLES = ['PROJECT_MANAGER', 'PROJECT_HEAD', 'DIRECTOR']
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

type TabId = 'overview' | 'boq' | 'dpr' | 'labour' | 'photos' | 'issues' | 'extra'

// ------------------------------------------------------------------------------------------------ page
export default function ProjectWorkspacePage() {
    const { id } = useParams<{ id: string }>()
    const { can } = useSession()
    const project = useApi<Project>(`/projects/${id}`)
    const ws = useApi<Workspace>(`/projects/${id}/workspace`)
    const variations = useApi<{ items: VariationRow[] }>(`/variations?project_id=${id}`)
    const [tab, setTab] = useState<TabId>('overview')
    const [now] = useState(() => Date.now())

    return (
        <Async state={project}>
            {p => {
                const progress = Math.min(100, toNum(p.physical_progress_pct))
                const daysLeft = Math.ceil((new Date(p.target_completion_date).getTime() - now) / 86400000)
                const openIssues = ws.data?.issues.filter(i => i.status !== 'RESOLVED').length
                const showBoq = can(...BOQ_ROLES)
                const tabs: { id: TabId; label: string; count?: number }[] = [
                    { id: 'overview', label: 'Overview' },
                    ...(showBoq ? [{ id: 'boq' as TabId, label: 'BOQ vs actual' }] : []),
                    { id: 'dpr', label: 'Daily reports', count: ws.data?.dpr_items.length },
                    { id: 'labour', label: 'Labour' },
                    { id: 'photos', label: 'Photos', count: ws.data?.photos.length },
                    { id: 'issues', label: 'Site issues', count: openIssues },
                    { id: 'extra', label: 'Extra work', count: variations.data?.items.length },
                ]
                return (
                    <>
                        <div className="small" style={{ marginBottom: 8 }}><Link href="/erp/projects"><Icon name="arrow_back" /> All projects</Link></div>
                        <div className="card">
                            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div className="row" style={{ gap: 8 }}>
                                        <span className="tag">{p.project_code}</span>
                                        <StatusBadge status={p.schedule_status} />
                                        <span className="badge info">Stage: {p.current_stage}</span>
                                        {p.status !== 'ACTIVE' ? <StatusBadge status={p.status} /> : null}
                                    </div>
                                    <h1 style={{ fontSize: 21, fontWeight: 800, margin: '6px 0 2px' }}>{p.name}</h1>
                                    <div className="small muted">
                                        {p.client.legal_name}{p.sites[0] ? ` · ${p.sites[0].city}` : ''}{p.carpet_area_sqft ? ` · ${qty(p.carpet_area_sqft, 0)} sq ft` : ''}
                                    </div>
                                </div>
                                <div className="small" style={{ textAlign: 'right' }}>
                                    <div>{fmtDate(p.start_date)} to {fmtDate(p.target_completion_date)}</div>
                                    <div className="muted">{p.status !== 'ACTIVE' ? humanize(p.status) : daysLeft >= 0 ? `${daysLeft} days to target date` : `${-daysLeft} days past target date`}</div>
                                </div>
                            </div>
                            <div style={{ marginTop: 12 }}>
                                <div className="row" style={{ justifyContent: 'space-between' }}><span className="small strong">Physical progress</span><span className="small strong mono">{pct(progress, 1)}</span></div>
                                <div className={`progress ${p.schedule_status === 'CRITICAL' ? 'bad' : p.schedule_status === 'ON_TRACK' ? 'good' : ''}`} role="progressbar" aria-label="Physical progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progress}%` }} /></div>
                            </div>
                        </div>

                        <Tabs<TabId> tabs={tabs} value={tab} onChange={setTab} />

                        {tab === 'overview' ? <Overview p={p} ws={ws.data} onChanged={() => void project.reload()} /> : null}
                        {tab === 'boq' ? <BoqTab id={id} ws={ws.data} /> : null}
                        {tab === 'dpr' ? <Async state={ws}>{w => <DprTab items={w.dpr_items} />}</Async> : null}
                        {tab === 'labour' ? <Async state={ws}>{w => <LabourTab days={w.labour_trend} />}</Async> : null}
                        {tab === 'photos' ? <Async state={ws}>{w => <PhotosTab photos={w.photos} />}</Async> : null}
                        {tab === 'issues' ? <Async state={ws}>{w => <IssuesTab issues={w.issues} onChanged={() => void ws.reload()} />}</Async> : null}
                        {tab === 'extra' ? <Async state={variations}>{v => <ExtraTab rows={v.items} now={now} onChanged={() => { void variations.reload(); void project.reload() }} />}</Async> : null}
                    </>
                )
            }}
        </Async>
    )
}

// ------------------------------------------------------------------------------------------------ overview
function Overview({ p, ws, onChanged }: { p: Project; ws: Workspace | null; onChanged: () => void }) {
    const { can } = useSession()
    const m = p.metrics
    const b = p.billing
    const [stage, setStage] = useState('')
    const { run, busy } = useAction()
    const chosen = stage || p.current_stage
    const stageIdx = p.stages.indexOf(p.current_stage)
    const bucketTotal = Math.max(1, m.actual_total)

    async function saveStage() {
        const r = await run(() => api.put(`/projects/${p.id}`, { current_stage: chosen }), `Stage moved to ${chosen}`)
        if (r) onChanged()
    }

    return (
        <>
            <div className="kpi-grid">
                <Kpi label="Contract incl. variations" value={inrCompact(m.total_contract)} sub={`${inrCompact(m.contract_value)} + ${inrCompact(m.approved_variation_value)} variations`} />
                <Kpi label="Estimated cost" value={inrCompact(m.revised_cost)} sub={`baseline ${inrCompact(m.baseline_cost)}`} />
                <Kpi label="Actual cost to date" value={inrCompact(m.actual_total)} sub="consumed, labour, bills, petty cash" />
                <Kpi label="Committed POs" value={inrCompact(m.po_committed)} sub={`${inrCompact(m.open_commitment)} still to receive${m.pending_po_value ? ` · ${inrCompact(m.pending_po_value)} awaiting approval` : ''}`} />
                <Kpi label="Stock on site" value={inrCompact(m.site_stock_value)} sub="an asset until consumed" />
                <Kpi label="Projected final cost (EAC)" value={inrCompact(m.eac)} tone={m.over_budget ? 'bad' : undefined} sub={m.over_budget ? 'above approved budget' : 'within approved budget'} />
                <Kpi label="Projected profit" value={inrCompact(m.projected_profit)} tone={m.projected_margin_pct < 10 ? 'bad' : m.projected_margin_pct < 20 ? 'warn' : 'good'} sub={`${pct(m.projected_margin_pct)} margin`} />
            </div>
            <div className="kpi-grid">
                <Kpi label="Billed (taxable)" value={inrCompact(b.billed_taxable)} sub={`${m.total_contract ? pct((b.billed_taxable / m.total_contract) * 100, 0) : '0%'} of contract`} />
                <Kpi label="Collected" value={inrCompact(b.collected)} />
                <Kpi label="Outstanding" value={inrCompact(b.outstanding)} tone={b.outstanding > 0 ? 'warn' : undefined} sub={b.retention_held ? `${inrCompact(b.retention_held)} retention held` : undefined} />
            </div>

            <div className="grid cols-2">
                <Card title="Stage" sub="Where the project is in its lifecycle">
                    <div className="chain" style={{ marginBottom: 12 }} aria-label="Project stages">
                        {p.stages.map((s, i) => (
                            <span key={s} className={`step ${i < stageIdx ? 'APPROVED' : i === stageIdx ? 'PENDING' : ''}`}>{s}</span>
                        ))}
                    </div>
                    {can(...STAGE_ROLES) ? (
                        <div className="row" style={{ alignItems: 'flex-end' }}>
                            <Field label="Move to stage">
                                <Select value={chosen} onChange={e => setStage(e.target.value)}>{p.stages.map(s => <option key={s} value={s}>{s}</option>)}</Select>
                            </Field>
                            <div style={{ marginBottom: 12 }}><Button variant="primary" loading={busy} disabled={chosen === p.current_stage} onClick={saveStage}>Update stage</Button></div>
                        </div>
                    ) : <p className="small muted" style={{ margin: 0 }}>Only the Project Manager, Project Head or Director can change the stage.</p>}
                    {ws?.stage_progress.length ? (
                        <div style={{ marginTop: 8 }}>
                            <div className="small strong" style={{ marginBottom: 6 }}>Progress by cost centre (by selling value)</div>
                            {ws.stage_progress.map(s => (
                                <div key={s.cost_centre} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 140px) 1fr 44px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                    <span className="small">{s.cost_centre.replace('CC-', '')}</span>
                                    <div className="progress" role="progressbar" aria-label={`${s.cost_centre} progress`} aria-valuenow={Math.round(s.progress_pct)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.min(100, s.progress_pct)}%` }} /></div>
                                    <span className="small mono right">{pct(s.progress_pct, 0)}</span>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </Card>

                <Card title="Actual cost by bucket" sub="Where the cost to date was booked">
                    {m.actual_total <= 0 ? <Empty title="No cost booked yet" icon="payments">Cost appears as material is consumed, labour is logged and bills are posted.</Empty> : (
                        <>
                            <div style={{ display: 'flex', gap: 2, height: 16, marginBottom: 12 }} role="img" aria-label={`Actual cost ${inr(m.actual_total)} split by bucket. The list below has the amounts.`}>
                                {BUCKETS.filter(x => m.actual_by_bucket[x.key] > 0).map(x => <div key={x.key} title={`${x.label}: ${inr(m.actual_by_bucket[x.key])}`} style={{ width: `${(m.actual_by_bucket[x.key] / bucketTotal) * 100}%`, background: x.color, borderRadius: 3, minWidth: 2 }} />)}
                            </div>
                            <table className="table"><tbody>
                                {BUCKETS.map(x => (
                                    <tr key={x.key}>
                                        <td><span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, background: x.color, borderRadius: 2, marginRight: 8 }} />{x.label}</td>
                                        <td className="num">{inr(m.actual_by_bucket[x.key])}</td>
                                        <td className="num muted">{pct((m.actual_by_bucket[x.key] / bucketTotal) * 100, 0)}</td>
                                    </tr>
                                ))}
                            </tbody><tfoot><tr><td>Total</td><td className="num">{inr(m.actual_total)}</td><td /></tr></tfoot></table>
                        </>
                    )}
                </Card>
            </div>

            <div className="grid cols-2">
                <Card title="Team">
                    <table className="table"><tbody>
                        {p.user_site_assignments.map((a, i) => (
                            <tr key={i}><td className="strong">{a.user.full_name}</td><td>{humanize(a.assignment_role)}</td><td className="muted">{a.user.phone}</td></tr>
                        ))}
                        {!p.user_site_assignments.length ? <tr><td className="muted">No one is assigned yet.</td></tr> : null}
                    </tbody></table>
                    <div className="small muted" style={{ marginTop: 8 }}>
                        Project manager {p.pm_user?.full_name ?? '—'} · Project head {p.project_head?.full_name ?? '—'}
                        {p.work_order ? ` · Work order ${p.work_order.wo_no}` : ''}{p.enquiry ? ` · Enquiry ${p.enquiry.enquiry_no}` : ''}
                    </div>
                </Card>
                <Card title="Site">
                    {!p.sites.length ? <Empty title="No site set up" icon="location_on" /> : p.sites.map(s => {
                        const wh = one(s.warehouses)
                        const fund = one(s.petty_cash_funds)
                        return (
                            <div key={s.id} style={{ marginBottom: 10 }}>
                                <div className="strong">{s.name} <span className="muted small">({s.code})</span></div>
                                <div className="small muted">{s.full_address}</div>
                                <div className="small" style={{ marginTop: 6, display: 'grid', gap: 2 }}>
                                    <div><span className="muted">Supervisor: </span>{s.site_supervisor ? `${s.site_supervisor.full_name} (${s.site_supervisor.phone})` : '—'}</div>
                                    <div><span className="muted">Storekeeper: </span>{s.storekeeper?.full_name ?? '—'}</div>
                                    <div><span className="muted">Site store: </span>{wh ? wh.code : '—'}</div>
                                    <div><span className="muted">Petty cash{fund?.code ? ` (${fund.code})` : ''}: </span>{fund ? <>{inr(fund.current_book_balance)} of {inr(fund.imprest_limit)} limit{toNum(fund.current_book_balance) < toNum(fund.replenishment_trigger_balance) ? <span className="badge warning" style={{ marginLeft: 6 }}>Below trigger</span> : null}</> : '—'}</div>
                                </div>
                            </div>
                        )
                    })}
                </Card>
            </div>
        </>
    )
}

// ------------------------------------------------------------------------------------------------ BOQ vs actual
function BoqTab({ id, ws }: { id: string; ws: Workspace | null }) {
    const state = useApi<{ rows: BoqRow[] }>(`/projects/${id}/boq-vs-actual`)
    const lineCols: Column<BoqProgress>[] = [
        { key: 'code', header: 'BOQ line', render: l => <span className="strong">{l.code}</span> },
        { key: 'description', header: 'Description', render: l => <div style={{ minWidth: 220 }}>{l.description}{l.source === 'VARIATION' ? <span className="badge purple" style={{ marginLeft: 6 }}>Extra work</span> : null}</div> },
        { key: 'cc', header: 'Cost centre', render: l => l.cost_centre.replace('CC-', '') },
        { key: 'qty', header: 'Planned', align: 'right', render: l => <span style={{ whiteSpace: 'nowrap' }}>{qty(l.qty)} {l.uom}</span> },
        { key: 'done', header: 'Done', align: 'right', render: l => <span style={{ whiteSpace: 'nowrap' }}>{qty(l.completed_qty)} {l.uom}</span> },
        { key: 'progress', header: 'Progress', render: l => <div style={{ minWidth: 120 }}><div className="small mono">{pct(l.progress_pct, 0)}</div><div className="progress"><div style={{ width: `${Math.min(100, l.progress_pct)}%` }} /></div></div> },
    ]
    return (
        <>
            <Card title="Budget against actual, by cost centre" sub="Projected final cost (EAC) = the larger of the BOQ budget and actual + stock on site + open PO commitments. Rows over budget are highlighted.">
                <Async state={state}>
                    {d => {
                        const sum = (f: (r: BoqRow) => number) => d.rows.reduce((s, r) => s + f(r), 0)
                        const over = d.rows.filter(r => r.health === 'OVER')
                        return (
                            <>
                                {over.length ? <Alert tone="danger">{over.map(r => r.cost_centre.replace('CC-', '')).join(', ')} {over.length > 1 ? 'are' : 'is'} projected to finish over budget.</Alert> : null}
                                {!d.rows.length ? <Empty title="No BOQ or cost yet" icon="table_chart" /> : (
                                    <div className="table-wrap">
                                        <table className="table" style={{ whiteSpace: 'nowrap' }}>
                                            <thead><tr>
                                                <th>Cost centre</th><th className="num">BOQ budget</th><th className="num">PO committed</th><th className="num">Material consumed</th><th className="num">Site labour</th>
                                                <th className="num">Subcontractor</th><th className="num">Petty cash + direct</th><th className="num">Actual</th><th className="num">Stock on site</th>
                                                <th className="num">Open commitment</th><th className="num">EAC</th><th>Budget used</th><th>Health</th>
                                            </tr></thead>
                                            <tbody>
                                                {d.rows.map(r => (
                                                    <tr key={r.cost_centre_id} style={r.health === 'OVER' ? { background: '#fef2f2' } : undefined}>
                                                        <td><div className="strong">{r.cost_centre.replace('CC-', '')}</div><div className="small muted">{r.name}</div></td>
                                                        <td className="num">{inr(r.boq_estimate)}</td><td className="num">{inr(r.po_committed)}</td><td className="num">{inr(r.material_consumed)}</td>
                                                        <td className="num">{inr(r.site_labour)}</td><td className="num">{inr(r.subcontractor)}</td><td className="num">{inr(r.petty_and_direct)}</td>
                                                        <td className="num strong">{inr(r.total_actual)}</td><td className="num">{inr(r.site_stock)}</td><td className="num">{inr(r.open_commitment)}</td>
                                                        <td className="num strong" style={{ color: r.eac > r.boq_estimate + 0.5 ? 'var(--danger)' : undefined }}>{inr(r.eac)}</td>
                                                        <td style={{ minWidth: 110 }}><div className="small mono">{pct(r.budget_used_pct, 0)}</div><div className={`progress ${r.health === 'OVER' ? 'bad' : ''}`}><div style={{ width: `${Math.min(100, r.budget_used_pct)}%` }} /></div></td>
                                                        <td><span className={`badge ${r.health === 'OVER' ? 'danger' : r.health === 'WATCH' ? 'warning' : 'success'}`}>{r.health === 'OVER' ? 'Over budget' : r.health === 'WATCH' ? 'Watch: 90% used' : 'On budget'}</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot><tr>
                                                <td>Total</td><td className="num">{inr(sum(r => r.boq_estimate))}</td><td className="num">{inr(sum(r => r.po_committed))}</td><td className="num">{inr(sum(r => r.material_consumed))}</td>
                                                <td className="num">{inr(sum(r => r.site_labour))}</td><td className="num">{inr(sum(r => r.subcontractor))}</td><td className="num">{inr(sum(r => r.petty_and_direct))}</td>
                                                <td className="num">{inr(sum(r => r.total_actual))}</td><td className="num">{inr(sum(r => r.site_stock))}</td><td className="num">{inr(sum(r => r.open_commitment))}</td>
                                                <td className="num">{inr(sum(r => r.eac))}</td><td /><td />
                                            </tr></tfoot>
                                        </table>
                                    </div>
                                )}
                            </>
                        )
                    }}
                </Async>
            </Card>
            <Card title="BOQ line progress" sub="Quantity completed on site against the locked BOQ, from the daily reports">
                <DataTable columns={lineCols} rows={ws?.boq_progress ?? []} empty={<Empty title="No BOQ lines" icon="table_chart" />} />
            </Card>
        </>
    )
}

// ------------------------------------------------------------------------------------------------ daily reports
function DprTab({ items }: { items: DprItem[] }) {
    const cols: Column<DprItem>[] = [
        { key: 'date', header: 'Report date', render: i => fmtDate(i.dpr.report_date) },
        { key: 'line', header: 'BOQ line', render: i => <div style={{ minWidth: 220 }}><span className="strong">{i.boq_line.code}</span> {i.boq_line.description}{i.zone ? <div className="small muted">Zone: {i.zone}</div> : null}</div> },
        { key: 'qty', header: 'Done', align: 'right', render: i => `${qty(i.completed_qty)} ${i.boq_line.uom.code}` },
        { key: 'delta', header: 'Progress added', align: 'right', render: i => `+${pct(i.progress_delta_pct, 2)}` },
        { key: 'by', header: 'Reported by', render: i => i.created_by_user.full_name },
        { key: 'remarks', header: 'Remarks', render: i => <div style={{ maxWidth: 260 }}>{i.remarks ?? <span className="muted">—</span>}{i.photo_url ? <div><a href={i.photo_url} target="_blank" rel="noreferrer">Photo</a></div> : null}</div> },
    ]
    return (
        <Card title="Daily progress entries" sub="Latest 40 work entries from the site supervisors">
            <DataTable columns={cols} rows={items} empty={<Empty title="No daily reports yet" icon="assignment">Entries appear here when the site supervisor submits the daily progress report.</Empty>} />
        </Card>
    )
}

// ------------------------------------------------------------------------------------------------ labour
function LabourTab({ days }: { days: LabourDay[] }) {
    const byDate = new Map<string, { date: string; workers: number; amount: number; trades: Map<string, number> }>()
    for (const d of days) {
        const key = String(d.date).slice(0, 10)
        const cur = byDate.get(key) ?? { date: key, workers: 0, amount: 0, trades: new Map() }
        cur.workers += d.workers
        cur.amount += toNum(d.total_amount)
        for (const l of d.lines) cur.trades.set(l.trade.name, (cur.trades.get(l.trade.name) ?? 0) + l.headcount)
        byDate.set(key, cur)
    }
    const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
    if (!rows.length) return <Card title="Labour"><Empty title="No labour logged in the last 14 days" icon="groups" /></Card>
    const max = Math.max(...rows.map(r => r.workers), 1)
    const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    return (
        <>
            <Card title="Workers on site, by day" sub="Last 14 days. The table below has the trades and wage cost.">
                <div role="img" aria-label={`Workers on site per day: ${rows.map(r => `${dayLabel(r.date)} ${r.workers}`).join(', ')}`} style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 180, overflowX: 'auto', paddingTop: 20 }}>
                    {rows.map(r => (
                        <div key={r.date} style={{ flex: '1 0 40px', maxWidth: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                            <span className="small mono strong">{r.workers}</span>
                            <div title={`${dayLabel(r.date)}: ${r.workers} workers, ${inr(r.amount)}`} style={{ width: '100%', height: `${(r.workers / max) * 120}px`, minHeight: 3, background: '#2a78d6', borderRadius: '4px 4px 0 0' }} />
                            <span className="small muted" style={{ marginTop: 4, whiteSpace: 'nowrap' }}>{dayLabel(r.date)}</span>
                        </div>
                    ))}
                </div>
            </Card>
            <Card title="Labour by day">
                <div className="table-wrap">
                    <table className="table">
                        <thead><tr><th>Date</th><th className="num">Workers</th><th className="num">Wage cost</th><th>Trades</th></tr></thead>
                        <tbody>
                            {[...rows].reverse().map(r => (
                                <tr key={r.date}>
                                    <td>{fmtDate(r.date)}</td><td className="num">{r.workers}</td><td className="num">{inr(r.amount)}</td>
                                    <td className="small">{[...r.trades.entries()].map(([t, n]) => `${t} ${n}`).join(' · ')}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot><tr><td>Total</td><td className="num">{rows.reduce((s, r) => s + r.workers, 0)}</td><td className="num">{inr(rows.reduce((s, r) => s + r.amount, 0))}</td><td /></tr></tfoot>
                    </table>
                </div>
            </Card>
        </>
    )
}

// ------------------------------------------------------------------------------------------------ photos
function PhotosTab({ photos }: { photos: Photo[] }) {
    if (!photos.length) return <Card title="Site photos"><Empty title="No photos yet" icon="photo_library">Photos taken by the site team appear here, grouped by project stage.</Empty></Card>
    const groups = new Map<string, Photo[]>()
    for (const ph of photos) groups.set(ph.stage ?? 'No stage', [...(groups.get(ph.stage ?? 'No stage') ?? []), ph])
    return (
        <>
            {[...groups.entries()].map(([stage, list]) => (
                <Card key={stage} title={stage} sub={`${list.length} photo${list.length > 1 ? 's' : ''}`}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                        {list.map(ph => (
                            <a key={ph.id} href={ph.photo_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ aspectRatio: '4 / 3', background: '#f1f5f9', borderRadius: 10, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={ph.photo_url} alt={ph.caption ?? `${stage} photo`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        onError={e => { e.currentTarget.style.display = 'none' }} />
                                    <Icon name="image" className="muted" />
                                </div>
                                <div className="small strong" style={{ marginTop: 4 }}>{ph.caption ?? 'No caption'}</div>
                                <div className="small muted">{ph.uploaded_by_user.full_name} · {fmtDateTime(ph.taken_at)}</div>
                            </a>
                        ))}
                    </div>
                </Card>
            ))}
        </>
    )
}

// ------------------------------------------------------------------------------------------------ site issues
function IssuesTab({ issues, onChanged }: { issues: Issue[]; onChanged: () => void }) {
    const { run } = useAction()
    const [resolving, setResolving] = useState<Issue | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const rank = (i: Issue) => (i.status === 'RESOLVED' ? 2 : i.severity === 'CRITICAL' ? 0 : 1)
    const sorted = [...issues].sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at))
    const openCritical = issues.filter(i => i.status !== 'RESOLVED' && i.severity === 'CRITICAL').length

    async function update(i: Issue, status: 'ACKNOWLEDGED' | 'RESOLVED', note?: string) {
        setBusyId(i.id)
        try {
            const r = await run(() => api.patch(`/site-issues/${i.id}`, { status, note }), status === 'RESOLVED' ? `${i.issue_no} resolved` : `${i.issue_no} acknowledged`)
            if (r) { setResolving(null); onChanged() }
        } finally { setBusyId(null) }
    }

    if (!issues.length) return <Card title="Site issues"><Empty title="No site issues raised" icon="task_alt">Blockers and problems raised by the site team appear here.</Empty></Card>
    return (
        <>
            {openCritical ? <Alert tone="danger">{openCritical} critical issue{openCritical > 1 ? 's are' : ' is'} open. The project is flagged at risk until {openCritical > 1 ? 'they are' : 'it is'} resolved.</Alert> : null}
            <div style={{ display: 'grid', gap: 10 }}>
                {sorted.map(i => (
                    <section key={i.id} className="card" style={{ margin: 0, borderColor: i.status !== 'RESOLVED' && i.severity === 'CRITICAL' ? '#fecaca' : undefined }} aria-label={`Issue ${i.issue_no}`}>
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                                <div className="row" style={{ gap: 8 }}>
                                    <span className="strong">{i.issue_no}</span>
                                    <span className={`badge ${i.severity === 'CRITICAL' ? 'danger' : 'warning'}`}>{i.severity === 'CRITICAL' ? <Icon name="error" /> : null}{humanize(i.severity)}</span>
                                    <StatusBadge status={i.status} />
                                    <span className="badge">{i.category}</span>
                                </div>
                                <p style={{ margin: '6px 0 4px', overflowWrap: 'anywhere' }}>{i.description}</p>
                                <div className="small muted">Raised by {i.raised_by_user.full_name} on {fmtDateTime(i.created_at)}{i.photo_url ? <> · <a href={i.photo_url} target="_blank" rel="noreferrer">Photo</a></> : null}</div>
                                {i.status === 'RESOLVED' ? <div className="small" style={{ marginTop: 4 }}>Resolved {fmtDateTime(i.resolved_at)}: {i.resolution_note}</div> : null}
                            </div>
                            {i.status !== 'RESOLVED' ? (
                                <div className="actions">
                                    {i.status === 'OPEN' ? <Button size="sm" icon="visibility" loading={busyId === i.id} onClick={() => update(i, 'ACKNOWLEDGED')}>Acknowledge</Button> : null}
                                    <Button size="sm" variant="success" icon="check" disabled={busyId === i.id} onClick={() => setResolving(i)}>Resolve</Button>
                                </div>
                            ) : null}
                        </div>
                    </section>
                ))}
            </div>
            <ReasonDialog
                open={!!resolving}
                title={resolving ? `Resolve ${resolving.issue_no}` : 'Resolve issue'}
                label="How was it resolved?"
                confirmLabel="Mark resolved"
                onClose={() => setResolving(null)}
                onSubmit={async note => { if (resolving) await update(resolving, 'RESOLVED', note) }}
            />
        </>
    )
}

// ------------------------------------------------------------------------------------------------ extra work
function ExtraTab({ rows, now, onChanged }: { rows: VariationRow[]; now: number; onChanged: () => void }) {
    const [openId, setOpenId] = useState<string | null>(null)
    const approved = rows.filter(v => ['APPROVED', 'WORK_COMPLETED', 'BILLED', 'PAID'].includes(v.status)).reduce((s, v) => s + toNum(v.client_price), 0)
    return (
        <>
            <Card title="Extra work on this project" sub={rows.length ? `${rows.length} request${rows.length > 1 ? 's' : ''}, ${inr(approved)} approved client value` : undefined}
                actions={<Link href="/erp/variations" className="btn btn-sm">All extra work</Link>}>
                {!rows.length ? <Empty title="No extra work on this project" icon="add_task">Extra work requested from site shows here with its approval chain.</Empty> : (
                    <div style={{ display: 'grid', gap: 10 }}>
                        {rows.map(v => (
                            <section key={v.id} className="card" style={{ margin: 0, padding: 14 }} aria-label={v.var_no}>
                                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                                        <button className="btn btn-ghost btn-sm strong" style={{ padding: 0 }} onClick={() => setOpenId(v.id)}>{v.var_no}</button>
                                        <div style={{ overflowWrap: 'anywhere' }}>{v.description}</div>
                                        <div className="small muted">{ageLabel(v.created_at, now) === 'Just now' ? 'Raised just now' : `Raised ${ageLabel(v.created_at, now)} ago`}{v.requested_by_user ? ` by ${v.requested_by_user.full_name}` : ''}</div>
                                    </div>
                                    <div className="row" style={{ gap: 18 }}>
                                        <div><div className="small muted">PM estimate</div><div className="mono strong">{v.pm_estimated_cost ? inr(v.pm_estimated_cost) : 'Not yet'}</div></div>
                                        <div><div className="small muted">Client price</div><div className="mono strong">{v.client_price ? inr(v.client_price) : 'Not yet'}</div></div>
                                        <div><div className="small muted">Margin</div><MarginBadge value={v.margin_pct} /></div>
                                        <StatusBadge status={v.status} />
                                    </div>
                                </div>
                                <div style={{ marginTop: 10 }} className="row">
                                    <div className="chain">
                                        {v.chain.map((s, i) => (
                                            <span key={s.step} style={{ display: 'contents' }}>
                                                {i > 0 ? <span className="arrow">→</span> : null}
                                                <span className={`step ${s.status}`}>{s.status === 'APPROVED' ? <Icon name="check_circle" /> : s.status === 'REJECTED' ? <Icon name="cancel" /> : null}{humanize(s.role)}{s.client_signoff ? ' + client sign-off' : ''}</span>
                                            </span>
                                        ))}
                                    </div>
                                    {currentGate(v) ? <span className="small muted">{currentGate(v)}</span> : null}
                                    <span className="spacer" />
                                    <Button size="sm" onClick={() => setOpenId(v.id)}>Details</Button>
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </Card>
            <VariationDetail key={openId ?? 'none'} id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} />
        </>
    )
}
