'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { api, useApi, type ApiState } from '@/lib/api'
import { fmtDate, humanize, inr, isoDate, pct, qty, toNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import {
    Alert, ApprovalChain, Async, Button, Card, DataTable, Empty, Field, Input, Kpi, MasterSelect, Modal, NumberInput, PageHeader, ProjectSelect, Select, StatusBadge, Tabs, Textarea, useAction, useToast, type Column,
} from '@/components/ui'
import { matchRules, bandLabel, useApprovalRules } from '../procurement/_lib'
import { BillMath, Drawer, WO_STATUSES, type Bill, type Measurement, type WoDetail, type WoRow } from './_parts'

const CREATE_WO = ['COMMERCIAL', 'DIRECTOR', 'PROJECT_MANAGER', 'PROJECT_HEAD']
const MEASURE = ['SITE_ENGINEER', 'COMMERCIAL', 'PROJECT_MANAGER', 'DIRECTOR']
const BILL = ['SITE_ENGINEER', 'COMMERCIAL', 'DIRECTOR']

type TabId = 'wo' | 'mb' | 'bills'

export default function SubcontractorsPage() {
    const [tab, setTab] = useState<TabId>('wo')
    const [woId, setWoId] = useState('')
    const [drawerId, setDrawerId] = useState<string | null>(null)
    const wos = useApi<{ items: WoRow[] }>('/subcontractors/work-orders')
    const bills = useApi<{ items: Bill[] }>('/subcontractors/running-bills')
    const reloadAll = () => { void wos.reload(); void bills.reload() }
    const go = (t: TabId, id: string) => { setWoId(id); setTab(t); setDrawerId(null) }

    return (
        <>
            <PageHeader title="Subcontractors" subtitle="Work orders, the measurement book and running bills. A subcontractor is paid only for work the engineer has measured." />
            <Tabs
                tabs={[
                    { id: 'wo', label: 'Work orders', count: wos.data?.items.length },
                    { id: 'mb', label: 'Measurement book' },
                    { id: 'bills', label: 'Running bills', count: bills.data?.items.length },
                ]}
                value={tab}
                onChange={setTab}
            />
            {tab === 'wo' ? <WorkOrdersTab wos={wos} onOpen={setDrawerId} onCreated={reloadAll} /> : null}
            {tab === 'mb' ? <MeasurementTab wos={wos} woId={woId} setWoId={setWoId} onChanged={reloadAll} /> : null}
            {tab === 'bills' ? <BillsTab wos={wos} bills={bills} woId={woId} setWoId={setWoId} onChanged={reloadAll} /> : null}
            <Drawer open={!!drawerId} title="Work order" onClose={() => setDrawerId(null)}>
                {drawerId ? <WoDrawerBody id={drawerId} onGo={go} /> : null}
            </Drawer>
        </>
    )
}

// ---------------------------------------------------------------------------------------------- work orders
function WorkOrdersTab({ wos, onOpen, onCreated }: { wos: ApiState<{ items: WoRow[] }>; onOpen: (id: string) => void; onCreated: () => void }) {
    const { can } = useSession()
    const [status, setStatus] = useState('')
    const [projectId, setProjectId] = useState('')
    const [creating, setCreating] = useState(false)
    const rows = useMemo(() => (wos.data?.items ?? []).filter(w => (!status || w.status === status) && (!projectId || w.project_id === projectId)), [wos.data, status, projectId])

    const columns: Column<WoRow>[] = [
        { key: 'no', header: 'Work order', render: w => <><div className="strong">{w.swo_no}</div><div className="muted small">{fmtDate(w.created_at)}</div></> },
        { key: 'sub', header: 'Subcontractor', render: w => <><div>{w.subcontractor.legal_name}</div><div className="muted small">{w.project.project_code}</div></> },
        { key: 'scope', header: 'Scope', render: w => <span style={{ whiteSpace: 'normal', display: 'inline-block', minWidth: 200, maxWidth: 320 }}>{w.scope}{w.boq_line ? <span className="muted small"> · {w.boq_line.code}</span> : null}</span> },
        { key: 'qty', header: 'Quantity and rate', align: 'right', render: w => <><div>{qty(w.qty)} {w.uom.code}</div><div className="muted small">{inr(w.rate)} / {w.uom.code}</div></> },
        { key: 'val', header: 'WO value', align: 'right', render: w => inr(w.wo_value) },
        { key: 'prog', header: 'Done', align: 'right', render: w => <div style={{ minWidth: 80 }}><div>{pct(w.completed_pct, 0)}</div><div className={`progress ${w.completed_pct >= 100 ? 'good' : ''}`}><div style={{ width: `${Math.min(100, w.completed_pct)}%` }} /></div></div> },
        { key: 'billed', header: 'Billed (basic)', align: 'right', render: w => inr(w.billed_gross) },
        { key: 'bal', header: 'Balance payable', align: 'right', render: w => inr(w.balance_payable) },
        { key: 'status', header: 'Status', render: w => <StatusBadge status={w.status} /> },
    ]

    return (
        <>
            <Card>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                    <Field label="Status">
                        <Select value={status} onChange={e => setStatus(e.target.value)}>
                            <option value="">All statuses</option>
                            {WO_STATUSES.map(s => <option key={s} value={s}>{humanize(s)}</option>)}
                        </Select>
                    </Field>
                    <Field label="Project"><ProjectSelect value={projectId} onChange={id => setProjectId(id)} placeholder="All projects" /></Field>
                    {can(...CREATE_WO) ? <div className="field" style={{ justifyContent: 'flex-end' }}><Button variant="primary" icon="add" onClick={() => setCreating(true)}>New work order</Button></div> : null}
                </div>
            </Card>
            <Async state={wos}>
                {d => (
                    <>
                        <div className="kpi-grid">
                            <Kpi label="Work orders" value={rows.length} sub={`${rows.filter(w => w.status === 'PENDING_APPROVAL').length} waiting for approval`} />
                            <Kpi label="Order value" value={inr(rows.filter(w => w.status !== 'CANCELLED').reduce((s, w) => s + toNum(w.wo_value), 0))} />
                            <Kpi label="Billed (basic)" value={inr(rows.reduce((s, w) => s + toNum(w.billed_gross), 0))} />
                            <Kpi label="Balance payable" value={inr(rows.reduce((s, w) => s + toNum(w.balance_payable), 0))} tone={rows.some(w => w.balance_payable > 0) ? 'warn' : undefined} sub="After retention, TDS and recoveries" />
                        </div>
                        <DataTable
                            columns={columns}
                            rows={rows}
                            onRowClick={w => onOpen(w.id)}
                            empty={<Empty title={d.items.length ? 'No work orders match' : 'No work orders yet'} icon="engineering">{can(...CREATE_WO) ? 'Create a work order to award a package to a subcontractor.' : 'Work orders appear here once created.'}</Empty>}
                        />
                    </>
                )}
            </Async>
            {creating ? <CreateWoModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); onCreated() }} /> : null}
        </>
    )
}

