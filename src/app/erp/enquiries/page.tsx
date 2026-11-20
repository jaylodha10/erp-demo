'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, inrCompact, qty } from '@/lib/format'
import { Async, Button, DataTable, Empty, Input, Kpi, Money, PageHeader, StatusBadge, Tabs, useToast } from '@/components/ui'
import { EnquiryFormModal } from './EnquiryFormModal'
import { statusLabel } from './labels'

interface Row {
    id: string
    enquiry_no: string
    client_name: string
    project_name: string
    site_city: string | null
    carpet_area_sqft: number | null
    expected_value: number
    status: string
    next_followup_date: string | null
    enquiry_date: string
    lead_source: string | null
    sales_person: { full_name: string } | null
    project: { id: string; project_code: string } | null
}
interface List {
    items: Row[]
    summary: { total: number; open: number; pipeline_value: number; quotations_awaiting_wo: number; followups_due: number }
}

const OPEN = ['NEW', 'SITE_VISIT', 'BOQ_SUBMITTED', 'QUOTATION_SENT']
const FILTERS = [
    { id: 'ALL', label: 'All' },
    { id: 'NEW', label: 'New' },
    { id: 'SITE_VISIT', label: 'Site visit' },
    { id: 'BOQ_SUBMITTED', label: 'BOQ submitted' },
    { id: 'QUOTATION_SENT', label: 'Quotation sent' },
    { id: 'WON', label: 'Won' },
    { id: 'LOST', label: 'Lost' },
]

export default function EnquiriesPage() {
    const router = useRouter()
    const toast = useToast()
    const { can } = useSession()
    const state = useApi<List>('/enquiries')
    const [filter, setFilter] = useState('ALL')
    const [search, setSearch] = useState('')
    const [creating, setCreating] = useState(false)

    const items = state.data?.items
    const counts = useMemo(() => {
        const c: Record<string, number> = { ALL: items?.length ?? 0 }
        for (const r of items ?? []) c[r.status] = (c[r.status] ?? 0) + 1
        return c
    }, [items])
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (items ?? []).filter(r =>
            (filter === 'ALL' || r.status === filter) &&
            (!q || [r.enquiry_no, r.client_name, r.project_name, r.site_city ?? ''].some(t => t.toLowerCase().includes(q))),
        )
    }, [items, filter, search])

    const today = new Date().toISOString().slice(0, 10)

    return (
        <>
            <PageHeader
                title="Enquiries and BOQ"
                subtitle="Track every lead from first contact to a signed work order. Won enquiries become projects."
                actions={can('COMMERCIAL', 'DIRECTOR') ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>New enquiry</Button> : null}
            />
            <Async state={state}>
                {d => {
                    const byStatus = (s: string) => d.items.filter(r => r.status === s)
                    const value = (s: string) => byStatus(s).reduce((t, r) => t + Number(r.expected_value), 0)
                    return (
                        <>
                            <div className="kpi-grid">
                                <Kpi label="Open pipeline" value={inrCompact(d.summary.pipeline_value)} sub={`${d.summary.open} open enquiries`} />
                                <Kpi label="New" value={byStatus('NEW').length} sub={inrCompact(value('NEW'))} />
                                <Kpi label="Site visit" value={byStatus('SITE_VISIT').length} sub={inrCompact(value('SITE_VISIT'))} />
                                <Kpi label="BOQ submitted" value={byStatus('BOQ_SUBMITTED').length} sub={inrCompact(value('BOQ_SUBMITTED'))} />
                                <Kpi label="Quotation sent" value={d.summary.quotations_awaiting_wo} sub={`${inrCompact(value('QUOTATION_SENT'))} awaiting a work order`} tone={d.summary.quotations_awaiting_wo ? 'warn' : undefined} />
                                <Kpi label="Follow-ups due" value={d.summary.followups_due} sub="open enquiries past their follow-up date" tone={d.summary.followups_due ? 'bad' : undefined} />
                            </div>

                            <div className="card">
                                <Tabs tabs={FILTERS.map(f => ({ ...f, count: counts[f.id] ?? 0 }))} value={filter} onChange={setFilter} />
                                <div className="row" style={{ marginBottom: 14 }}>
                                    <div style={{ flex: '1 1 260px', maxWidth: 420 }}>
                                        <Input type="search" aria-label="Search enquiries" placeholder="Search by client, project, city or enquiry number" value={search} onChange={e => setSearch(e.target.value)} />
                                    </div>
                                    <span className="muted small">{rows.length} of {d.items.length} shown</span>
                                </div>
                                <DataTable<Row>
                                    rows={rows}
                                    onRowClick={r => router.push(`/erp/enquiries/${r.id}`)}
                                    empty={
                                        <Empty title={d.items.length ? 'No enquiries match' : 'No enquiries yet'} icon="request_quote">
                                            {d.items.length ? 'Try another status tab or clear the search.' : 'Log the first enquiry to start the pipeline.'}
                                        </Empty>
                                    }
                                    columns={[
                                        { key: 'enquiry_no', header: 'Enquiry', render: r => <Link href={`/erp/enquiries/${r.id}`} onClick={e => e.stopPropagation()} className="strong" style={{ whiteSpace: 'nowrap' }}>{r.enquiry_no}</Link> },
                                        { key: 'client_name', header: 'Client', render: r => <><div className="strong">{r.client_name}</div><div className="muted small">{r.lead_source ?? ''}</div></> },
                                        { key: 'project_name', header: 'Project', render: r => <><div>{r.project_name}</div><div className="muted small">{r.site_city ?? '—'}</div></> },
                                        { key: 'carpet_area_sqft', header: 'Area (sqft)', align: 'right', render: r => (r.carpet_area_sqft ? qty(r.carpet_area_sqft, 0) : '—') },
                                        { key: 'expected_value', header: 'Expected value', align: 'right', render: r => <Money value={r.expected_value} /> },
                                        { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} label={statusLabel(r.status)} /> },
                                        {
                                            key: 'next_followup_date', header: 'Follow-up', render: r => {
                                                if (!r.next_followup_date) return <span className="muted">—</span>
                                                const late = OPEN.includes(r.status) && r.next_followup_date.slice(0, 10) <= today
                                                return <span style={late ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{fmtDate(r.next_followup_date)}{late ? ' (due)' : ''}</span>
                                            },
                                        },
                                        { key: 'sales_person', header: 'Owner', render: r => r.sales_person?.full_name ?? '—' },
                                        { key: 'project', header: 'Project code', render: r => (r.project ? <Link href={`/erp/projects/${r.project.id}`} onClick={e => e.stopPropagation()}>{r.project.project_code}</Link> : <span className="muted">—</span>) },
                                    ]}
                                />
                            </div>
                        </>
                    )
                }}
            </Async>
            <EnquiryFormModal
                open={creating}
                onClose={() => setCreating(false)}
                onSaved={saved => { toast.success('Enquiry logged'); setCreating(false); router.push(`/erp/enquiries/${saved.id}`) }}
            />
        </>
    )
}
