'use client'
import Link from 'next/link'
import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useApi } from '@/lib/api'
import { humanize, inr, inrCompact, toNum } from '@/lib/format'
import { Async, Card, DataTable, Empty, Field, Icon, Input, Kpi, Loading, PageHeader, ProjectSelect, StatusBadge, Tabs, type Column } from '@/components/ui'
import { ageLabel, currentGate, MarginBadge, VAR_STATUSES, VariationDetail, type VariationRow } from './VariationDetail'

type TabId = 'ALL' | (typeof VAR_STATUSES)[number]
type View = 'table' | 'board'

const TAB_LABEL: Record<string, string> = { ALL: 'All', PENDING_APPROVAL: 'Pending approval', APPROVED: 'Approved', WORK_COMPLETED: 'Work completed', BILLED: 'Billed', PAID: 'Paid', REJECTED: 'Rejected' }
const COLUMN_HELP: Record<string, string> = {
    PENDING_APPROVAL: 'Waiting on the 4-step chain',
    APPROVED: 'Cleared. Work to be done on site',
    WORK_COMPLETED: 'Done. Ready to bill',
    BILLED: 'Invoiced to the client',
    PAID: 'Client has paid',
    REJECTED: 'Declined',
}

export default function ExtraWorkPage() {
    return (
        <Suspense fallback={<Loading />}>
            <ExtraWork />
        </Suspense>
    )
}

function ExtraWork() {
    const params = useSearchParams()
    const [openId, setOpenId] = useState<string | null>(params.get('open'))
    const [tab, setTab] = useState<TabId>('ALL')
    const [view, setView] = useState<View>('table')
    const [projectId, setProjectId] = useState('')
    const [search, setSearch] = useState('')
    const [now] = useState(() => Date.now())

    const state = useApi<{ items: VariationRow[] }>('/variations')

    return (
        <>
            <PageHeader
                title="Extra work tracker"
                subtitle="Every variation, from the site request through the four approval gates (PM, Commercial, Director, client sign-off) to billing and payment."
                actions={
                    <div className="row" role="group" aria-label="View">
                        <button className={`btn btn-sm ${view === 'table' ? 'btn-primary' : ''}`} aria-pressed={view === 'table'} onClick={() => setView('table')}><Icon name="table_rows" />Table</button>
                        <button className={`btn btn-sm ${view === 'board' ? 'btn-primary' : ''}`} aria-pressed={view === 'board'} onClick={() => setView('board')}><Icon name="view_kanban" />Board</button>
                    </div>
                }
            />
            <Async state={state}>
                {d => {
                    const scoped = d.items
                        .filter(v => !projectId || v.project_id === projectId)
                        .filter(v => {
                            const q = search.trim().toLowerCase()
                            return !q || v.var_no.toLowerCase().includes(q) || v.description.toLowerCase().includes(q) || v.project.project_code.toLowerCase().includes(q)
                        })
                    const count = (s: string) => scoped.filter(v => v.status === s).length
                    const rows = tab === 'ALL' ? scoped : scoped.filter(v => v.status === tab)
                    const approvedValue = scoped.filter(v => ['APPROVED', 'WORK_COMPLETED', 'BILLED', 'PAID'].includes(v.status)).reduce((s, v) => s + toNum(v.client_price), 0)
                    const columns: Column<VariationRow>[] = [
                        { key: 'var_no', header: 'Variation', render: v => <button className="btn btn-ghost btn-sm strong" onClick={() => setOpenId(v.id)}>{v.var_no}</button> },
                        { key: 'project', header: 'Project', render: v => <Link href={`/erp/projects/${v.project_id}`} style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>{v.project.project_code}</Link> },
                        { key: 'description', header: 'Description', render: v => <div style={{ minWidth: 220, maxWidth: 380 }}>{v.description}<div className="small muted">{v.cost_centre?.code} · {v.requested_by_user?.full_name}</div></div> },
                        { key: 'cost', header: 'PM estimate', align: 'right', render: v => v.pm_estimated_cost ? inr(v.pm_estimated_cost) : <span className="muted">Not yet</span> },
                        { key: 'price', header: 'Client price', align: 'right', render: v => v.client_price ? inr(v.client_price) : <span className="muted">Not yet</span> },
                        { key: 'margin', header: 'Margin', align: 'right', render: v => <MarginBadge value={v.margin_pct} /> },
                        { key: 'status', header: 'Status', render: v => <div><StatusBadge status={v.status} />{currentGate(v) ? <div className="small muted" style={{ marginTop: 3 }}>{currentGate(v)}</div> : null}</div> },
                        { key: 'age', header: 'Age', align: 'right', render: v => ageLabel(v.created_at, now) },
                    ]
                    return (
                        <>
                            <div className="kpi-grid">
                                <Kpi label="Pending approval" value={count('PENDING_APPROVAL')} sub="in the approval chain" tone={count('PENDING_APPROVAL') ? 'warn' : undefined} />
                                <Kpi label="Approved, work to do" value={count('APPROVED')} sub="mark complete once done" />
                                <Kpi label="Ready to bill" value={count('WORK_COMPLETED')} sub="work completed, not invoiced" tone={count('WORK_COMPLETED') ? 'warn' : undefined} />
                                <Kpi label="Approved client value" value={inrCompact(approvedValue)} sub="approved and beyond" />
                            </div>
                            <Card>
                                <div className="row" style={{ alignItems: 'flex-end' }}>
                                    <Field label="Project"><ProjectSelect value={projectId} onChange={setProjectId} placeholder="All projects" /></Field>
                                    <Field label="Search"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Variation no, description, project" /></Field>
                                </div>
                                {view === 'table' ? (
                                    <>
                                        <Tabs<TabId>
                                            value={tab}
                                            onChange={setTab}
                                            tabs={[{ id: 'ALL', label: TAB_LABEL.ALL, count: scoped.length }, ...VAR_STATUSES.map(s => ({ id: s as TabId, label: TAB_LABEL[s], count: count(s) }))]}
                                        />
                                        <DataTable
                                            columns={columns}
                                            rows={rows}
                                            onRowClick={v => setOpenId(v.id)}
                                            empty={<Empty title={d.items.length ? 'No extra work matches' : 'No extra work yet'} icon="add_task">{d.items.length ? 'Try another status or clear the filters.' : 'Site supervisors raise extra work from the mobile app. It appears here as soon as it is requested.'}</Empty>}
                                        />
                                        {tab === 'BILLED' || tab === 'PAID' ? <p className="small muted" style={{ marginTop: 10 }}>Invoices and receipts for extra work are managed in <Link href="/erp/finance/sales-invoices">Client billing</Link>.</p> : null}
                                    </>
                                ) : (
                                    <Board rows={scoped} now={now} onOpen={setOpenId} />
                                )}
                            </Card>
                        </>
                    )
                }}
            </Async>
            <VariationDetail key={openId ?? 'none'} id={openId} onClose={() => setOpenId(null)} onChanged={() => void state.reload()} />
        </>
    )
}