// ---------------------------------------------------------------------------------------------- create work order
interface SubRow { id: string; code: string; legal_name: string; default_retention_pct: number | null; tds_section_id: string | null; is_active: boolean }
interface TdsRow { id: string; section_code: string; description: string; rate_pct: number; threshold_single_bill: number; threshold_annual: number }
interface ProjectDetail { id: string; status: string; sites: { id: string; code: string; name: string; city: string }[]; boq_lines: { id: string; code: string; description: string; uom_id: string; qty: number; remaining_qty: number; cost_centre: { code: string }; uom: { code: string } }[] }

function CreateWoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const { user } = useSession()
    const { run, busy } = useAction()
    const toast = useToast()
    const [projectId, setProjectId] = useState('')
    const [siteId, setSiteId] = useState('')
    const [subId, setSubId] = useState('')
    const [boqId, setBoqId] = useState('')
    const [scope, setScope] = useState('')
    const [uomId, setUomId] = useState('')
    const [amount, setAmount] = useState<number | ''>('')
    const [rate, setRate] = useState<number | ''>('')
    const [advance, setAdvance] = useState<number | ''>('')
    const [retention, setRetention] = useState<number | '' | null>(null)
    const [tdsId, setTdsId] = useState('')

    const project = useApi<ProjectDetail>(projectId ? `/projects/${projectId}` : null)
    const subs = useApi<{ items: SubRow[] }>('/masters/subcontractors?limit=200')
    const tdsList = useApi<{ items: TdsRow[] }>('/masters/tds-sections?limit=200')
    const gst = useApi<{ items: { id: string; code: string; total_rate_pct: number }[] }>('/masters/gst-taxes?limit=200')
    const rules = useApprovalRules()

    const sites = project.data?.sites ?? []
    const effectiveSite = siteId || (sites.length === 1 ? sites[0].id : '')
    const sub = subs.data?.items.find(s => s.id === subId)
    const boq = project.data?.boq_lines.find(b => b.id === boqId)
    const effectiveUom = uomId || boq?.uom_id || ''
    const effectiveRetention = retention ?? sub?.default_retention_pct ?? 0
    const effectiveTds = tdsId || sub?.tds_section_id || ''
    const tds = tdsList.data?.items.find(t => t.id === effectiveTds)
    const gst18 = gst.data?.items.find(g => g.code === 'GST-18')

    const value = Math.round(toNum(amount) * toNum(rate) * 100) / 100
    const tier = rules.data ? matchRules(rules.data.items, 'SUBCON_WO', user?.branch.id, value) : null

    const problems: string[] = []
    if (!projectId) problems.push('choose the project')
    if (projectId && !effectiveSite) problems.push('choose the site')
    if (!subId) problems.push('choose the subcontractor')
    if (!scope.trim()) problems.push('describe the scope')
    if (!effectiveUom) problems.push('choose the unit')
    if (!(toNum(amount) > 0)) problems.push('enter the quantity')
    if (!(toNum(rate) > 0)) problems.push('enter the agreed rate')
    if (toNum(advance) > value) problems.push('advance cannot exceed the work order value')
    if (toNum(effectiveRetention) < 0 || toNum(effectiveRetention) > 100) problems.push('retention must be between 0 and 100%')

    const submit = async () => {
        const res = await run(() => api.post<{ swo_no: string }>('/subcontractors/work-orders', {
            project_id: projectId, site_id: effectiveSite, subcontractor_id: subId, boq_line_id: boqId || null, scope: scope.trim(), uom_id: effectiveUom,
            qty: toNum(amount), rate: toNum(rate), advance_amount: toNum(advance), retention_pct: toNum(effectiveRetention), tds_section_id: effectiveTds || undefined,
        }))
        if (res) { toast.success(`${res.swo_no} created and sent for approval`); onCreated() }
    }

    return (
        <Modal
            open
            wide
            title="New work order"
            onClose={onClose}
            footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={problems.length > 0} onClick={submit}>Create work order</Button></>}
        >
            <div className="form-grid">
                <Field label="Project"><ProjectSelect status="ACTIVE" value={projectId} onChange={id => { setProjectId(id); setSiteId(''); setBoqId(''); setUomId('') }} /></Field>
                <Field label="Site">
                    <Select value={effectiveSite} disabled={!projectId || project.loading} onChange={e => setSiteId(e.target.value)}>
                        <option value="">{project.loading ? 'Loading...' : 'Select site...'}</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}, {s.city}</option>)}
                    </Select>
                </Field>
                <Field label="Subcontractor" hint={sub ? `Defaults: retention ${sub.default_retention_pct ?? 0}%` : undefined}>
                    <Select value={subId} onChange={e => { setSubId(e.target.value); setRetention(null); setTdsId('') }} disabled={subs.loading}>
                        <option value="">{subs.loading ? 'Loading...' : 'Select subcontractor...'}</option>
                        {subs.data?.items.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.code} · {s.legal_name}</option>)}
                    </Select>
                </Field>
                <Field label="BOQ line" hint={boq ? `${qty(boq.remaining_qty)} ${boq.uom.code} of ${qty(boq.qty)} still open in the BOQ · ${boq.cost_centre.code}` : 'Links measurements to the BOQ so the line cannot be over-certified.'}>
                    <Select value={boqId} disabled={!projectId} onChange={e => setBoqId(e.target.value)}>
                        <option value="">No BOQ link</option>
                        {project.data?.boq_lines.map(b => <option key={b.id} value={b.id}>{b.code} · {b.description.slice(0, 50)}</option>)}
                    </Select>
                </Field>
                <Field label="Scope of work" className="full"><Textarea value={scope} onChange={e => setScope(e.target.value)} placeholder="What the subcontractor will do, in plain words" style={{ minHeight: 56 }} /></Field>
                <Field label="Unit"><MasterSelect master="uoms" value={effectiveUom} onChange={id => setUomId(id)} placeholder="Choose unit..." /></Field>
                <Field label="Quantity"><NumberInput value={amount} min={0} onChange={setAmount} /></Field>
                <Field label="Agreed rate per unit (₹)"><NumberInput value={rate} min={0} onChange={setRate} /></Field>
                <Field label="Advance (₹)" hint="Recovered from running bills."><NumberInput value={advance} min={0} onChange={setAdvance} /></Field>
                <Field label="Retention (%)"><NumberInput value={effectiveRetention} min={0} max={100} onChange={v => setRetention(v)} /></Field>
                <Field label="TDS section" hint={tds ? `${tds.rate_pct}% on basic, from ${inr(tds.threshold_single_bill)} per bill or ${inr(tds.threshold_annual)} a year` : undefined}>
                    <Select value={effectiveTds} onChange={e => setTdsId(e.target.value)} disabled={tdsList.loading}>
                        <option value="">{tdsList.loading ? 'Loading...' : 'Select section...'}</option>
                        {tdsList.data?.items.map(t => <option key={t.id} value={t.id}>{t.section_code} · {t.description}</option>)}
                    </Select>
                </Field>
            </div>

            <div className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
                <div className="grid cols-4">
                    <Kpi label="Work order value" value={inr(value)} sub={`${qty(toNum(amount))} × ${inr(toNum(rate))}`} />
                    <Kpi label="Advance" value={inr(toNum(advance))} sub={value ? `${pct((toNum(advance) / value) * 100, 0)} of value` : undefined} />
                    <Kpi label="Retention" value={pct(effectiveRetention, 1)} sub={`${inr((value * toNum(effectiveRetention)) / 100)} held at full billing`} />
                    <Kpi label="TDS and GST" value={tds ? `${tds.section_code}` : '—'} sub={`${tds ? `${tds.rate_pct}% TDS` : 'No TDS section'}${gst18 ? ` · GST ${gst18.total_rate_pct}% default` : ''}`} />
                </div>
                <div className="small" style={{ marginTop: 10 }}>
                    <strong>Approval:</strong>{' '}
                    {value <= 0 ? 'Enter the quantity and rate to see who approves this work order.'
                        : rules.error ? 'The work order goes to the approval inbox after you create it.'
                            : !tier ? 'Loading the approval matrix...'
                                : tier.length ? <>{inr(value)} falls in the band {bandLabel(tier)}. <span style={{ display: 'inline-block', marginLeft: 6 }}><ApprovalChain steps={tier.map((r, i) => ({ step: i + 1, role: r.approver_role.code, status: i === 0 ? 'PENDING' : 'WAITING' }))} /></span></>
                                    : 'No approval rule covers this amount. Ask an administrator to configure the matrix.'}
                </div>
            </div>
            {problems.length ? <div className="muted small" style={{ marginTop: 10 }}>To create: {problems.join(', ')}.</div> : null}
            <div className="muted small" style={{ marginTop: 6 }}>The order is created as <em>pending approval</em>. Once approved it appears in the measurement book, and bills can be raised against measured work.</div>
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- shared WO select
function WoPicker({ wos, value, onChange, filter, label = 'Work order' }: { wos: WoRow[]; value: string; onChange: (id: string) => void; filter?: (w: WoRow) => boolean; label?: string }) {
    const list = filter ? wos.filter(filter) : wos
    return (
        <Field label={label}>
            <Select value={value} onChange={e => onChange(e.target.value)}>
                {!list.length ? <option value="">No work orders available</option> : null}
                {list.map(w => <option key={w.id} value={w.id}>{w.swo_no} · {w.subcontractor.legal_name} · {w.project.project_code} · {humanize(w.status)}</option>)}
            </Select>
        </Field>
    )
}

