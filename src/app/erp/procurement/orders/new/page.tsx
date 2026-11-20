'use client'
import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api, useApi } from '@/lib/api'
import { inr, isoDate, qty, toNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import {
    Alert, ApprovalChain, Button, Card, DataTable, Field, Icon, Input, Kpi, Loading, NumberInput, PageHeader, ProjectSelect, Select, Textarea, useAction,
} from '@/components/ui'
import { PURCHASERS, bandLabel, matchRules, useApprovalRules, useItemCatalogue, type ItemInfo } from '../../_lib'

interface RfqForPo {
    id: string
    rfq_no: string
    status: string
    project_id: string
    site_id: string | null
    awarded_vendor_id: string | null
    awarded_vendor: string | null
    lines: { rfq_line_id: string; item_id: string; item: string; qty: number; boq_line_id: string | null; material_request_id: string | null; rates: { vendor_id: string; rate: number | null }[] }[]
    vendors: { vendor_id: string; delivery_days: number | null; payment_terms_days: number | null }[]
}
interface VendorRow { id: string; code: string; legal_name: string; rating: number | null; is_active: boolean; payment_terms_days: number | null }
interface ProjectDetail {
    id: string
    project_code: string
    status: string
    sites: { id: string; code: string; name: string; city: string }[]
    boq_lines: { id: string; code: string; description: string; cost_centre: { code: string } }[]
}
interface Breach { item_id: string; item: string; planned: number; ordered_before: number; ordering_now: number; over_qty: number; over_value: number; unbudgeted: boolean }
interface Created { id: string; po_no: string; subtotal_amount: number; gst_amount: number; total_amount: number; boq_breach_flag: boolean; approval_chain: { step: number; role: string; status: string }[]; boq_breaches: Breach[] }

interface LineState { key: number; item_id: string; qty: number | ''; rate: number | ''; boq_line_id: string; material_request_id: string | null }

export default function NewPurchaseOrderPage() {
    return <Suspense fallback={<Loading />}><Loader /></Suspense>
}

/** Loads the RFQ (when coming from "Create purchase order") and the item catalogue, then mounts the form with that data as its starting state. */
function Loader() {
    const rfqId = useSearchParams().get('rfq_id')
    const { can } = useSession()
    const rfq = useApi<RfqForPo>(rfqId ? `/procurement/rfqs/${rfqId}` : null)
    const catalogue = useItemCatalogue()
    if (!can(...PURCHASERS)) {
        return (
            <>
                <PageHeader title="New purchase order" />
                <Alert tone="warn">Only the Purchase Manager or Director can raise purchase orders. You can review existing orders from the <Link href="/erp/procurement/orders">purchase order list</Link>.</Alert>
            </>
        )
    }
    if (rfqId && rfq.error && !rfq.data) return <><PageHeader title="New purchase order" /><Alert tone="danger">Could not load the RFQ: {rfq.error}</Alert></>
    if ((rfqId && !rfq.data) || catalogue.loading) return <Loading />
    if (catalogue.error) return <Alert tone="danger">Could not load the item master: {catalogue.error}</Alert>
    return <PoForm key={rfq.data?.id ?? 'blank'} rfq={rfq.data} items={catalogue.items} byId={catalogue.byId} />
}

let lineKey = 0
const newLine = (p: Partial<LineState> = {}): LineState => ({ key: ++lineKey, item_id: '', qty: '', rate: '', boq_line_id: '', material_request_id: null, ...p })

function PoForm({ rfq, items, byId }: { rfq: RfqForPo | null; items: ItemInfo[]; byId: Map<string, ItemInfo> }) {
    const { user } = useSession()
    const { run, busy } = useAction()
    const vendorsApi = useApi<{ items: VendorRow[] }>('/masters/vendors?limit=200')
    const rules = useApprovalRules()

    const awardedQuote = rfq?.vendors.find(v => v.vendor_id === rfq.awarded_vendor_id)
    const [projectId, setProjectId] = useState(rfq?.project_id ?? '')
    const [siteId, setSiteId] = useState(rfq?.site_id ?? '')
    const [vendorId, setVendorId] = useState(rfq?.awarded_vendor_id ?? '')
    const [dest, setDest] = useState<'CENTRAL_STORE' | 'DIRECT_TO_SITE'>('DIRECT_TO_SITE')
    const [expected, setExpected] = useState(() => {
        if (awardedQuote?.delivery_days == null) return ''
        const d = new Date(); d.setDate(d.getDate() + awardedQuote.delivery_days); return isoDate(d)
    })
    const [terms, setTerms] = useState<number | '' | null>(awardedQuote?.payment_terms_days ?? null)
    const [remarks, setRemarks] = useState(rfq ? `Raised from ${rfq.rfq_no}` : '')
    const [lines, setLines] = useState<LineState[]>(() => rfq && rfq.awarded_vendor_id
        ? rfq.lines.map(l => newLine({ item_id: l.item_id, qty: l.qty, rate: l.rates.find(r => r.vendor_id === rfq.awarded_vendor_id)?.rate ?? byId.get(l.item_id)?.std_rate ?? '', boq_line_id: l.boq_line_id ?? '', material_request_id: l.material_request_id }))
        : rfq ? rfq.lines.map(l => newLine({ item_id: l.item_id, qty: l.qty, rate: byId.get(l.item_id)?.std_rate ?? '', boq_line_id: l.boq_line_id ?? '', material_request_id: l.material_request_id }))
            : [newLine()])
    const [created, setCreated] = useState<Created | null>(null)

    const project = useApi<ProjectDetail>(projectId ? `/projects/${projectId}` : null)
    const sites = project.data?.sites ?? []
    const effectiveSite = siteId || (sites.length === 1 ? sites[0].id : '')
    const vendor = vendorsApi.data?.items.find(v => v.id === vendorId)
    const effectiveTerms = terms ?? vendor?.payment_terms_days ?? ''

    // Totals mirror the server: each line is rounded to paise, GST is the item's default HSN rate.
    const calc = useMemo(() => {
        const rows = lines.map(l => {
            const it = byId.get(l.item_id)
            const amount = Math.round(toNum(l.qty) * toNum(l.rate) * 100) / 100
            return { amount, gst: Math.round((amount * (it?.gst_pct ?? 0))) / 100 }
        })
        const subtotal = rows.reduce((s, r) => s + r.amount, 0)
        const gst = rows.reduce((s, r) => s + r.gst, 0)
        return { rows, subtotal, gst, total: subtotal + gst }
    }, [lines, byId])

    const tier = useMemo(() => (rules.data ? matchRules(rules.data.items, 'PO', user?.branch.id, calc.subtotal) : null), [rules.data, user, calc.subtotal])

    const setLine = (key: number, patch: Partial<LineState>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)))
    const pickItem = (key: number, itemId: string) => setLine(key, { item_id: itemId, rate: byId.get(itemId)?.std_rate ?? '' })

    const problems: string[] = []
    if (!projectId) problems.push('Choose the project')
    else if (project.data && project.data.status !== 'ACTIVE') problems.push('This project is not active')
    if (projectId && !effectiveSite && !project.loading) problems.push('Choose the site')
    if (!vendorId) problems.push('Choose the vendor')
    const used = new Set<string>()
    lines.forEach((l, i) => {
        if (!l.item_id) problems.push(`Line ${i + 1}: choose an item`)
        else if (used.has(l.item_id)) problems.push(`Line ${i + 1}: item already added on another line (merge the quantities)`)
        else used.add(l.item_id)
        if (!(toNum(l.qty) > 0)) problems.push(`Line ${i + 1}: enter a quantity above zero`)
        if (l.rate === '' || toNum(l.rate) < 0) problems.push(`Line ${i + 1}: enter the rate`)
    })

    const submit = async () => {
        const res = await run(() => api.post<Created>('/procurement/purchase-orders', {
            project_id: projectId,
            site_id: effectiveSite,
            vendor_id: vendorId,
            rfq_id: rfq?.id ?? null,
            delivery_destination: dest,
            expected_delivery_date: expected || undefined,
            payment_terms_days: effectiveTerms === '' ? undefined : effectiveTerms,
            remarks: remarks.trim() || undefined,
            lines: lines.map(l => ({ item_id: l.item_id, qty: toNum(l.qty), rate: toNum(l.rate), boq_line_id: l.boq_line_id || null, material_request_id: l.material_request_id })),
        }), 'Purchase order created')
        if (res) setCreated(res)
    }

    if (created) return <CreatedPanel po={created} />

    return (
        <>
            <PageHeader
                title="New purchase order"
                subtitle="Quantities are in the item's purchase unit. The approval route is chosen from the order value excluding GST."
                actions={<Link className="btn" href="/erp/procurement/orders"><Icon name="arrow_back" />Purchase orders</Link>}
            />
            {rfq ? (
                <Alert tone={rfq.awarded_vendor_id ? 'success' : 'warn'}>
                    Prefilled from <Link href={`/erp/procurement/rfqs/${rfq.id}`}>{rfq.rfq_no}</Link>
                    {rfq.awarded_vendor_id ? <>: awarded vendor, quoted rates and payment terms are filled in. You can still adjust them.</> : <>, which is not awarded yet. Lines are filled from standard cost; award a vendor first to use quoted rates.</>}
                </Alert>
            ) : null}

            <Card title="Order details">
                <div className="form-grid">
                    <Field label="Project">
                        <ProjectSelect value={projectId} status="ACTIVE" onChange={id => { setProjectId(id); setSiteId('') }} />
                    </Field>
                    <Field label="Site" hint={projectId && sites.length === 1 ? 'The project has one site.' : undefined}>
                        <Select value={effectiveSite} disabled={!projectId || project.loading} onChange={e => setSiteId(e.target.value)}>
                            <option value="">{project.loading ? 'Loading...' : 'Select site...'}</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}, {s.city}</option>)}
                        </Select>
                    </Field>
                    <Field label="Vendor" hint={vendor ? `Rating ${vendor.rating ?? '—'} · standard terms ${vendor.payment_terms_days ?? '—'} days` : undefined}>
                        <Select value={vendorId} onChange={e => setVendorId(e.target.value)} disabled={vendorsApi.loading}>
                            <option value="">{vendorsApi.loading ? 'Loading...' : 'Select vendor...'}</option>
                            {vendorsApi.data?.items.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.code} · {v.legal_name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Deliver to" hint={dest === 'DIRECT_TO_SITE' ? 'Goods are received straight into the site store.' : 'Goods are received in the central store, then issued to site from the Stock explorer.'}>
                        <Select value={dest} onChange={e => setDest(e.target.value as typeof dest)}>
                            <option value="DIRECT_TO_SITE">Direct to site</option>
                            <option value="CENTRAL_STORE">Central store</option>
                        </Select>
                    </Field>
                    <Field label="Expected delivery date"><Input type="date" value={expected} min={isoDate()} onChange={e => setExpected(e.target.value)} /></Field>
                    <Field label="Payment terms (days)"><NumberInput value={effectiveTerms} min={0} onChange={v => setTerms(v)} /></Field>
                    <Field label="Remarks" className="full"><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} style={{ minHeight: 50 }} /></Field>
                </div>
            </Card>

            <Card
                title="Items"
                sub="Rate defaults to the item's standard cost. Change it to the negotiated rate."
                actions={<Button size="sm" icon="add" onClick={() => setLines(ls => [...ls, newLine()])}>Add line</Button>}
            >
                <div className="table-wrap">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Item</th><th className="num" style={{ width: 130 }}>Quantity</th><th className="num" style={{ width: 130 }}>Rate</th><th>BOQ line</th><th className="num">Amount</th><th className="num">GST</th><th aria-label="Remove" />
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((l, i) => {
                                const it = byId.get(l.item_id)
                                const variance = it && it.std_rate > 0 && l.rate !== '' ? ((toNum(l.rate) - it.std_rate) / it.std_rate) * 100 : null
                                return (
                                    <tr key={l.key}>
                                        <td style={{ minWidth: 240 }}>
                                            <select className="select cell-input" aria-label={`Item for line ${i + 1}`} value={l.item_id} onChange={e => pickItem(l.key, e.target.value)}>
                                                <option value="">Select item...</option>
                                                {items.map(x => <option key={x.id} value={x.id}>{x.item_code} · {x.name}</option>)}
                                            </select>
                                            {it ? <div className="muted small" style={{ marginTop: 3 }}>Buy in {it.uom}{it.factor !== 1 ? ` · 1 ${it.uom} = ${qty(it.factor)} ${it.base_uom}` : ''} · GST {it.gst_pct}%</div> : null}
                                        </td>
                                        <td className="num">
                                            <input className="input num cell-input" type="number" min={0} step="any" aria-label={`Quantity for line ${i + 1}`} value={l.qty} onChange={e => setLine(l.key, { qty: e.target.value === '' ? '' : Number(e.target.value) })} />
                                            {it ? <div className="muted small">{it.uom}{it.factor !== 1 && toNum(l.qty) > 0 ? ` = ${qty(toNum(l.qty) * it.factor)} ${it.base_uom}` : ''}</div> : null}
                                        </td>
                                        <td className="num">
                                            <input className="input num cell-input" type="number" min={0} step="any" aria-label={`Rate for line ${i + 1}`} value={l.rate} onChange={e => setLine(l.key, { rate: e.target.value === '' ? '' : Number(e.target.value) })} />
                                            {it ? <div className="muted small">Standard {inr(it.std_rate)}{variance !== null && Math.abs(variance) >= 0.5 ? <span style={{ color: variance > 0 ? 'var(--danger)' : 'var(--success)' }}> ({variance > 0 ? '+' : ''}{variance.toFixed(1)}%)</span> : null}</div> : null}
                                        </td>
                                        <td style={{ minWidth: 180 }}>
                                            <select className="select cell-input" aria-label={`BOQ line for line ${i + 1}`} value={l.boq_line_id} onChange={e => setLine(l.key, { boq_line_id: e.target.value })} disabled={!projectId}>
                                                <option value="">No BOQ link</option>
                                                {project.data?.boq_lines.map(b => <option key={b.id} value={b.id}>{b.code} · {b.description.slice(0, 40)}</option>)}
                                            </select>
                                        </td>
                                        <td className="num">{inr(calc.rows[i].amount, true)}</td>
                                        <td className="num">{inr(calc.rows[i].gst, true)}</td>
                                        <td><Button size="sm" variant="ghost" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}><Icon name="delete" /></Button></td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot>
                            <tr><td colSpan={4}>Subtotal (excluding GST)</td><td className="num" colSpan={3}>{inr(calc.subtotal, true)}</td></tr>
                            <tr><td colSpan={4}>GST (estimate from each item&apos;s default rate)</td><td className="num" colSpan={3}>{inr(calc.gst, true)}</td></tr>
                            <tr><td colSpan={4}>Total</td><td className="num" colSpan={3}>{inr(calc.total, true)}</td></tr>
                        </tfoot>
                    </table>
                </div>
            </Card>

            <Card title="Approval route" sub="Chosen from the subtotal excluding GST">
                {calc.subtotal <= 0 ? <div className="muted">Add items to see who will approve this order.</div>
                    : rules.error ? <div className="muted">The approval matrix is not visible to your role. After you create the order, the approval chain is shown here and on the order.</div>
                        : !tier ? <div className="muted">Loading the approval matrix...</div>
                            : tier.length ? (
                                <>
                                    <div className="small" style={{ marginBottom: 8 }}>
                                        <strong>{inr(calc.subtotal)}</strong> falls in the band <strong>{bandLabel(tier)}</strong>, so it needs {tier.length} approval{tier.length === 1 ? '' : 's'}, in this order:
                                    </div>
                                    <ApprovalChain steps={tier.map((r, i) => ({ step: i + 1, role: r.approver_role.code, status: i === 0 ? 'PENDING' : 'WAITING' }))} />
                                    <div className="muted small" style={{ marginTop: 8 }}>A line over the planned BOQ quantity also raises a breach alert to the Project Manager and Commercial.</div>
                                </>
                            ) : <Alert tone="danger">No approval rule covers {inr(calc.subtotal)}. Ask an administrator to configure the approval matrix, otherwise the order cannot be created.</Alert>}
            </Card>

            {problems.length ? (
                <Alert tone="info">To create this order: {problems.slice(0, 3).join('; ')}{problems.length > 3 ? ` (and ${problems.length - 3} more)` : ''}.</Alert>
            ) : null}
            <div className="actions" style={{ marginBottom: 24 }}>
                <Button variant="primary" icon="send" loading={busy} disabled={problems.length > 0 || (tier !== null && tier.length === 0)} onClick={submit}>Create purchase order</Button>
                <Link className="btn" href="/erp/procurement/orders">Cancel</Link>
                <span className="muted small">Order value {inr(calc.subtotal)} excl. GST · {inr(calc.total)} incl. GST</span>
            </div>
        </>
    )
}