function Board({ rows, now, onOpen }: { rows: VariationRow[]; now: number; onOpen: (id: string) => void }) {
    const cols = useMemo(() => VAR_STATUSES.map(s => ({ status: s, items: rows.filter(r => r.status === s) })), [rows])
    if (!rows.length) return <Empty title="No extra work matches" icon="add_task" />
    return (
        <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(250px, 1fr)', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
            {cols.map(c => (
                <section key={c.status} aria-label={TAB_LABEL[c.status]} style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 12, padding: 10, minHeight: 160 }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                        <strong>{TAB_LABEL[c.status]}</strong><span className="badge">{c.items.length}</span>
                    </div>
                    <div className="small muted" style={{ marginBottom: 8 }}>{COLUMN_HELP[c.status]}</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {c.items.map(v => (
                            <button key={v.id} onClick={() => onOpen(v.id)} className="card" style={{ margin: 0, padding: 10, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', width: '100%' }}>
                                <div className="row" style={{ justifyContent: 'space-between' }}>
                                    <span className="strong">{v.var_no}</span><span className="small muted">{ageLabel(v.created_at, now)}</span>
                                </div>
                                <div className="small muted">{v.project.project_code}</div>
                                <div style={{ margin: '4px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.description}</div>
                                <div className="small mono">{v.pm_estimated_cost ? `Cost ${inr(v.pm_estimated_cost)}` : 'Cost not estimated'}</div>
                                <div className="small mono">{v.client_price ? `Price ${inr(v.client_price)}` : 'Price not set'}</div>
                                <div className="row" style={{ marginTop: 4, gap: 6 }}>
                                    <MarginBadge value={v.margin_pct} />
                                    {currentGate(v) ? <span className="small muted">{humanize(v.chain.find(s => s.status === 'PENDING')?.role)} now</span> : null}
                                </div>
                            </button>
                        ))}
                        {!c.items.length ? <div className="small muted">None</div> : null}
                    </div>
                </section>
            ))}
        </div>
    )
}