// ---------------------------------------------------------------------------------------------- measurement book
function MeasurementTab({ wos, woId, setWoId, onChanged }: { wos: ApiState<{ items: WoRow[] }>; woId: string; setWoId: (id: string) => void; onChanged: () => void }) {
    const { can } = useSession()
    const list = useMemo(() => (wos.data?.items ?? []).filter(w => ['APPROVED', 'COMPLETED'].includes(w.status)), [wos.data])
    const selected = woId && list.some(w => w.id === woId) ? woId : (list.find(w => w.status === 'APPROVED') ?? list[0])?.id ?? ''
    return (
        <Async state={wos}>
            {() => (
                <>
                    <Card><div className="form-grid"><WoPicker wos={list} value={selected} onChange={setWoId} /></div></Card>
                    {!list.length ? <Empty title="No approved work orders" icon="straighten">Measurements can be recorded once a work order is approved.</Empty>
                        : selected ? <MeasurementBook key={selected} id={selected} canRecord={can(...MEASURE)} onChanged={onChanged} /> : null}
                </>
            )}
        </Async>
    )
}

function MeasurementBook({ id, canRecord, onChanged }: { id: string; canRecord: boolean; onChanged: () => void }) {
    const state = useApi<WoDetail>(`/subcontractors/work-orders/${id}`)
    const { run, busy } = useAction()
    const [amount, setAmount] = useState<number | ''>('')
    const [on, setOn] = useState(isoDate())
    const [notes, setNotes] = useState('')
    const [unbilledOnly, setUnbilledOnly] = useState(false)

    return (
        <Async state={state}>
            {wo => {
                const measured = wo.boq_measurements.reduce((s, m) => s + toNum(m.measured_qty), 0)
                const billed = wo.boq_measurements.filter(m => m.billed).reduce((s, m) => s + toNum(m.measured_qty), 0)
                const remaining = Math.max(0, Math.round((toNum(wo.qty) - measured) * 1000) / 1000)
                const u = wo.uom.code
                const over = toNum(amount) > remaining + 0.0005
                const rows = wo.boq_measurements.filter(m => !unbilledOnly || !m.billed)
                const record = async () => {
                    const ok = await run(() => api.post('/subcontractors/measurements', { swo_id: wo.id, measured_qty: toNum(amount), measured_on: on || undefined, notes: notes.trim() || undefined }), 'Measurement recorded')
                    if (ok) { setAmount(''); setNotes(''); void state.reload(); onChanged() }
                }
                return (
                    <>
                        <div className="kpi-grid">
                            <Kpi label="Work order quantity" value={`${qty(wo.qty)} ${u}`} sub={wo.boq_line ? `${wo.boq_line.code}, BOQ quantity ${qty(wo.boq_line.qty)}` : 'No BOQ link'} />
                            <Kpi label="Measured so far" value={`${qty(measured)} ${u}`} sub={`${pct(toNum(wo.qty) ? (measured / toNum(wo.qty)) * 100 : 0, 0)} of the order`} />
                            <Kpi label="Billed" value={`${qty(billed)} ${u}`} />
                            <Kpi label="Unbilled" value={`${qty(measured - billed)} ${u}`} tone={measured - billed > 0 ? 'warn' : undefined} sub="Ready for a running bill" />
                            <Kpi label="Still to measure" value={`${qty(remaining)} ${u}`} />
                        </div>

                        {canRecord && wo.status === 'APPROVED' ? (
                            <Card title="Record a measurement" sub={`The engineer's verified quantity for ${wo.swo_no}. It cannot exceed the work order or the BOQ line.`}>
                                <div className="form-grid">
                                    <Field label={`Measured quantity (${u})`} hint={`${qty(remaining)} ${u} can still be measured.`} error={over ? `Only ${qty(remaining)} ${u} remains on ${wo.swo_no}.` : undefined}><NumberInput value={amount} min={0} onChange={setAmount} /></Field>
                                    <Field label="Measured on"><Input type="date" value={on} max={isoDate()} onChange={e => setOn(e.target.value)} /></Field>
                                    <Field label="Notes" className="full"><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Location, drawing reference, checked with" /></Field>
                                </div>
                                <Button variant="primary" icon="straighten" loading={busy} disabled={!(toNum(amount) > 0) || over} onClick={record}>Record measurement</Button>
                            </Card>
                        ) : (
                            <Alert tone="info">
                                {wo.status !== 'APPROVED' ? `${wo.swo_no} is ${humanize(wo.status).toLowerCase()}, so no more measurements can be recorded.` : 'Your role can view the measurement book but not record measurements. The site engineer, project manager, commercial or director records them.'}
                            </Alert>
                        )}

                        <Card
                            title="Measurements"
                            actions={<label className="checkbox"><input type="checkbox" checked={unbilledOnly} onChange={e => setUnbilledOnly(e.target.checked)} />Unbilled only</label>}
                        >
                            <MeasurementTable rows={rows} uom={u} />
                        </Card>
                    </>
                )
            }}
        </Async>
    )
}

