'use client'
import { useId, useMemo, useState } from 'react'
import { api, qs, useApi } from '@/lib/api'
import { fmtDateTime, humanize, inr } from '@/lib/format'
import {
    Alert, Async, Button, Card, DataTable, Empty, Field, Icon, Input, Modal, NumberInput, PageHeader, Select, Tabs, useAction, useDebounced, useToast, type Column,
} from '@/components/ui'

/** WEB-03 Approval matrix, numbering series and audit log. */

interface Rule {
    id: string; branch_id: string | null; doc_type: string; step_order: number; min_amount: number; max_amount: number | null; max_inclusive: boolean
    approver_role_id: string; requires_client_signoff: boolean; prevent_self_approval: boolean; is_active: boolean; approver_role: { code: string; name: string }
}
interface RoleOpt { id: string; code: string; name: string }
interface Band { key: string; doc_type: string; min: number; max: number | null; inclusive: boolean; branch_id: string | null; active: boolean; rules: Rule[] }

const DOC_TYPES: { id: string; title: string; note: string }[] = [
    { id: 'PO', title: 'Purchase orders', note: 'Amount is the PO value before GST.' },
    { id: 'PETTY_CASH_REQ', title: 'Petty cash requests', note: 'Amount requested for a site.' },
    { id: 'PETTY_CASH_REPLENISH', title: 'Petty cash replenishments', note: 'Amount of the top-up.' },
    { id: 'EXTRA_WORK', title: 'Extra work (variations)', note: 'Usually one band for any amount; the last step can require the client to sign off.' },
    { id: 'WORK_ORDER', title: 'Client work orders', note: 'Sign-off before a client order is accepted.' },
    { id: 'SUBCON_WO', title: 'Subcontractor work orders', note: 'Amount is the work order value.' },
]
const docTitle = (id: string) => DOC_TYPES.find(d => d.id === id)?.title ?? humanize(id)

type TabId = 'rules' | 'numbering' | 'audit'

export default function RulesPage() {
    const [tab, setTab] = useState<TabId>('rules')
    return (
        <>
            <PageHeader
                title="Approval matrix and numbering"
                subtitle="Who approves what at which amount, how document numbers are issued, and a trail of every administrative change. Changes apply to new documents only; approvals already in progress keep the steps they started with."
            />
            <Tabs<TabId> tabs={[{ id: 'rules', label: 'Approval rules' }, { id: 'numbering', label: 'Numbering series' }, { id: 'audit', label: 'Audit log' }]} value={tab} onChange={setTab} />
            {tab === 'rules' ? <ApprovalRules /> : tab === 'numbering' ? <Numbering /> : <AuditLog />}
        </>
    )
}

// ---------------------------------------------------------------------------------------------- band helpers
const money = (v: number) => (Number.isInteger(v) ? inr(v) : inr(v, true))
/** The seed (and finance practice) writes "above 1,00,000" as a minimum of 100000.01. */
const plusPaisa = (min: number) => min > 0 && Math.round((min - Math.floor(min)) * 100) === 1

function bandLabel(min: number, max: number | null, inclusive: boolean): string {
    const above = plusPaisa(min)
    const lo = above ? Math.floor(min) : min
    if (max === null) return min <= 0 ? 'Any amount' : above ? `Above ${money(lo)}` : `${money(lo)} and above`
    if (min <= 0) return inclusive ? `Up to ${money(max)}` : `Below ${money(max)}`
    if (above) return `Above ${money(lo)} ${inclusive ? 'up to' : 'and below'} ${money(max)}`
    return `${money(lo)} to ${inclusive ? '' : 'below '}${money(max)}`
}

function sentence(label: string, steps: { name: string; client?: boolean }[]): string {
    if (!steps.length) return `${label}: no approver chosen yet`
    return `${label}: ${steps.map(s => s.name + (s.client ? ' (with client sign-off)' : '')).join(', then ')}`
}

