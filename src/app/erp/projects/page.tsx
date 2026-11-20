'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, inrCompact, pct, toNum } from '@/lib/format'
import { Async, DataTable, Empty, Input, Kpi, Money, PageHeader, Select, StatusBadge } from '@/components/ui'

interface Row {
    id: string
    project_code: string
    name: string
    status: string
    schedule_status: string
    current_stage: string
    physical_progress_pct: number
    contract_value: number
    target_completion_date: string
    client: { legal_name: string }
    pm_user: { full_name: string }
    sites: { id: string; city: string }[]
    at_risk: boolean
    critical_issues: number
}

export default function ProjectsPage() {
    const router = useRouter()
    const { can } = useSession()
    const state = useApi<{ items: Row[] }>('/projects')
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [schedule, setSchedule] = useState('')

    const items = state.data?.items
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (items ?? []).filter(r =>
            (!status || r.status === status) && (!schedule || r.schedule_status === schedule) &&
            (!q || [r.project_code, r.name, r.client.legal_name, r.sites[0]?.city ?? ''].some(t => t.toLowerCase().includes(q))),
        )
    }, [items, search, status, schedule])

    return (
        <>
            <PageHeader
                title="Projects"
                subtitle="Every project with its schedule health and contract value. New projects start from an approved client work order."
                actions={can('PROJECT_HEAD', 'COMMERCIAL', 'DIRECTOR') ? <Link href="/erp/projects/new" className="btn btn-primary"><span className="material-symbols-outlined" aria-hidden="true">add</span>New project</Link> : null}
            />
            <Async state={state}>
                {d => {
                    const active = d.items.filter(p => p.status === 'ACTIVE')
                    const late = active.filter(p => p.schedule_status === 'DELAYED' || p.schedule_status === 'CRITICAL')
                    const avg = active.length ? active.reduce((s, p) => s + toNum(p.physical_progress_pct), 0) / active.length : 0
                    return (
                        <>
                            <div className="kpi-grid">
                                <Kpi label="Active projects" value={active.length} sub={`${d.items.length} in total`} />
                                <Kpi label="Active contract value" value={inrCompact(active.reduce((s, p) => s + toNum(p.contract_value), 0))} sub="excl. GST" />
                                <Kpi label="Delayed or critical" value={late.length} tone={late.length ? 'bad' : 'good'} sub={late.length ? 'schedule needs attention' : 'all on track'} />
                                <Kpi label="Average progress" value={pct(avg, 0)} sub="across active projects" />
                            </div>
                            <div className="card">
                                <div className="row" style={{ marginBottom: 14 }}>
                                    <div style={{ flex: '1 1 240px', maxWidth: 400 }}>
                                        <Input type="search" aria-label="Search projects" placeholder="Search by code, name, client or city" value={search} onChange={e => setSearch(e.target.value)} />
                                    </div>
                                    <div style={{ width: 160 }}>
                                        <Select aria-label="Filter by status" value={status} onChange={e => setStatus(e.target.value)}>
                                            <option value="">All statuses</option>
                                            <option value="ACTIVE">Active</option>
                                            <option value="ON_HOLD">On hold</option>
                                            <option value="COMPLETED">Completed</option>
                                            <option value="CANCELLED">Cancelled</option>
                                        </Select>
                                    </div>
                                    <div style={{ width: 170 }}>
                                        <Select aria-label="Filter by schedule" value={schedule} onChange={e => setSchedule(e.target.value)}>
                                            <option value="">Any schedule</option>
                                            <option value="ON_TRACK">On track</option>
                                            <option value="DELAYED">Delayed</option>
                                            <option value="CRITICAL">Critical</option>
                                        </Select>
                                    </div>
                                    <span className="muted small">{rows.length} of {d.items.length} shown</span>
                                </div>
                                <DataTable<Row>
                                    rows={rows}
                                    onRowClick={r => router.push(`/erp/projects/${r.id}`)}
                                    empty={<Empty title={d.items.length ? 'No projects match' : 'No projects yet'} icon="apartment">{d.items.length ? 'Change the filters or clear the search.' : 'Approve a client work order, then set up the first project.'}</Empty>}
                                    columns={[
                                        { key: 'project', header: 'Project', render: r => <><Link href={`/erp/projects/${r.id}`} onClick={e => e.stopPropagation()} className="strong">{r.project_code}</Link><div className="small">{r.name}</div></> },
                                        { key: 'client', header: 'Client', render: r => <><div>{r.client.legal_name}</div><div className="muted small">{r.sites[0]?.city ?? ''}</div></> },
                                        { key: 'pm', header: 'Project manager', render: r => r.pm_user.full_name },
                                        { key: 'stage', header: 'Stage', render: r => r.current_stage },
                                        {
                                            key: 'progress', header: 'Progress', width: 150, render: r => {
                                                const p = Math.min(100, Math.max(0, toNum(r.physical_progress_pct)))
                                                return (
                                                    <div style={{ minWidth: 110 }}>
                                                        <div className="progress" role="progressbar" aria-label={`${r.project_code} progress`} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${p}%` }} /></div>
                                                        <div className="small muted">{pct(p, 0)}</div>
                                                    </div>
                                                )
                                            },
                                        },
                                        { key: 'schedule', header: 'Schedule', render: r => <StatusBadge status={r.schedule_status} /> },
                                        { key: 'target', header: 'Target date', render: r => fmtDate(r.target_completion_date) },
                                        { key: 'contract', header: 'Contract value', align: 'right', render: r => <Money value={r.contract_value} /> },
                                        { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
                                    ]}
                                />
                            </div>
                        </>
                    )
                }}
            </Async>
        </>
    )
}