function MeasurementTable({ rows, uom, selectable }: { rows: Measurement[]; uom: string; selectable?: { checked: (id: string) => boolean; toggle: (id: string) => void } }) {
    return (
        <DataTable
            rows={rows}
            empty={<Empty title="No measurements" icon="straighten" />}
            columns={[
                ...(selectable ? [{ key: 'sel', header: '', width: 36, render: (m: Measurement) => (m.billed ? null : <input type="checkbox" aria-label={`Include measurement of ${qty(m.measured_qty)} on ${fmtDate(m.measured_on)}`} checked={selectable.checked(m.id)} onChange={() => selectable.toggle(m.id)} />) }] : []),
                { key: 'on', header: 'Measured on', render: (m: Measurement) => fmtDate(m.measured_on) },
                { key: 'qty', header: 'Quantity', align: 'right' as const, render: (m: Measurement) => `${qty(m.measured_qty)} ${uom}` },
                { key: 'eng', header: 'Engineer', render: (m: Measurement) => m.engineer?.full_name ?? '—' },
                { key: 'notes', header: 'Notes', render: (m: Measurement) => m.notes ?? '—' },
                { key: 'billed', header: 'Billing', render: (m: Measurement) => (m.billed ? <span className="badge success">Billed</span> : <span className="badge warning">Unbilled</span>) },
            ]}
        />
    )
}

