'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState, type ReactNode } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, inr, isoDate, pct, qty, toNum } from '@/lib/format'
import { Alert, Button, Card, DataTable, Empty, Field, Icon, Input, Kpi, Loading, Money, NumberInput, PageHeader, Select, StatusBadge, Textarea } from '@/components/ui'
import { GST_STATES } from '../../enquiries/gstStates'

// ------------------------------------------------------------------------------------------------ types
interface WoListRow { id: string; wo_no: string; contract_value: number; project_id: string | null; client: { legal_name: string }; enquiry: { enquiry_no: string; project_name: string } | null; quotation: { quotation_no: string; revision_no: number } | null }
interface WoDetail {
    id: string; wo_no: string; status: string; client_ref_no: string | null; contract_value: number; advance_pct: number; retention_pct: number; boq_id: string | null; project_id: string | null
    client: { legal_name: string; state_code: string }
    enquiry: { id: string; enquiry_no: string; project_name: string; site_city: string | null; site_address: string | null; carpet_area_sqft: number | null } | null
    boq: { boq_no: string; version_no: number; status: string; est_total_cost: number; sell_total: number; gross_margin_pct: number } | null
    quotation: { quotation_no: string; revision_no: number } | null
    project: { project_code: string } | null
}
interface BoqDetail { lines: { id: string; cost_centre: { code: string; name: string }; est_total_cost: number; sell_amount: number }[] }
interface DirUser { id: string; full_name: string }
interface Created {
    project: { id: string; project_code: string; name: string }
    site: { code: string; short_code: string | null; name: string }
    warehouse: { code: string; name: string }
    petty_cash_fund: { code: string; imprest_limit: number; replenishment_trigger_balance: number }
}
interface Form {
    name?: string; pm?: string; head?: string; supervisor?: string; storekeeper?: string; engineers?: string[]
    siteName?: string; city?: string; state?: string; address?: string; short?: string; lat?: number | ''; lng?: number | ''
    start?: string; target?: string; imprest?: number | ''; trigger?: number | ''
}

const STEPS = ['Work order', 'Team', 'Site', 'Schedule and float', 'Review']
const shortFrom = (city: string) => city.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()

export default function ProjectWizardPage() {
    return <Suspense fallback={<Loading />}><Wizard /></Suspense>
}