function groupBands(items: Rule[]): Band[] {
    const map = new Map<string, Band>()
    for (const r of items) {
        const key = [r.doc_type, r.min_amount, r.max_amount, r.max_inclusive, r.branch_id, r.is_active].join('|')
        const b = map.get(key) ?? { key, doc_type: r.doc_type, min: r.min_amount, max: r.max_amount, inclusive: r.max_inclusive, branch_id: r.branch_id, active: r.is_active, rules: [] }
        b.rules.push(r)
        map.set(key, b)
    }
    for (const b of map.values()) b.rules.sort((a, c) => a.step_order - c.step_order)
    return [...map.values()].sort((a, b) => a.min - b.min || (a.max ?? Infinity) - (b.max ?? Infinity))
}

type Span = Pick<Band, 'min' | 'max' | 'inclusive'>
const upperAllows = (b: Span, x: number) => b.max === null || x < b.max || (b.inclusive && x === b.max)
const overlaps = (a: Span, b: Span) => upperAllows(b, a.min) && upperAllows(a, b.min)

/** Overlaps are errors (an amount would match two bands); gaps are warnings (an amount would match nothing and the document is blocked). */
function coverage(bands: (Span & { branch_id: string | null })[]) {
    const overlapPairs: [Span, Span][] = []
    const gaps: string[] = []
    const byBranch = new Map<string, typeof bands>()
    for (const b of bands) byBranch.set(b.branch_id ?? '', [...(byBranch.get(b.branch_id ?? '') ?? []), b])
    for (const list of byBranch.values()) {
        const s = [...list].sort((a, b) => a.min - b.min)
        if (!s.length) continue
        if (s[0].min > 0) gaps.push(`Amounts below ${money(s[0].min)} have no rule`)
        for (let i = 0; i < s.length - 1; i++) {
            const a = s[i], b = s[i + 1]
            if (overlaps(a, b)) { overlapPairs.push([a, b]); continue }
            if (a.max !== null) {
                const gap = b.min - a.max
                if (gap > (a.inclusive ? 0.011 : 0.0001)) gaps.push(`Amounts between ${money(a.max)} and ${money(b.min)} have no rule`)
            }
        }
        const last = s[s.length - 1]
        if (last.max !== null) gaps.push(`Amounts above ${money(last.max)} have no rule`)
    }
    return { overlapPairs, gaps }
}