// ---------------------------------------------------------------------------------------------- running bills
interface BillResult extends Bill { breakdown: { gross: number; gst: number; retention: number; tds: number; advance_recovery: number; net_payable: number } }

function BillsTab({ wos, bills, woId, setWoId, onChanged }: { wos: ApiState<{ items: WoRow[] }>; bills: ApiState<{ items: Bill[] }>; woId: string; setWoId: (id: string) => void; onChanged: () => void }) {
    const { can } = useSession()
    const [projectId, setProjectId] = useState('')
    const [open, setOpen] = useState<Bill | null>(null)
    const [last, setLast] = useState<BillResult | null>(null)
    const list = useMemo(() => (wos.data?.items ?? []).filter(w => w.status === 'APPROVED'), [wos.data])
    const selected = woId && list.some(w => w.id === woId) ? woId : list[0]?.id ?? ''
    const woById = useMemo(() => new Map((wos.data?.items ?? []).map(w => [w.id, w])), [wos.data])
    const rows = (bills.data?.items ?? []).filter(b => !projectId || woById.get(b.swo_id)?.project_id === projectId)

    return (
        <>
            {can(...BILL) ? (
                <Card title="Create a running bill" sub="Pick the measured work to bill. Only unbilled measurements of an approved work order can be billed.">
                    <div className="form-grid"><WoPicker wos={list} value={selected} onChange={setWoId} filter={() => true} /></div>
                    {selected ? <BillBuilder key={selected} id={selected} bills={bills.data?.items ?? []} onPosted={r => { setLast(r); onChanged() }} /> : <Empty title="No approved work orders" icon="request_page">Work orders must be approved before they can be billed.</Empty>}
                </Card>
            ) : <Alert tone="info">Your role can view running bills. The site engineer, commercial or director raises them.</Alert>}

            {last ? (
                <Card title={`${last.bill_no} posted`} sub="Approved and posted to project cost" actions={<Button size="sm" variant="ghost" onClick={() => setLast(null)}>Dismiss</Button>}>
                    <BillMath
                        gross={last.breakdown.gross}
                        gst={last.breakdown.gst}
                        gstPct={last.breakdown.gross ? Math.round((last.breakdown.gst / last.breakdown.gross) * 10000) / 100 : undefined}
                        retention={last.breakdown.retention}
                        retentionPct={last.breakdown.gross ? Math.round((last.breakdown.retention / last.breakdown.gross) * 10000) / 100 : undefined}
                        tds={last.breakdown.tds}
                        advance={last.breakdown.advance_recovery}
                        net={last.breakdown.net_payable}
                        qtyText={`${qty(last.measured_qty)} measured, ${qty(last.cumulative_qty)} cumulative`}
                    />
                </Card>
            ) : null}

            <Card title="Running bills">
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    <Field label="Project"><ProjectSelect value={projectId} onChange={id => setProjectId(id)} placeholder="All projects" /></Field>
                </div>
                <Async state={bills}>
                    {() => (
                        <DataTable
                            rows={rows}
                            onRowClick={b => setOpen(b)}
                            empty={<Empty title="No running bills yet" icon="request_page">Record measurements, then raise a bill from them.</Empty>}
                            columns={[
                                { key: 'no', header: 'Bill', render: b => <><div className="strong">{b.bill_no}</div><div className="muted small">{fmtDate(b.bill_date)}</div></> },
                                { key: 'wo', header: 'Work order', render: b => <><div>{b.swo?.swo_no}</div><div className="muted small">{b.subcontractor?.legal_name} · {b.project?.project_code}</div></> },
                                { key: 'gross', header: 'Gross (basic)', align: 'right', render: b => inr(b.gross_amount) },
                                { key: 'gst', header: 'GST', align: 'right', render: b => inr(b.gst_amount) },
                                { key: 'ded', header: 'Retention, TDS, advance', align: 'right', render: b => inr(toNum(b.retention_amount) + toNum(b.tds_amount) + toNum(b.advance_recovery)) },
                                { key: 'net', header: 'Net payable', align: 'right', render: b => <span className="strong">{inr(b.net_payable)}</span> },
                                { key: 'paid', header: 'Paid', align: 'right', render: b => inr(b.paid_amount) },
                                { key: 'bal', header: 'Balance', align: 'right', render: b => inr(b.balance_due) },
                                { key: 'st', header: 'Status', render: b => <StatusBadge status={b.status} /> },
                            ]}
                            footer={rows.length ? <tr><td colSpan={2}>{rows.length} bill{rows.length === 1 ? '' : 's'}</td><td className="num">{inr(rows.reduce((s, b) => s + toNum(b.gross_amount), 0))}</td><td colSpan={2} /><td className="num">{inr(rows.reduce((s, b) => s + toNum(b.net_payable), 0))}</td><td className="num">{inr(rows.reduce((s, b) => s + toNum(b.paid_amount), 0))}</td><td className="num">{inr(rows.reduce((s, b) => s + toNum(b.balance_due), 0))}</td><td /></tr> : undefined}
                        />
                    )}
                </Async>
                <div className="muted small" style={{ marginTop: 8 }}>Payments against these bills are made from <Link href="/erp/finance/payments">Payments</Link>.</div>
            </Card>

            <Modal open={!!open} wide title={open ? `${open.bill_no} · ${open.swo?.swo_no ?? ''}` : 'Bill'} onClose={() => setOpen(null)}>
                {open ? <BillDetail bill={open} /> : null}
            </Modal>
        </>
    )
}