function CreatedPanel({ po }: { po: Created }) {
    return (
        <>
            <PageHeader title={`${po.po_no} created`} subtitle="The order is waiting for approval." actions={<><Link className="btn btn-primary" href={`/erp/procurement/orders/${po.id}`}>Open purchase order</Link><Link className="btn" href="/erp/procurement/orders">All purchase orders</Link></>} />
            <div className="kpi-grid">
                <Kpi label="Subtotal" value={inr(po.subtotal_amount)} sub="Excluding GST (used for approval)" />
                <Kpi label="GST" value={inr(po.gst_amount)} />
                <Kpi label="Total" value={inr(po.total_amount)} />
            </div>
            <Card title="Approval chain" sub="Approvers are notified one step at a time">
                <ApprovalChain steps={po.approval_chain} />
            </Card>
            {po.boq_breaches.length ? (
                <Card title="BOQ breach" sub="This order goes beyond the planned material. The Project Manager and Commercial have been alerted.">
                    <Alert tone="danger">{po.boq_breaches.length} line{po.boq_breaches.length === 1 ? '' : 's'} over plan, worth {inr(po.boq_breaches.reduce((s, b) => s + b.over_value, 0))}. Approvers see this flag before deciding.</Alert>
                    <DataTable
                        rows={po.boq_breaches}
                        columns={[
                            { key: 'item', header: 'Item', render: b => <>{b.item}{b.unbudgeted ? <span className="badge danger" style={{ marginLeft: 6 }}>Not in BOQ</span> : null}</> },
                            { key: 'planned', header: 'Planned', align: 'right', render: b => qty(b.planned) },
                            { key: 'before', header: 'Ordered before', align: 'right', render: b => qty(b.ordered_before) },
                            { key: 'now', header: 'This order', align: 'right', render: b => qty(b.ordering_now) },
                            { key: 'over', header: 'Over by', align: 'right', render: b => <strong>{qty(b.over_qty)}</strong> },
                            { key: 'value', header: 'Value over plan', align: 'right', render: b => inr(b.over_value) },
                        ]}
                        rowKey={b => b.item_id}
                    />
                </Card>
            ) : <Alert tone="success">No BOQ breach: every line is within the planned material for the project.</Alert>}
        </>
    )
}