// ---------------------------------------------------------------------------------------------- approval rules
function ApprovalRules() {
    const state = useApi<{ items: Rule[]; roles: RoleOpt[] }>('/admin/approval-rules')
    const { run, busy } = useAction()
    const [showInactive, setShowInactive] = useState(false)
    const [editor, setEditor] = useState<{ docType: string; band: Band | null } | null>(null)
    const [removing, setRemoving] = useState<Band | null>(null)

    async function deactivate(b: Band) {
        const ok = await run(async () => { for (const r of b.rules) await api.del(`/admin/approval-rules/${r.id}`) }, 'Band deactivated')
        setRemoving(null)
        await state.reload()
        return ok
    }
    async function reactivate(b: Band) {
        await run(async () => {
            for (const r of b.rules) {
                await api.put(`/admin/approval-rules/${r.id}`, {
                    doc_type: r.doc_type, step_order: r.step_order, min_amount: r.min_amount, max_amount: r.max_amount, max_inclusive: r.max_inclusive,
                    approver_role_id: r.approver_role_id, requires_client_signoff: r.requires_client_signoff, prevent_self_approval: r.prevent_self_approval, branch_id: r.branch_id, is_active: true,
                })
            }
        }, 'Band reactivated')
        await state.reload()
    }

    return (
        <Async state={state}>
            {d => {
                const bands = groupBands(d.items)
                const types = [...DOC_TYPES.map(t => t.id), ...[...new Set(d.items.map(r => r.doc_type))].filter(t => !DOC_TYPES.some(x => x.id === t))]
                return (
                    <>
                        <div className="row" style={{ marginBottom: 12 }}>
                            <label className="checkbox"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />Show deactivated bands</label>
                            <span className="muted small">A band is an amount range. Each band has one or more approval steps, done in order.</span>
                        </div>
                        {types.map(t => {
                            const all = bands.filter(b => b.doc_type === t)
                            const active = all.filter(b => b.active)
                            const shown = showInactive ? all : active
                            const cov = coverage(active)
                            const meta = DOC_TYPES.find(x => x.id === t)
                            return (
                                <Card key={t} title={docTitle(t)} sub={meta?.note} actions={<Button size="sm" icon="add" onClick={() => setEditor({ docType: t, band: null })}>Add band</Button>}>
                                    {cov.overlapPairs.length ? <Alert tone="danger">Overlapping bands: {cov.overlapPairs.map(([a, b]) => `"${bandLabel(a.min, a.max, a.inclusive)}" and "${bandLabel(b.min, b.max, b.inclusive)}"`).join('; ')}. An amount in the overlap would get more steps than intended.</Alert> : null}
                                    {cov.gaps.length ? <Alert tone="warn">Gap in coverage: {cov.gaps.join('. ')}. Documents at those amounts cannot be submitted until a band covers them.</Alert> : null}
                                    {!shown.length ? <Empty title="No approval bands yet" icon="rule">Documents of this type cannot be approved until you add a band.</Empty> : (
                                        <div style={{ display: 'grid', gap: 10 }}>
                                            {shown.map(b => <BandRow key={b.key} band={b} busy={busy} onEdit={() => setEditor({ docType: t, band: b })} onDeactivate={() => setRemoving(b)} onReactivate={() => void reactivate(b)} />)}
                                        </div>
                                    )}
                                </Card>
                            )
                        })}

                        {editor ? (
                            <BandEditor
                                key={editor.band?.key ?? `new-${editor.docType}`}
                                docType={editor.docType}
                                band={editor.band}
                                siblings={bands.filter(b => b.doc_type === editor.docType && b.active && b.key !== editor.band?.key)}
                                roles={d.roles}
                                onClose={() => setEditor(null)}
                                onSaved={async () => { setEditor(null); await state.reload() }}
                            />
                        ) : null}
                        <Modal open={!!removing} title="Deactivate approval band" onClose={() => setRemoving(null)} footer={<>
                            <Button onClick={() => setRemoving(null)}>Keep active</Button>
                            <Button variant="danger-solid" loading={busy} onClick={() => removing && void deactivate(removing)}>Deactivate band</Button>
                        </>}>
                            {removing ? (
                                <>
                                    <p style={{ marginTop: 0 }}><strong>{docTitle(removing.doc_type)}: {bandLabel(removing.min, removing.max, removing.inclusive)}</strong></p>
                                    <Alert tone="warn">New {docTitle(removing.doc_type).toLowerCase()} at these amounts will be blocked (&quot;No approval rule is configured&quot;) until another band covers them.</Alert>
                                    <p className="muted small" style={{ marginBottom: 0 }}>Approvals already in progress are not affected. You can reactivate the band later.</p>
                                </>
                            ) : null}
                        </Modal>
                    </>
                )
            }}
        </Async>
    )
}

function BandRow({ band, busy, onEdit, onDeactivate, onReactivate }: { band: Band; busy: boolean; onEdit: () => void; onDeactivate: () => void; onReactivate: () => void }) {
    const label = bandLabel(band.min, band.max, band.inclusive)
    return (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', opacity: band.active ? 1 : 0.65 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                        <span className="strong" style={{ fontSize: 14 }}>{label}</span>
                        {!band.active ? <span className="badge">Deactivated</span> : null}
                        {band.branch_id ? <span className="badge purple">Branch-specific</span> : null}
                    </div>
                    <div className="chain">
                        {band.rules.map((r, i) => (
                            <span key={r.id} style={{ display: 'contents' }}>
                                {i > 0 ? <span className="arrow" aria-hidden="true">→</span> : null}
                                <span className="step PENDING" style={{ flexWrap: 'wrap' }}>
                                    <span className="muted" style={{ fontWeight: 600 }}>{i + 1}.</span> {r.approver_role.name}
                                    {r.requires_client_signoff ? <span className="badge purple">Client sign-off</span> : null}
                                    {!r.prevent_self_approval ? <span className="badge" title="The person who raised the document may also approve this step">Self-approval allowed</span> : null}
                                </span>
                            </span>
                        ))}
                    </div>
                    <div className="muted small" style={{ marginTop: 8 }}>{sentence(label, band.rules.map(r => ({ name: r.approver_role.name, client: r.requires_client_signoff })))}</div>
                </div>
                <div className="actions">
                    <Button size="sm" icon="edit" onClick={onEdit}>Edit</Button>
                    {band.active ? <Button size="sm" variant="danger" icon="block" onClick={onDeactivate}>Deactivate</Button> : <Button size="sm" icon="undo" loading={busy} onClick={onReactivate}>Reactivate</Button>}
                </div>
            </div>
        </div>
    )
}