function BillDetail({ bill }: { bill: Bill }) {
    const g = toNum(bill.gross_amount)
    const p = (v: number) => (g ? Math.round((toNum(v) / g) * 10000) / 100 : undefined)
    return (
        <>
            <div className="muted small" style={{ marginBottom: 10 }}>{bill.subcontractor?.legal_name} · {bill.project?.project_code} · billed {fmtDate(bill.bill_date)} · <StatusBadge status={bill.status} /></div>
            <BillMath
                gross={g} gst={toNum(bill.gst_amount)} gstPct={p(bill.gst_amount)} retention={toNum(bill.retention_amount)} retentionPct={p(bill.retention_amount)}
                tds={toNum(bill.tds_amount)} advance={toNum(bill.advance_recovery)} net={toNum(bill.net_payable)} qtyText={`${qty(bill.measured_qty)} measured, ${qty(bill.cumulative_qty)} cumulative`}
            />
            <div className="grid cols-3" style={{ marginTop: 14 }}>
                <Kpi label="Net payable" value={inr(bill.net_payable)} />
                <Kpi label="Paid" value={inr(bill.paid_amount)} />
                <Kpi label="Balance due" value={inr(bill.balance_due)} tone={toNum(bill.balance_due) > 0 ? 'warn' : 'good'} />
            </div>
        </>
    )
}