function Wizard() {
    const params = useSearchParams()
    const { user, can } = useSession()
    const [step, setStep] = useState(0)
    const [picked, setPicked] = useState<string | null>(null)
    const [form, setForm] = useState<Form>({})
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [created, setCreated] = useState<Created | null>(null)
    const set = (p: Form) => setForm(f => ({ ...f, ...p }))

    const woId = picked ?? params.get('work_order_id') ?? ''
    const approved = useApi<{ items: WoListRow[] }>('/work-orders?status=APPROVED')
    const wo = useApi<WoDetail>(woId ? `/work-orders/${woId}` : null)
    const boq = useApi<BoqDetail>(wo.data?.boq_id ? `/boqs/${wo.data.boq_id}` : null)
    const pms = useApi<{ items: DirUser[] }>('/directory/users?role=PROJECT_MANAGER')
    const heads = useApi<{ items: DirUser[] }>('/directory/users?role=PROJECT_HEAD')
    const sups = useApi<{ items: DirUser[] }>('/directory/users?role=SITE_SUPERVISOR')
    const keepers = useApi<{ items: DirUser[] }>('/directory/users?role=STOREKEEPER')
    const engs = useApi<{ items: DirUser[] }>('/directory/users?role=SITE_ENGINEER')
    const stages = useApi<{ stages: string[] }>('/project-stages')

    const w = wo.data && wo.data.id === woId ? wo.data : null
    const eligible = Boolean(w && w.status === 'APPROVED' && !w.project_id && w.boq?.status === 'BASELINE_LOCKED')
    const ineligible = w && !eligible
        ? w.project_id ? `A project (${w.project?.project_code ?? 'already'}) exists for this work order.`
            : w.status !== 'APPROVED' ? 'The Director has not approved this work order yet.' : 'The BOQ behind this work order is not locked as a baseline.'
        : null

    // Values shown in the form: what the user typed, otherwise a default taken from the work order.
    const e = {
        name: form.name ?? w?.enquiry?.project_name ?? '',
        pm: form.pm ?? '',
        head: form.head ?? (user && heads.data?.items.some(h => h.id === user.id) ? user.id : ''),
        supervisor: form.supervisor ?? '',
        storekeeper: form.storekeeper ?? '',
        engineers: form.engineers ?? [],
        siteName: form.siteName ?? form.name ?? w?.enquiry?.project_name ?? '',
        city: form.city ?? w?.enquiry?.site_city ?? '',
        state: form.state ?? w?.client.state_code ?? '',
        address: form.address ?? w?.enquiry?.site_address ?? '',
        short: form.short ?? shortFrom(form.city ?? w?.enquiry?.site_city ?? ''),
        lat: form.lat ?? '' as number | '',
        lng: form.lng ?? '' as number | '',
        start: form.start ?? isoDate(),
        target: form.target ?? '',
        imprest: form.imprest ?? 25000 as number | '',
        trigger: form.trigger ?? 5000 as number | '',
    }
    const nameOf = (list: { data: { items: DirUser[] } | null }, id: string) => list.data?.items.find(u => u.id === id)?.full_name ?? '—'

    // Each step reports what is still missing.
    const missing: string[][] = [
        [...(!woId ? ['Choose an approved work order'] : []), ...(w && !eligible ? [ineligible ?? 'This work order cannot be set up'] : []), ...(woId && !w ? ['Loading the work order'] : [])],
        [...(!e.pm ? ['Choose the project manager'] : []), ...(!e.supervisor ? ['Choose the site supervisor'] : [])],
        [
            ...(!e.siteName.trim() ? ['Enter the site name'] : []), ...(!e.city.trim() ? ['Enter the city'] : []), ...(!/^\d{2}$/.test(e.state) ? ['Choose the GST state'] : []),
            ...(!e.address.trim() ? ['Enter the site address'] : []), ...(!/^[A-Za-z]{3}$/.test(e.short) ? ['Short code must be exactly 3 letters'] : []),
            ...((e.lat === '') !== (e.lng === '') ? ['Give both GPS latitude and longitude, or neither'] : []),
            ...(e.lat !== '' && (e.lat < -90 || e.lat > 90) ? ['Latitude must be between -90 and 90'] : []), ...(e.lng !== '' && (e.lng < -180 || e.lng > 180) ? ['Longitude must be between -180 and 180'] : []),
        ],
        [
            ...(!e.start ? ['Enter the start date'] : []), ...(!e.target ? ['Enter the target completion date'] : []),
            ...(e.start && e.target && e.target <= e.start ? ['Target completion must be after the start date'] : []),
            ...(e.imprest === '' || e.imprest < 0 ? ['Enter the imprest limit'] : []), ...(e.trigger === '' || e.trigger < 0 ? ['Enter the replenishment trigger'] : []),
            ...(e.imprest !== '' && e.trigger !== '' && e.trigger > e.imprest ? ['The replenishment trigger cannot be above the imprest limit'] : []),
        ],
        [],
    ]
    const stepOk = (i: number) => missing[i].length === 0
    const allOk = [0, 1, 2, 3].every(stepOk)

    const bySector = useMemo(() => {
        const m = new Map<string, { code: string; name: string; lines: number; cost: number; sell: number }>()
        for (const l of boq.data?.lines ?? []) {
            const c = m.get(l.cost_centre.code) ?? { code: l.cost_centre.code, name: l.cost_centre.name, lines: 0, cost: 0, sell: 0 }
            c.lines++; c.cost += toNum(l.est_total_cost); c.sell += toNum(l.sell_amount)
            m.set(l.cost_centre.code, c)
        }
        return [...m.values()]
    }, [boq.data])

    async function create() {
        if (!allOk || !w) return
        setBusy(true); setError(null)
        try {
            const r = await api.post<Created>('/projects', {
                work_order_id: w.id, name: e.name.trim() || undefined, pm_user_id: e.pm, project_head_id: e.head || null, supervisor_id: e.supervisor, storekeeper_id: e.storekeeper || null, engineer_ids: e.engineers,
                start_date: e.start, target_completion_date: e.target, carpet_area_sqft: w.enquiry?.carpet_area_sqft ?? null,
                site: { name: e.siteName.trim(), city: e.city.trim(), state_code: e.state, full_address: e.address.trim(), short_code: e.short.toUpperCase(), gps_lat: e.lat === '' ? null : e.lat, gps_lng: e.lng === '' ? null : e.lng },
                imprest_limit: e.imprest === '' ? undefined : e.imprest, replenishment_trigger_balance: e.trigger === '' ? undefined : e.trigger,
            })
            setCreated(r)
        } catch (x) {
            setError(x instanceof Error ? x.message : 'Could not create the project')
        } finally {
            setBusy(false)
        }
    }

    if (user && !can('PROJECT_HEAD', 'COMMERCIAL', 'DIRECTOR')) {
        return (<><PageHeader title="Set up a project" /><Alert tone="warn">Only the Project Head, Commercial team or Director can set up projects.</Alert></>)
    }

    if (created) {
        return (
            <>
                <PageHeader title="Project created" subtitle="The site store and petty cash fund were provisioned automatically." />
                <Alert tone="success"><strong>{created.project.project_code}</strong> · {created.project.name} is live in the Planning stage.</Alert>
                <div className="grid cols-3">
                    <Card title="Project code"><div style={{ fontSize: 24, fontWeight: 800 }}>{created.project.project_code}</div><div className="muted small">Site {created.site.code}{created.site.short_code ? ` · short code ${created.site.short_code}` : ''}</div></Card>
                    <Card title="Site warehouse"><div className="strong">{created.warehouse.code}</div><div className="muted small">{created.warehouse.name}</div></Card>
                    <Card title="Petty cash fund"><div className="strong">{created.petty_cash_fund.code}</div><div className="muted small">Imprest {inr(created.petty_cash_fund.imprest_limit)} · refill below {inr(created.petty_cash_fund.replenishment_trigger_balance)}</div></Card>
                </div>
                <div className="actions">
                    <Link href={`/erp/projects/${created.project.id}`} className="btn btn-primary"><Icon name="apartment" /> Open project</Link>
                    {w?.enquiry ? <Link href={`/erp/enquiries/${w.enquiry.id}`} className="btn">View enquiry</Link> : null}
                    <Link href="/erp/projects" className="btn">All projects</Link>
                </div>
            </>
        )
    }

    const candidates = (approved.data?.items ?? []).filter(x => !x.project_id)

    return (
        <>
            <div className="small" style={{ marginBottom: 8 }}><Link href="/erp/projects">&larr; All projects</Link></div>
            <PageHeader title="Set up a project" subtitle="Turn an approved work order into a live project with its team, site, schedule and site cash float." />

            <ol className="chain" style={{ listStyle: 'none', margin: '0 0 16px', padding: 0 }} aria-label="Setup steps">
                {STEPS.map((s, i) => {
                    const done = i < step && stepOk(i)
                    const current = i === step
                    return (
                        <li key={s} style={{ display: 'contents' }}>
                            {i > 0 ? <span className="arrow" aria-hidden="true">→</span> : null}
                            <button type="button" className={`step ${done ? 'APPROVED' : current ? 'PENDING' : ''}`} style={{ cursor: i < step ? 'pointer' : 'default', fontFamily: 'inherit' }} disabled={i > step}
                                aria-current={current ? 'step' : undefined} onClick={() => setStep(i)}>
                                {done ? <Icon name="check_circle" /> : <span>{i + 1}.</span>} {s}
                            </button>
                        </li>
                    )
                })}
            </ol>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            {step === 0 ? (
                <>
                    <Card title="1. Pick the approved work order" sub="Only approved work orders that do not yet have a project are listed.">
                        {approved.loading && !approved.data ? <Loading /> : approved.error ? <Alert tone="danger">{approved.error}</Alert> : !candidates.length && !woId ? (
                            <Empty title="No work order is waiting for a project" icon="assignment">Create a work order from a quotation and get it approved by the Director first. <Link href="/erp/enquiries">Go to enquiries</Link></Empty>
                        ) : (
                            <div role="radiogroup" aria-label="Approved work orders" style={{ display: 'grid', gap: 10 }}>
                                {candidates.map(c => (
                                    <label key={c.id} className="card" style={{ margin: 0, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center', borderColor: c.id === woId ? 'var(--primary)' : undefined, background: c.id === woId ? 'var(--primary-light)' : undefined }}>
                                        <input type="radio" name="wo" checked={c.id === woId} onChange={() => setPicked(c.id)} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="strong">{c.wo_no} · {c.enquiry?.project_name ?? 'Work order'}</div>
                                            <div className="muted small">{c.client.legal_name}{c.quotation ? ` · ${c.quotation.quotation_no} Rev ${c.quotation.revision_no}` : ''}{c.enquiry ? ` · ${c.enquiry.enquiry_no}` : ''}</div>
                                        </div>
                                        <Money value={c.contract_value} />
                                    </label>
                                ))}
                            </div>
                        )}
                        {woId && !candidates.some(c => c.id === woId) && !approved.loading ? <p className="small muted" style={{ marginBottom: 0 }}>Showing the work order from the link you followed.</p> : null}
                    </Card>

                    {woId ? (
                        wo.error && !w ? <Alert tone="danger">{wo.error}</Alert> : !w ? <Loading /> : (
                            <>
                                {ineligible ? <Alert tone="danger">{ineligible} Pick a different work order.</Alert> : null}
                                <Card title={`Contract and BOQ · ${w.wo_no}`} sub={`${w.client.legal_name}${w.client_ref_no ? ` · client ref ${w.client_ref_no}` : ''}`} actions={<StatusBadge status={w.status} />}>
                                    <div className="kpi-grid" style={{ marginBottom: 14 }}>
                                        <Kpi label="Contract value" value={<Money value={w.contract_value} />} sub="excl. GST" />
                                        <Kpi label="Estimated cost (baseline)" value={<Money value={w.boq?.est_total_cost} />} sub={w.boq ? `${w.boq.boq_no} v${w.boq.version_no}` : undefined} />
                                        <Kpi label="Planned gross margin" value={pct(w.boq?.gross_margin_pct, 2)} tone="good" />
                                        <Kpi label="Advance / retention" value={`${toNum(w.advance_pct)}% / ${toNum(w.retention_pct)}%`} />
                                    </div>
                                    {boq.loading && !boq.data ? <Loading /> : boq.error && !boq.data ? <Alert tone="warn">The BOQ breakdown could not be loaded: {boq.error}</Alert> : (
                                        <DataTable
                                            rows={bySector}
                                            rowKey={r => r.code}
                                            empty={<Empty title="No BOQ lines" />}
                                            columns={[
                                                { key: 'cc', header: 'Cost centre', render: r => <><span className="strong">{r.code}</span> <span className="muted small">{r.name}</span></> },
                                                { key: 'lines', header: 'Lines', align: 'right', render: r => qty(r.lines, 0) },
                                                { key: 'cost', header: 'Est. cost', align: 'right', render: r => <Money value={r.cost} /> },
                                                { key: 'sell', header: 'Contract value', align: 'right', render: r => <Money value={r.sell} /> },
                                            ]}
                                            footer={bySector.length ? <tr><td>Total</td><td className="num">{qty(bySector.reduce((s, r) => s + r.lines, 0), 0)}</td><td className="num"><Money value={bySector.reduce((s, r) => s + r.cost, 0)} /></td><td className="num"><Money value={bySector.reduce((s, r) => s + r.sell, 0)} /></td></tr> : undefined}
                                        />
                                    )}
                                </Card>
                            </>
                        )
                    ) : null}
                </>
            ) : null}

            {step === 1 ? (
                <Card title="2. Project team" sub="Everyone chosen here is assigned to the new site and can see this project.">
                    <div className="form-grid">
                        <Field label="Project manager *"><UserSelect state={pms} value={e.pm} onChange={v => set({ pm: v })} placeholder="Select project manager..." /></Field>
                        <Field label="Project head"><UserSelect state={heads} value={e.head} onChange={v => set({ head: v })} placeholder="Not assigned" /></Field>
                        <Field label="Site supervisor *" hint="Custodian of the site petty cash fund."><UserSelect state={sups} value={e.supervisor} onChange={v => set({ supervisor: v })} placeholder="Select site supervisor..." /></Field>
                        <Field label="Storekeeper" hint="Runs the site warehouse. Defaults to the supervisor when empty."><UserSelect state={keepers} value={e.storekeeper} onChange={v => set({ storekeeper: v })} placeholder="Not assigned" /></Field>
                    </div>
                    <fieldset style={{ border: 'none', padding: 0, margin: '4px 0 0' }}>
                        <legend className="strong small" style={{ marginBottom: 6 }}>Site engineers</legend>
                        {engs.loading && !engs.data ? <span className="muted small">Loading...</span> : engs.data?.items.length ? (
                            <div className="row" style={{ gap: 16 }}>
                                {engs.data.items.map(u => (
                                    <label key={u.id} className="checkbox">
                                        <input type="checkbox" checked={e.engineers.includes(u.id)} onChange={ev => set({ engineers: ev.target.checked ? [...e.engineers, u.id] : e.engineers.filter(x => x !== u.id) })} /> {u.full_name}
                                    </label>
                                ))}
                            </div>
                        ) : <span className="muted small">No site engineers are set up yet.</span>}
                    </fieldset>
                </Card>
            ) : null}

            {step === 2 ? (
                <Card title="3. Site" sub="Defaults come from the enquiry. The short code prefixes this site's petty cash vouchers and issue numbers.">
                    <div className="form-grid">
                        <Field label="Project name"><Input value={e.name} onChange={ev => set({ name: ev.target.value })} maxLength={200} /></Field>
                        <Field label="Site name *"><Input value={e.siteName} onChange={ev => set({ siteName: ev.target.value })} maxLength={150} /></Field>
                        <Field label="City *"><Input value={e.city} onChange={ev => set({ city: ev.target.value })} maxLength={80} /></Field>
                        <Field label="State *">
                            <Select value={e.state} onChange={ev => set({ state: ev.target.value })}>
                                <option value="">Select state...</option>
                                {GST_STATES.map(s => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
                            </Select>
                        </Field>
                        <Field label="Site address *" className="full"><Textarea value={e.address} onChange={ev => set({ address: ev.target.value })} /></Field>
                        <Field label="Short code (3 letters) *" hint="If another site already uses it, a number is added automatically.">
                            <Input value={e.short} onChange={ev => set({ short: ev.target.value.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() })} maxLength={3} />
                        </Field>
                        <div />
                        <Field label="GPS latitude (optional)"><NumberInput value={e.lat} onChange={v => set({ lat: v })} step="any" /></Field>
                        <Field label="GPS longitude (optional)"><NumberInput value={e.lng} onChange={v => set({ lng: v })} step="any" /></Field>
                    </div>
                </Card>
            ) : null}

            {step === 3 ? (
                <Card title="4. Schedule and cash float" sub="The project starts in the Planning stage and moves through the standard stages.">
                    <div className="form-grid">
                        <Field label="Start date *"><Input type="date" value={e.start} onChange={ev => set({ start: ev.target.value })} /></Field>
                        <Field label="Target completion date *"><Input type="date" value={e.target} min={e.start} onChange={ev => set({ target: ev.target.value })} /></Field>
                        <Field label="Petty cash imprest limit (₹)" hint="The float the site holds."><NumberInput value={e.imprest} onChange={v => set({ imprest: v })} min={0} step="any" /></Field>
                        <Field label="Replenishment trigger balance (₹)" hint="A top-up request is raised automatically when the balance falls below this."><NumberInput value={e.trigger} onChange={v => set({ trigger: v })} min={0} step="any" /></Field>
                    </div>
                    {stages.data ? (
                        <>
                            <div className="muted small" style={{ marginBottom: 6 }}>Project stages</div>
                            <div className="chain">
                                {stages.data.stages.map((s, i) => <span key={s} style={{ display: 'contents' }}>{i ? <span className="arrow">→</span> : null}<span className={`step ${i === 0 ? 'PENDING' : ''}`}>{s}</span></span>)}
                            </div>
                        </>
                    ) : null}
                </Card>
            ) : null}

            {step === 4 ? (
                <Card title="5. Review and create" sub="Creating the project marks the enquiry as Won and provisions the site store and petty cash fund.">
                    <div className="grid cols-2">
                        <Summary title="Work order" onEdit={() => setStep(0)}>
                            <Row k="Work order">{w?.wo_no}</Row><Row k="Client">{w?.client.legal_name}</Row><Row k="Contract value"><Money value={w?.contract_value} /></Row>
                            <Row k="Baseline cost"><Money value={w?.boq?.est_total_cost} /></Row><Row k="BOQ">{w?.boq ? `${w.boq.boq_no} v${w.boq.version_no}` : '—'}</Row>
                        </Summary>
                        <Summary title="Team" onEdit={() => setStep(1)}>
                            <Row k="Project manager">{nameOf(pms, e.pm)}</Row><Row k="Project head">{e.head ? nameOf(heads, e.head) : 'Not assigned'}</Row>
                            <Row k="Site supervisor">{nameOf(sups, e.supervisor)}</Row><Row k="Storekeeper">{e.storekeeper ? nameOf(keepers, e.storekeeper) : 'Supervisor (default)'}</Row>
                            <Row k="Site engineers">{e.engineers.length ? e.engineers.map(id => nameOf(engs, id)).join(', ') : 'None'}</Row>
                        </Summary>
                        <Summary title="Site" onEdit={() => setStep(2)}>
                            <Row k="Project name">{e.name || '—'}</Row><Row k="Site">{e.siteName}</Row><Row k="City / state">{e.city}, {GST_STATES.find(s => s.code === e.state)?.name ?? e.state}</Row>
                            <Row k="Address">{e.address}</Row><Row k="Short code">{e.short}</Row><Row k="GPS">{e.lat === '' ? 'Not set' : `${e.lat}, ${e.lng}`}</Row>
                        </Summary>
                        <Summary title="Schedule and float" onEdit={() => setStep(3)}>
                            <Row k="Start">{fmtDate(e.start)}</Row><Row k="Target completion">{fmtDate(e.target)}</Row>
                            <Row k="Imprest limit"><Money value={e.imprest} /></Row><Row k="Replenishment trigger"><Money value={e.trigger} /></Row>
                        </Summary>
                    </div>
                    {!allOk ? <Alert tone="warn">Some steps are incomplete: {[0, 1, 2, 3].filter(i => !stepOk(i)).map(i => STEPS[i]).join(', ')}. Go back and finish them.</Alert> : null}
                </Card>
            ) : null}

            <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button disabled={step === 0 || busy} onClick={() => setStep(step - 1)} icon="arrow_back">Back</Button>
                <span className="spacer" />
                {step < 4 && !stepOk(step) ? <span className="small muted" role="status">{missing[step][0]}</span> : null}
                {step < 4 ? <Button variant="primary" disabled={!stepOk(step)} onClick={() => setStep(step + 1)}>Next</Button> : <Button variant="primary" icon="rocket_launch" loading={busy} disabled={!allOk} onClick={create}>Create project</Button>}
            </div>
        </>
    )
}

function UserSelect({ state, value, onChange, placeholder }: { state: { data: { items: DirUser[] } | null; loading: boolean; error: string | null }; value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
        <>
            <Select value={value} disabled={state.loading && !state.data} onChange={ev => onChange(ev.target.value)}>
                <option value="">{state.loading && !state.data ? 'Loading...' : placeholder}</option>
                {state.data?.items.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </Select>
            {state.error ? <div className="err">{state.error}</div> : null}
        </>
    )
}

function Summary({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
    return (
        <div className="card" style={{ background: '#f8fafc', marginBottom: 0 }}>
            <div className="card-header"><h3>{title}</h3><Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button></div>
            {children}
        </div>
    )
}
function Row({ k, children }: { k: string; children: ReactNode }) {
    return <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', marginBottom: 4 }}><span className="muted small" style={{ width: 130, flexShrink: 0 }}>{k}</span><span style={{ fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0 }}>{children}</span></div>
}