interface StepForm { id?: string; role_id: string; client: boolean; self: boolean }

function BandEditor({ docType, band, siblings, roles, onClose, onSaved }: { docType: string; band: Band | null; siblings: Band[]; roles: RoleOpt[]; onClose: () => void; onSaved: () => Promise<void> }) {
    const formId = useId()
    const toast = useToast()
    const suggestedMin = siblings.length ? Math.max(...siblings.map(s => (s.max === null ? 0 : s.max))) : 0
    const [min, setMin] = useState<number | ''>(band ? band.min : suggestedMin)
    const [max, setMax] = useState<number | ''>(band ? (band.max ?? '') : '')
    const [inclusive, setInclusive] = useState(band?.inclusive ?? false)
    const [active, setActive] = useState(band?.active ?? true)
    const [steps, setSteps] = useState<StepForm[]>(band ? band.rules.map(r => ({ id: r.id, role_id: r.approver_role_id, client: r.requires_client_signoff, self: r.prevent_self_approval })) : [{ role_id: '', client: false, self: true }])
    const [tried, setTried] = useState(false)
    const [busy, setBusy] = useState(false)
    const [serverError, setServerError] = useState<string | null>(null)

    const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? ''
    const minN = min === '' ? NaN : min
    const maxN = max === '' ? null : max

    const errors: string[] = []
    if (min === '' || !Number.isFinite(minN) || minN < 0) errors.push('Enter a minimum amount of 0 or more.')
    if (maxN !== null && Number.isFinite(minN) && maxN < minN) errors.push('The maximum amount cannot be below the minimum.')
    if (maxN !== null && Number.isFinite(minN) && maxN === minN && !inclusive) errors.push('With the same minimum and maximum, tick "include the maximum" or the band is empty.')
    if (!steps.length) errors.push('Add at least one approval step.')
    if (steps.some(s => !s.role_id)) errors.push('Choose an approver role for every step.')
    const dupAdjacent = steps.some((s, i) => i > 0 && s.role_id && s.role_id === steps[i - 1].role_id)
    const span: Span | null = Number.isFinite(minN) ? { min: minN, max: maxN, inclusive: maxN !== null && inclusive } : null
    if (span && active) {
        const clash = siblings.find(s => overlaps(span, s))
        if (clash) errors.push(`This band overlaps "${bandLabel(clash.min, clash.max, clash.inclusive)}". Change the amounts so each amount belongs to one band only.`)
    }
    const cov = span && active ? coverage([...siblings, { ...span, branch_id: band?.branch_id ?? null }]) : null
    const label = span ? bandLabel(span.min, span.max, span.inclusive) : 'Amount range'
    const preview = sentence(label, steps.filter(s => s.role_id).map(s => ({ name: roleName(s.role_id), client: s.client })))

    const move = (i: number, d: -1 | 1) => setSteps(s => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return n;[n[i], n[j]] = [n[j], n[i]]; return n })
    const patch = (i: number, p: Partial<StepForm>) => setSteps(s => s.map((x, k) => (k === i ? { ...x, ...p } : x)))

    async function submit(ev: React.FormEvent) {
        ev.preventDefault()
        setTried(true)
        setServerError(null)
        if (errors.length) return
        const bodyFor = (s: StepForm, i: number) => ({
            doc_type: docType, step_order: i + 1, min_amount: minN, max_amount: maxN, max_inclusive: maxN !== null && inclusive,
            approver_role_id: s.role_id, requires_client_signoff: s.client, prevent_self_approval: s.self, branch_id: band?.branch_id ?? null, is_active: active,
        })
        setBusy(true)
        try {
            for (const [i, s] of steps.entries()) {
                if (s.id) await api.put(`/admin/approval-rules/${s.id}`, bodyFor(s, i))
                else await api.post('/admin/approval-rules', bodyFor(s, i))
            }
            for (const r of band?.rules ?? []) if (!steps.some(s => s.id === r.id)) await api.del(`/admin/approval-rules/${r.id}`)
            toast.success(band ? 'Approval band updated' : 'Approval band added')
            await onSaved()
        } catch (x) {
            setServerError(x instanceof Error ? x.message : 'Could not save this band')
            await onSaved().catch(() => null)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal open wide title={`${band ? 'Edit' : 'Add'} approval band: ${docTitle(docType)}`} onClose={onClose} footer={<>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" form={formId} loading={busy}>{band ? 'Save band' : 'Add band'}</Button>
        </>}>
            <form id={formId} onSubmit={e => void submit(e)} noValidate>
                {serverError ? <Alert tone="danger">{serverError} Some steps may already have been saved; the list behind this window has been refreshed.</Alert> : null}
                {tried && errors.length ? <Alert tone="danger"><strong>Fix this before saving:</strong><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{errors.map(e => <li key={e}>{e}</li>)}</ul></Alert> : null}
                <div className="form-grid">
                    <Field label="From amount (₹) *" hint="This amount is part of the band">
                        <NumberInput value={min} onChange={setMin} step="any" min={0} />
                    </Field>
                    <Field label="Up to amount (₹)" hint="Leave blank for no upper limit">
                        <NumberInput value={max} onChange={setMax} step="any" min={0} />
                    </Field>
                    <div className="full" style={{ marginBottom: 12 }}>
                        <label className="checkbox"><input type="checkbox" checked={inclusive && max !== ''} disabled={max === ''} onChange={e => setInclusive(e.target.checked)} />Include the &quot;up to&quot; amount in this band (otherwise the band stops just below it)</label>
                    </div>
                </div>

                <h4 style={{ fontSize: 13, margin: '4px 0 8px' }}>Approval steps, in order</h4>
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                    {steps.map((s, i) => (
                        <div key={s.id ?? `n${i}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                            <div className="row" style={{ alignItems: 'flex-end' }}>
                                <span className="strong" style={{ width: 22 }}>{i + 1}.</span>
                                <div style={{ flex: '1 1 200px' }}>
                                    <Field label="Approver role" className="" >
                                        <Select value={s.role_id} onChange={e => patch(i, { role_id: e.target.value })}>
                                            <option value="">Select role...</option>
                                            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                        </Select>
                                    </Field>
                                </div>
                                <div className="actions" style={{ marginBottom: 12 }}>
                                    <Button size="sm" icon="arrow_upward" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
                                    <Button size="sm" icon="arrow_downward" aria-label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => move(i, 1)} />
                                    <Button size="sm" variant="danger" icon="delete" aria-label={`Remove step ${i + 1}`} disabled={steps.length === 1} onClick={() => setSteps(x => x.filter((_, k) => k !== i))} />
                                </div>
                            </div>
                            <div className="row" style={{ gap: 18 }}>
                                <label className="checkbox"><input type="checkbox" checked={s.self} onChange={e => patch(i, { self: e.target.checked })} />Person who raised it cannot approve this step</label>
                                <label className="checkbox"><input type="checkbox" checked={s.client} onChange={e => patch(i, { client: e.target.checked })} />Needs the client&apos;s sign-off</label>
                            </div>
                        </div>
                    ))}
                    <div><Button size="sm" icon="add" disabled={steps.length >= 6} onClick={() => setSteps(x => [...x, { role_id: '', client: false, self: true }])}>Add step{steps.length >= 6 ? ' (6 is the maximum)' : ''}</Button></div>
                </div>
                {dupAdjacent ? <Alert tone="warn">Two steps in a row use the same role. That is allowed, but the same person could be asked twice.</Alert> : null}
                {steps.some(s => !s.self) ? <Alert tone="warn">A step without the self-approval block lets the person who raised the document approve it. Use only where one person really does both jobs.</Alert> : null}
                {cov && !errors.length && cov.gaps.length ? <Alert tone="warn">After this change: {cov.gaps.join('. ')}.</Alert> : null}

                <div style={{ background: 'var(--primary-light)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                    <div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>How this reads</div>
                    <div className="strong" aria-live="polite">{preview}</div>
                </div>
                {band ? (
                    <label className="checkbox"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Band is active</label>
                ) : null}
            </form>
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- numbering series
interface Series { id: string; doc_type: string; branch: { code: string } | null; fy_code: string; prefix: string; current_seq: number; pad_length: number; is_active: boolean; scope_key: string; next_number: string }
const SERIES_NAMES: Record<string, string> = {
    PROJECT: 'Projects', ENQUIRY: 'Enquiries', QUOTATION: 'Quotations', BOQ: 'BOQs', WORK_ORDER: 'Client work orders', VARIATION: 'Extra work (variations)',
    PO: 'Purchase orders', GRN: 'Goods receipts (GRN)', MATERIAL_REQUEST: 'Material requests', PURCHASE_INV: 'Purchase invoices', SALES_INV: 'Client invoices',
    RECEIPT: 'Client receipts', PC_VOUCHER: 'Petty cash vouchers', PC_RECON: 'Petty cash reconciliations', SITE_ISSUE: 'Site issues',
    SUBCON_WO: 'Subcontractor work orders', SUBCON_BILL: 'Subcontractor running bills',
}
const pad = (prefix: string, n: number, len: number) => `${prefix}${String(n).padStart(len, '0')}`

function Numbering() {
    const state = useApi<{ items: Series[] }>('/admin/numbering-series')
    const projects = useApi<{ items: { sites?: { id: string; code: string }[] }[] }>('/projects')
    const siteCode = useMemo(() => new Map((projects.data?.items ?? []).flatMap(p => p.sites ?? []).map(x => [x.id, x.code])), [projects.data])
    const [editing, setEditing] = useState<Series | null>(null)
    const columns: Column<Series>[] = [
        { key: 'doc', header: 'Document', render: s => <div><div className="strong">{SERIES_NAMES[s.doc_type] ?? humanize(s.doc_type)}</div><div className="muted small mono">{s.doc_type}</div></div> },
        { key: 'branch', header: 'Branch', render: s => s.branch?.code ?? <span className="muted">All branches</span> },
        { key: 'fy', header: 'Financial year', render: s => s.fy_code },
        { key: 'scope', header: 'Site', render: s => s.scope_key ? <span className="small" title={s.scope_key}>{siteCode.get(s.scope_key) ?? (UUID.test(s.scope_key) ? `Site ${s.scope_key.slice(0, 8)}` : s.scope_key)}</span> : <span className="muted">—</span> },
        { key: 'prefix', header: 'Prefix', render: s => <code>{s.prefix}</code> },
        { key: 'pad', header: 'Digits', align: 'right', render: s => s.pad_length },
        { key: 'seq', header: 'Last used', align: 'right', render: s => s.current_seq },
        { key: 'next', header: 'Next number', render: s => <span className="strong mono">{s.next_number}</span> },
        { key: 'actions', header: 'Actions', align: 'right', render: s => <Button size="sm" icon="edit" onClick={() => setEditing(s)} aria-label={`Edit numbering for ${SERIES_NAMES[s.doc_type] ?? humanize(s.doc_type)}`}>Edit</Button> },
    ]
    return (
        <Card title="Numbering series" sub="Each document type counts up from its own series. Numbers are issued without gaps, one per saved document.">
            <Alert tone="warn">Be careful here. The counter can only be moved forward: setting it lower would make the system issue a number that already exists, so the server refuses it. A changed prefix or digit count affects only new documents; numbers already issued keep their old format.</Alert>
            <Async state={state}>
                {d => <DataTable columns={columns} rows={d.items} empty={<Empty title="No numbering series" />} />}
            </Async>
            {editing ? <SeriesEditor key={editing.id} series={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await state.reload() }} /> : null}
        </Card>
    )
}

function SeriesEditor({ series, onClose, onSaved }: { series: Series; onClose: () => void; onSaved: () => Promise<void> }) {
    const formId = useId()
    const toast = useToast()
    const [prefix, setPrefix] = useState(series.prefix)
    const [padLen, setPadLen] = useState<number | ''>(series.pad_length)
    const [seq, setSeq] = useState<number | ''>(series.current_seq)
    const [busy, setBusy] = useState(false)
    const [serverError, setServerError] = useState<string | null>(null)
    const [tried, setTried] = useState(false)

    const errors: Record<string, string> = {}
    if (!prefix.trim() || prefix.length > 30) errors.prefix = 'Prefix is required and can be up to 30 characters'
    if (padLen === '' || !Number.isInteger(padLen) || padLen < 1 || padLen > 8) errors.pad = 'Digits must be a whole number from 1 to 8'
    if (seq === '' || !Number.isInteger(seq) || seq < 0) errors.seq = 'Enter a whole number, 0 or more'
    else if (seq < series.current_seq) errors.seq = `Cannot go below ${series.current_seq}. Numbers up to ${pad(series.prefix, series.current_seq, series.pad_length)} have already been issued and would be issued again.`
    const showErr = (k: string) => (tried || (k === 'seq' && typeof seq === 'number' && seq < series.current_seq) ? errors[k] : undefined)
    const nextPreview = typeof seq === 'number' && typeof padLen === 'number' && padLen > 0 ? pad(prefix, seq + 1, padLen) : '—'

    async function submit(ev: React.FormEvent) {
        ev.preventDefault()
        setTried(true); setServerError(null)
        if (Object.keys(errors).length) return
        setBusy(true)
        try {
            await api.put(`/admin/numbering-series/${series.id}`, { prefix, pad_length: padLen, ...(seq !== series.current_seq ? { current_seq: seq } : {}) })
            toast.success('Numbering series updated')
            await onSaved()
        } catch (x) {
            setServerError(x instanceof Error ? x.message : 'Could not save the series')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal open title={`Edit numbering: ${SERIES_NAMES[series.doc_type] ?? humanize(series.doc_type)} (${series.fy_code})`} onClose={onClose} footer={<>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" form={formId} loading={busy}>Save series</Button>
        </>}>
            <form id={formId} onSubmit={e => void submit(e)} noValidate>
                {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
                <Alert tone="warn">Lowering the counter can cause duplicate document numbers. You can only keep it as is or move it forward (for example to skip a block of numbers).</Alert>
                <div className="form-grid">
                    <Field label="Prefix *" hint="Printed before the number, for example PO-JPR-2026-" error={showErr('prefix')}><Input value={prefix} maxLength={30} onChange={e => setPrefix(e.target.value)} autoFocus /></Field>
                    <Field label="Digits *" hint="Number is zero-padded to this width" error={showErr('pad')}><NumberInput value={padLen} onChange={setPadLen} min={1} max={8} /></Field>
                    <Field label="Last number used" hint={`Currently ${series.current_seq}. The next document gets this number plus one.`} error={showErr('seq')}><NumberInput value={seq} onChange={setSeq} min={0} /></Field>
                    <Field label="Next document will be numbered"><div className="strong mono" style={{ fontSize: 16, padding: '6px 0' }}>{nextPreview}</div></Field>
                </div>
            </form>
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- audit log
interface AuditRow { id: number; ts: string; action: string; doc_type: string | null; doc_id: string | null; doc_no: string | null; reason: string | null; details: unknown; actor: { full_name: string } | null }
const KNOWN_DOC_TYPES = ['USER', 'ROLE', 'APPROVAL_RULE', 'NUMBERING_SERIES', 'EXCEPTION', 'PO', 'WORKFLOW', 'MASTER']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function AuditLog() {
    const [docType, setDocType] = useState('')
    const [docId, setDocId] = useState('')
    const [limit, setLimit] = useState('100')
    const [action, setAction] = useState('')
    const [search, setSearch] = useState('')
    const dt = useDebounced(docType.trim().toUpperCase(), 400)
    const idOk = !docId || UUID.test(docId.trim())
    const state = useApi<{ items: AuditRow[] }>(`/admin/audit-log${qs({ doc_type: dt, doc_id: docId && idOk ? docId.trim() : '', limit })}`)

    const items = state.data?.items
    const actions = useMemo(() => [...new Set((items ?? []).map(r => r.action))].sort(), [items])
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (items ?? []).filter(r => (!action || r.action === action) && (!q || [r.actor?.full_name ?? 'system', r.action, r.doc_type ?? '', r.doc_no ?? '', r.reason ?? ''].some(s => s.toLowerCase().includes(q))))
    }, [items, action, search])

    const columns: Column<AuditRow>[] = [
        { key: 'ts', header: 'When', render: r => <span className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.ts)}</span> },
        { key: 'actor', header: 'Who', render: r => r.actor?.full_name ?? <span className="muted">System</span> },
        { key: 'action', header: 'What', render: r => <span className={`badge ${/DEACTIVATED|DELETED|REJECTED/.test(r.action) ? 'warning' : /CREATED|ENROLLED/.test(r.action) ? 'success' : 'info'}`}>{humanize(r.action)}</span> },
        { key: 'doc', header: 'Record', render: r => <div className="small"><div>{r.doc_no ?? (r.doc_type ? humanize(r.doc_type) : '—')}</div>{r.doc_no && r.doc_type ? <div className="muted">{humanize(r.doc_type)}</div> : null}</div> },
        { key: 'reason', header: 'Reason', render: r => r.reason ? <span className="small">{r.reason}</span> : <span className="muted">—</span> },
        {
            key: 'details', header: 'Details', render: r => {
                const empty = !r.details || (typeof r.details === 'object' && !Object.keys(r.details as object).length)
                return empty ? <span className="muted">—</span> : (
                    <details>
                        <summary className="small" style={{ cursor: 'pointer', color: 'var(--primary)' }}>Show</summary>
                        <pre className="small mono" style={{ margin: '6px 0 0', maxWidth: 380, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(r.details, null, 2)}</pre>
                    </details>
                )
            },
        },
    ]

    return (
        <Card title="Audit log" sub="Every change to users, rules, numbering, masters and documents. Entries cannot be edited or deleted.">
            <div className="row" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ width: 190 }}>
                    <Field label="Record type" hint="Server filter, e.g. APPROVAL_RULE">
                        <Input list="audit-doc-types" value={docType} onChange={e => setDocType(e.target.value)} placeholder="All types" />
                    </Field>
                    <datalist id="audit-doc-types">{KNOWN_DOC_TYPES.map(t => <option key={t} value={t} />)}</datalist>
                </div>
                <div style={{ width: 290 }}>
                    <Field label="Record ID" hint="Paste a record's ID to see its history" error={idOk ? undefined : 'That is not a valid ID (36 characters with dashes)'}>
                        <Input value={docId} onChange={e => setDocId(e.target.value)} placeholder="Any record" />
                    </Field>
                </div>
                <div style={{ width: 130 }}>
                    <Field label="Show latest">
                        <Select value={limit} onChange={e => setLimit(e.target.value)}>
                            {['50', '100', '200'].map(n => <option key={n} value={n}>{n} entries</option>)}
                        </Select>
                    </Field>
                </div>
                <div style={{ width: 220 }}>
                    <Field label="Action (in loaded entries)">
                        <Select value={action} onChange={e => setAction(e.target.value)}>
                            <option value="">All actions</option>
                            {actions.map(a => <option key={a} value={a}>{humanize(a)}</option>)}
                        </Select>
                    </Field>
                </div>
                <div style={{ flex: '1 1 200px', maxWidth: 280 }}>
                    <Field label="Search (in loaded entries)">
                        <Input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Person, action, number, reason" />
                    </Field>
                </div>
            </div>
            <Async state={state}>
                {() => (
                    <>
                        <div className="muted small" style={{ marginBottom: 8 }} role="status">
                            {state.loading ? 'Updating...' : `${rows.length} of ${items?.length ?? 0} loaded entries`}
                            {items && items.length >= Number(limit) ? <> <Icon name="info" /> Only the newest {limit} are loaded; narrow the filters or raise the limit to go further back.</> : null}
                        </div>
                        <DataTable columns={columns} rows={rows} rowKey={r => String(r.id)} empty={<Empty title="No entries match" icon="history">Change the filters above.</Empty>} />
                    </>
                )}
            </Async>
        </Card>
    )
}