/** Unbilled measurements of one work order, with the bill arithmetic previewed before posting. */
function BillBuilder({ id, bills, onPosted }: { id: string; bills: Bill[]; onPosted: (r: BillResult) => void }) {
    const wo = useApi<WoDetail>(`/subcontractors/work-orders/${id}`)
    const gst = useApi<{ items: { id: string; total_rate_pct: number }[] }>('/masters/gst-taxes?limit=200')
    const { run, busy } = useAction()
    const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
    const [recovery, setRecovery] = useState<number | ''>('')
    const [date, setDate] = useState(isoDate())

    return (
        <Async state={wo}>
            {d => {
                const unbilled = d.boq_measurements.filter(m => !m.billed)
                const picked = unbilled.filter(m => !unchecked.has(m.id))
                const quantity = Math.round(picked.reduce((s, m) => s + toNum(m.measured_qty), 0) * 1000) / 1000
                const r2 = (v: number) => Math.round(v * 100) / 100
                const gross = r2(quantity * toNum(d.rate))
                const gstPct = toNum(gst.data?.items.find(g => g.id === d.gst_tax_id)?.total_rate_pct)
                const gstAmt = r2((gross * gstPct) / 100)
                const retention = r2((gross * toNum(d.retention_pct)) / 100)
                // Same test as the server: this bill alone over the single-bill limit, or the year's billing over the annual limit.
                const fyStart = new Date(new Date().getFullYear(), 3, 1).getTime()
                const ytd = bills.filter(b => b.status !== 'CANCELLED' && new Date(b.created_at).getTime() >= fyStart && b.subcontractor_id === d.subcontractor_id).reduce((s, b) => s + toNum(b.gross_amount), 0)
                const tdsApplies = gross > 0 && (gross >= toNum(d.tds_section.threshold_single_bill) || ytd + gross >= toNum(d.tds_section.threshold_annual))
                const tdsAmt = tdsApplies ? r2((gross * toNum(d.tds_section.rate_pct)) / 100) : 0
                const outstanding = r2(toNum(d.advance_amount) - toNum(d.advance_recovered))
                const rec = Math.min(toNum(recovery), outstanding)
                const net = r2(gross + gstAmt - retention - tdsAmt - rec)
                const overAdvance = toNum(recovery) > outstanding + 0.005
                const u = d.uom.code
                const post = async () => {
                    const res = await run(() => api.post<BillResult>('/subcontractors/running-bills', {
                        swo_id: d.id, measurement_ids: picked.map(m => m.id), advance_recovery: toNum(recovery) || undefined, bill_date: date || undefined,
                    }), 'Running bill posted')
                    if (res) { setUnchecked(new Set()); setRecovery(''); void wo.reload(); onPosted(res) }
                }
                return (
                    <>
                        {!unbilled.length ? (
                            <Empty title="No unbilled measurements" icon="straighten">Record a measurement in the measurement book first. A subcontractor is billed only for measured work.</Empty>
                        ) : (
                            <div className="grid cols-2" style={{ alignItems: 'start' }}>
                                <div>
                                    <h4 style={{ fontSize: 13, marginBottom: 8 }}>Unbilled measurements ({unbilled.length})</h4>
                                    <MeasurementTable
                                        rows={unbilled}
                                        uom={u}
                                        selectable={{ checked: mid => !unchecked.has(mid), toggle: mid => setUnchecked(s => { const n = new Set(s); if (n.has(mid)) n.delete(mid); else n.add(mid); return n }) }}
                                    />
                                    <div className="form-grid" style={{ marginTop: 12 }}>
                                        <Field label="Bill date"><Input type="date" value={date} max={isoDate()} onChange={e => setDate(e.target.value)} /></Field>
                                        <Field label="Advance recovery (₹)" hint={outstanding > 0 ? `${inr(outstanding)} of advance still to recover.` : 'No advance outstanding.'} error={overAdvance ? `Only ${inr(outstanding)} is left to recover.` : undefined}>
                                            <NumberInput value={recovery} min={0} disabled={outstanding <= 0} onChange={setRecovery} />
                                        </Field>
                                    </div>
                                </div>
                                <div>
                                    <h4 style={{ fontSize: 13, marginBottom: 8 }}>Bill preview ({qty(quantity)} measured × {inr(d.rate)})</h4>
                                    <BillMath
                                        gross={gross} gst={gstAmt} gstPct={gstPct} retention={retention} retentionPct={toNum(d.retention_pct)}
                                        tdsLabel={`${d.tds_section.section_code} ${d.tds_section.rate_pct}%`} tds={tdsAmt} advance={rec} net={net}
                                        note={<span className="muted small">Preview only. The server fixes the final figures when the bill is posted (TDS also depends on the subcontractor&apos;s year-to-date billing).</span>}
                                    />
                                </div>
                            </div>
                        )}
                        {unbilled.length ? (
                            <div className="actions" style={{ marginTop: 14 }}>
                                <Button variant="primary" icon="request_page" loading={busy} disabled={!picked.length || overAdvance} onClick={post}>Create running bill{picked.length ? ` (${picked.length} measurement${picked.length === 1 ? '' : 's'})` : ''}</Button>
                                {!picked.length ? <span className="muted small">Tick at least one measurement.</span> : null}
                            </div>
                        ) : null}
                    </>
                )
            }}
        </Async>
    )
}

// ---------------------------------------------------------------------------------------------- work order drawer
function WoDrawerBody({ id, onGo }: { id: string; onGo: (tab: TabId, id: string) => void }) {
    const { can } = useSession()
    const state = useApi<WoDetail>(`/subcontractors/work-orders/${id}`)
    const wf = useApi<{ workflow_steps: { step_order: number; status: string; reason: string | null; approver_role: { code: string; name: string }; decided_by_user: { full_name: string } | null }[] }>(
        state.data?.status === 'PENDING_APPROVAL' || state.data?.status === 'CANCELLED' ? `/workflows/SUBCON_WO/${id}` : null)
    const [bill, setBill] = useState<Bill | null>(null)
    return (
        <Async state={state}>
            {wo => {
                const measured = wo.boq_measurements.reduce((s, m) => s + toNum(m.measured_qty), 0)
                const billedGross = wo.subcontractor_running_bills.filter(b => b.status !== 'CANCELLED').reduce((s, b) => s + toNum(b.gross_amount), 0)
                const balance = wo.subcontractor_running_bills.reduce((s, b) => s + toNum(b.balance_due), 0)
                const done = toNum(wo.qty) ? Math.min(100, (Math.max(0, ...wo.subcontractor_running_bills.map(b => toNum(b.cumulative_qty))) / toNum(wo.qty)) * 100) : 0
                return (
                    <>
                        <div style={{ marginBottom: 12 }}>
                            <div className="strong" style={{ fontSize: 16 }}>{wo.swo_no} <StatusBadge status={wo.status} /></div>
                            <div className="muted">{wo.subcontractor.legal_name} · {wo.project.project_code}{wo.boq_line ? ` · ${wo.boq_line.code}` : ''}</div>
                            <p style={{ margin: '8px 0 0' }}>{wo.scope}</p>
                        </div>
                        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                            <Kpi label="WO value" value={inr(wo.wo_value)} sub={`${qty(wo.qty)} × ${inr(wo.rate)}`} />
                            <Kpi label="Billed (basic)" value={inr(billedGross)} sub={`${pct(done, 0)} complete`} />
                            <Kpi label="Balance payable" value={inr(balance)} tone={balance > 0 ? 'warn' : undefined} />
                            <Kpi label="Advance" value={inr(wo.advance_amount)} sub={`${inr(wo.advance_recovered)} recovered`} />
                        </div>
                        <div className={`progress ${done >= 100 ? 'good' : ''}`} style={{ marginBottom: 14 }}><div style={{ width: `${done}%` }} /></div>
                        <div className="small muted" style={{ marginBottom: 14 }}>Retention {wo.retention_pct}% · TDS {wo.tds_section.section_code} ({wo.tds_section.rate_pct}%) · GST 18% default · measured {qty(measured)} of {qty(wo.qty)}</div>
                        {wo.status === 'PENDING_APPROVAL' ? (
                            <Alert tone="warn">Waiting for approval in the <Link href="/erp/inbox">approval inbox</Link>.{wf.data ? <div style={{ marginTop: 6 }}><ApprovalChain steps={wf.data.workflow_steps.map(s => ({ step: s.step_order, role: s.approver_role.code, status: s.status }))} /></div> : null}</Alert>
                        ) : null}
                        {wo.status === 'CANCELLED' ? <Alert tone="danger">This work order was rejected or cancelled.</Alert> : null}
                        <div className="actions" style={{ marginBottom: 14 }}>
                            {wo.status === 'APPROVED' && can(...MEASURE) ? <Button icon="straighten" onClick={() => onGo('mb', wo.id)}>Record measurement</Button> : null}
                            {wo.status === 'APPROVED' && can(...BILL) ? <Button variant="primary" icon="request_page" onClick={() => onGo('bills', wo.id)}>Create running bill</Button> : null}
                        </div>
                        <Card title="Measurements"><MeasurementTable rows={wo.boq_measurements} uom={wo.uom.code} /></Card>
                        <Card title="Running bills">
                            <DataTable
                                rows={wo.subcontractor_running_bills}
                                onRowClick={b => setBill(b)}
                                empty={<Empty title="No bills yet" icon="request_page" />}
                                columns={[
                                    { key: 'no', header: 'Bill', render: b => <><div className="strong">{b.bill_no}</div><div className="muted small">{fmtDate(b.bill_date)}</div></> },
                                    { key: 'g', header: 'Gross', align: 'right', render: b => inr(b.gross_amount) },
                                    { key: 'n', header: 'Net payable', align: 'right', render: b => inr(b.net_payable) },
                                    { key: 'p', header: 'Paid', align: 'right', render: b => inr(b.paid_amount) },
                                    { key: 'b', header: 'Balance', align: 'right', render: b => inr(b.balance_due) },
                                ]}
                            />
                        </Card>
                        <Modal open={!!bill} wide title={bill ? `${bill.bill_no}` : 'Bill'} onClose={() => setBill(null)}>
                            {bill ? <BillDetail bill={{ ...bill, swo: { swo_no: wo.swo_no, scope: wo.scope }, subcontractor: { legal_name: wo.subcontractor.legal_name }, project: { project_code: wo.project.project_code } }} /> : null}
                        </Modal>
                    </>
                )
            }}
        </Async>
    )
}
