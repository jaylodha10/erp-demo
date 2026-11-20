'use client'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, pct, qty } from '@/lib/format'
import { Alert, Async, Button, DataTable, Empty, Icon, Kpi, Modal, Money, NumberInput, PageHeader, Select, StatusBadge, Tabs, Textarea, useToast, type Column } from '@/components/ui'
import { TemplatePicker } from './TemplatePicker'
import { codeFor, fromServer, uid, marginPct, num, round2, validate, type Boq, type Draft, type GLine, type GMat, type Opt } from './types'

interface ItemRow { id: string; item_code: string; name: string; purchase_uom_id: string; standard_cost_rate: number }

export default function BoqPage() {
    const { id } = useParams<{ id: string }>()
    const state = useApi<Boq>(`/boqs/${id}`)
    return <Async state={state}>{b => <Builder key={b.id} boq={b} setBoq={state.setData} />}</Async>
}

const bad: CSSProperties = { borderColor: 'var(--danger)', background: '#fef2f2' }

function Builder({ boq, setBoq }: { boq: Boq; setBoq: (b: Boq) => void }) {
    const router = useRouter()
    const toast = useToast()
    const { can } = useSession()
    const ccs = useApi<{ items: Opt[] }>('/masters/cost-centres/options')
    const trades = useApi<{ items: Opt[] }>('/masters/trades/options')
    const uoms = useApi<{ items: Opt[] }>('/masters/uoms/options')
    const items = useApi<{ items: ItemRow[] }>('/masters/items?limit=200')

    const [draft, setDraft] = useState<Draft | null>(null)
    const [tab, setTab] = useState<'lines' | 'materials'>('lines')
    const [picker, setPicker] = useState(false)
    const [lockOpen, setLockOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [showProblems, setShowProblems] = useState(false)
    const [serverError, setServerError] = useState<string | null>(null)
    const [revising, setRevising] = useState(false)

    const base = useMemo(() => fromServer(boq), [boq])
    const cur = draft ?? base
    const dirty = draft !== null
    const writer = can('ESTIMATION', 'COMMERCIAL', 'DIRECTOR')
    const editable = boq.status === 'DRAFT' && writer
    const problems = useMemo(() => validate(cur), [cur])

    // Warn before leaving with unsaved edits (tab close, reload and in-app links).
    useEffect(() => {
        if (!dirty) return
        const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
        const onClick = (e: MouseEvent) => {
            const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
            if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey) return
            const url = new URL(a.href, window.location.href)
            if (url.origin === window.location.origin && url.pathname === window.location.pathname) return
            if (!window.confirm('You have unsaved BOQ changes. Leave this page and lose them?')) { e.preventDefault(); e.stopPropagation() }
        }
        window.addEventListener('beforeunload', beforeUnload)
        document.addEventListener('click', onClick, true)
        return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', onClick, true) }
    }, [dirty])

    const edit = (fn: (d: Draft) => Draft) => { setDraft(prev => fn(prev ?? base)); setServerError(null) }
    const patchLine = (key: string, p: Partial<GLine>) => edit(d => ({ ...d, lines: d.lines.map(l => (l.key === key ? { ...l, ...p } : l)) }))
    const patchMat = (key: string, p: Partial<GMat>) => edit(d => ({ ...d, mats: d.mats.map(m => (m.key === key ? { ...m, ...p } : m)) }))
    const addLine = () => edit(d => ({
        ...d,
        lines: [...d.lines, { key: uid(), template_id: null, item_id: null, cost_centre_id: d.lines.at(-1)?.cost_centre_id ?? '', trade_id: '', description: '', uom_id: d.lines.at(-1)?.uom_id ?? '', qty: 1, est_cost_rate: 0, selling_rate: 0 }],
    }))
    const removeLine = (key: string) => edit(d => ({ lines: d.lines.filter(l => l.key !== key), mats: d.mats.filter(m => m.line_key !== key) }))
    const moveLine = (key: string, dir: -1 | 1) => edit(d => {
        const i = d.lines.findIndex(l => l.key === key)
        const j = i + dir
        if (i < 0 || j < 0 || j >= d.lines.length) return d
        const lines = [...d.lines];
        [lines[i], lines[j]] = [lines[j], lines[i]]
        return { ...d, lines }
    })
    const addFromTemplates = (rows: Omit<GLine, 'key'>[]) => { edit(d => ({ ...d, lines: [...d.lines, ...rows.map(r => ({ ...r, key: uid() }))] })); setPicker(false); toast.success(`${rows.length} line${rows.length === 1 ? '' : 's'} added from templates`) }
    const addMaterial = () => edit(d => ({ ...d, mats: [...d.mats, { key: uid(), line_key: d.lines[0]?.key ?? '', item_id: '', item_label: '', uom_code: '', planned_qty: 1, planned_rate: 0 }] }))

    const optList = (s: { data: { items: Opt[] } | null }) => s.data?.items ?? []
    const labelOf = (list: Opt[], id: string) => list.find(o => o.id === id)?.label ?? '—'
    const codeOf = (list: Opt[], id: string) => list.find(o => o.id === id)?.code ?? '—'

    const total = useMemo(() => {
        const cost = cur.lines.reduce((s, l) => s + round2(num(l.qty) * num(l.est_cost_rate)), 0)
        const sell = cur.lines.reduce((s, l) => s + round2(num(l.qty) * num(l.selling_rate)), 0)
        return { cost, sell, profit: sell - cost, margin: marginPct(cost, sell) }
    }, [cur.lines])
    const matTotal = cur.mats.reduce((s, m) => s + round2(num(m.planned_qty) * num(m.planned_rate)), 0)

    /** Saves the grid. Returns true on success. Codes are renumbered BOQ-01... in grid order. */
    async function save(): Promise<boolean> {
        setShowProblems(true)
        if (problems.messages.length) { setServerError(null); return false }
        setSaving(true); setServerError(null)
        const codes = new Map(cur.lines.map((l, i) => [l.key, codeFor(i)]))
        try {
            const saved = await api.put<Boq>(`/boqs/${boq.id}/lines`, {
                lines: cur.lines.map(l => ({
                    code: codes.get(l.key), cost_centre_id: l.cost_centre_id, trade_id: l.trade_id || null, item_id: l.item_id, template_id: l.template_id,
                    description: l.description.trim(), uom_id: l.uom_id, qty: num(l.qty), est_cost_rate: num(l.est_cost_rate), selling_rate: num(l.selling_rate),
                })),
                materials: cur.mats.map(m => ({ line_code: codes.get(m.line_key), item_id: m.item_id, planned_qty: num(m.planned_qty), planned_rate: num(m.planned_rate) })),
            })
            setBoq(saved)
            setDraft(null)
            setShowProblems(false)
            toast.success('BOQ saved')
            return true
        } catch (e) {
            setServerError(e instanceof Error ? e.message : 'Could not save the BOQ')
            return false
        } finally {
            setSaving(false)
        }
    }

    async function lock() {
        if (dirty && !(await save())) { setLockOpen(false); return }
        setSaving(true)
        try {
            const locked = await api.post<Boq>(`/boqs/${boq.id}/lock`)
            setBoq(locked)
            setDraft(null)
            setLockOpen(false)
            toast.success('BOQ locked as the baseline')
        } catch (e) {
            setLockOpen(false)
            setServerError(e instanceof Error ? e.message : 'Could not lock the BOQ')
        } finally {
            setSaving(false)
        }
    }

    async function newRevision() {
        setRevising(true)
        try {
            const r = await api.post<{ id: string }>('/boqs', { ...(boq.enquiry_id ? { enquiry_id: boq.enquiry_id } : { project_id: boq.project_id }), copy_from_boq_id: boq.id })
            toast.success('New draft revision created')
            router.push(`/erp/boq/${r.id}`)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not create the revision')
        } finally {
            setRevising(false)
        }
    }

    // ------------------------------------------------------------------------------------------ grid columns
    const err = (l: GLine, f: string): CSSProperties | undefined => (showProblems && problems.line[l.key]?.has(f) ? bad : undefined)
    const lineCols: Column<GLine>[] = [
        { key: 'n', header: '#', width: 70, render: (_l, i) => <span className="mono strong">{codeFor(i)}</span> },
        {
            key: 'cc', header: 'Cost centre', width: 150, render: l => editable ? (
                <Select className="cell-input" aria-label="Cost centre" style={err(l, 'cc')} value={l.cost_centre_id} onChange={e => patchLine(l.key, { cost_centre_id: e.target.value })}>
                    <option value="">Select...</option>
                    {optList(ccs).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
            ) : labelOf(optList(ccs), l.cost_centre_id),
        },
        {
            key: 'trade', header: 'Trade', width: 140, render: l => editable ? (
                <Select className="cell-input" aria-label="Trade" value={l.trade_id} onChange={e => patchLine(l.key, { trade_id: e.target.value })}>
                    <option value="">None</option>
                    {optList(trades).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
            ) : (l.trade_id ? labelOf(optList(trades), l.trade_id) : '—'),
        },
        {
            key: 'desc', header: 'Work item description', width: 300, render: l => editable ? (
                <Textarea className="cell-input" aria-label="Description" rows={2} style={{ minHeight: 52, ...err(l, 'desc') }} value={l.description} onChange={e => patchLine(l.key, { description: e.target.value })} />
            ) : <span style={{ whiteSpace: 'normal', minWidth: 220, display: 'inline-block' }}>{l.description}</span>,
        },
        {
            key: 'uom', header: 'UOM', width: 90, render: l => editable ? (
                <Select className="cell-input" aria-label="Unit of measure" style={err(l, 'uom')} value={l.uom_id} onChange={e => patchLine(l.key, { uom_id: e.target.value })}>
                    <option value="">--</option>
                    {optList(uoms).map(o => <option key={o.id} value={o.id}>{o.code}</option>)}
                </Select>
            ) : codeOf(optList(uoms), l.uom_id),
        },
        {
            key: 'qty', header: 'Qty', align: 'right', width: 100, render: l => editable ? (
                <NumberInput className="cell-input" aria-label="Quantity" style={err(l, 'qty')} min={0} step="any" value={l.qty} onChange={v => patchLine(l.key, { qty: v })} />
            ) : qty(l.qty),
        },
        {
            key: 'cost', header: 'Est. cost rate', align: 'right', width: 120, render: l => editable ? (
                <NumberInput className="cell-input" aria-label="Estimated cost rate" style={err(l, 'cost')} min={0} step="any" value={l.est_cost_rate} onChange={v => patchLine(l.key, { est_cost_rate: v })} />
            ) : <Money value={l.est_cost_rate} />,
        },
        {
            key: 'sell', header: 'Selling rate', align: 'right', width: 120, render: l => editable ? (
                <NumberInput className="cell-input" aria-label="Selling rate" style={err(l, 'sell')} min={0} step="any" value={l.selling_rate} onChange={v => patchLine(l.key, { selling_rate: v })} />
            ) : <Money value={l.selling_rate} />,
        },
        { key: 'tc', header: 'Total cost', align: 'right', render: l => <Money value={num(l.qty) * num(l.est_cost_rate)} /> },
        { key: 'ts', header: 'Total sell', align: 'right', render: l => <Money value={num(l.qty) * num(l.selling_rate)} /> },
        {
            key: 'm', header: 'Margin', align: 'right', render: l => {
                const m = marginPct(num(l.qty) * num(l.est_cost_rate), num(l.qty) * num(l.selling_rate))
                return <span style={m < 0 ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>{pct(m)}</span>
            },
        },
    ]
    if (editable) {
        lineCols.push({
            key: 'act', header: <span style={{ position: 'absolute', left: -9999 }}>Actions</span>, width: 110, render: (l, i) => (
                <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                    <Button size="sm" variant="ghost" aria-label={`Move line ${i + 1} up`} disabled={i === 0} onClick={() => moveLine(l.key, -1)} icon="arrow_upward" />
                    <Button size="sm" variant="ghost" aria-label={`Move line ${i + 1} down`} disabled={i === cur.lines.length - 1} onClick={() => moveLine(l.key, 1)} icon="arrow_downward" />
                    <Button size="sm" variant="ghost" aria-label={`Remove line ${i + 1}`} onClick={() => removeLine(l.key)} icon="delete" />
                </div>
            ),
        })
    }

    const merr = (m: GMat, f: string): CSSProperties | undefined => (showProblems && problems.mat[m.key]?.has(f) ? bad : undefined)
    const itemList = items.data?.items ?? []
    const matCols: Column<GMat>[] = [
        {
            key: 'line', header: 'BOQ line', width: 260, render: m => {
                const idx = cur.lines.findIndex(l => l.key === m.line_key)
                const l = cur.lines[idx]
                if (!editable) return idx >= 0 ? `${codeFor(idx)} · ${l.description.slice(0, 60)}` : '—'
                return (
                    <Select className="cell-input" aria-label="BOQ line" value={m.line_key} onChange={e => patchMat(m.key, { line_key: e.target.value })}>
                        {cur.lines.map((x, i) => <option key={x.key} value={x.key}>{codeFor(i)} · {x.description.slice(0, 50) || '(no description)'}</option>)}
                    </Select>
                )
            },
        },
        {
            key: 'item', header: 'Item', width: 260, render: m => editable ? (
                <Select className="cell-input" aria-label="Item" style={merr(m, 'item')} value={m.item_id} disabled={items.loading}
                    onChange={e => {
                        const it = itemList.find(x => x.id === e.target.value)
                        patchMat(m.key, it ? { item_id: it.id, item_label: `${it.item_code} · ${it.name}`, uom_code: codeOf(optList(uoms), it.purchase_uom_id), planned_rate: Number(it.standard_cost_rate) } : { item_id: '', item_label: '', uom_code: '' })
                    }}>
                    <option value="">{items.loading ? 'Loading items...' : 'Select item...'}</option>
                    {m.item_id && !itemList.some(x => x.id === m.item_id) ? <option value={m.item_id}>{m.item_label}</option> : null}
                    {itemList.map(x => <option key={x.id} value={x.id}>{x.item_code} · {x.name}</option>)}
                </Select>
            ) : m.item_label,
        },
        { key: 'uom', header: 'UOM', render: m => m.uom_code || '—' },
        {
            key: 'qty', header: 'Planned qty', align: 'right', width: 120, render: m => editable ? (
                <NumberInput className="cell-input" aria-label="Planned quantity" style={merr(m, 'qty')} min={0} step="any" value={m.planned_qty} onChange={v => patchMat(m.key, { planned_qty: v })} />
            ) : qty(m.planned_qty),
        },
        {
            key: 'rate', header: 'Planned rate', align: 'right', width: 120, render: m => editable ? (
                <NumberInput className="cell-input" aria-label="Planned rate" style={merr(m, 'rate')} min={0} step="any" value={m.planned_rate} onChange={v => patchMat(m.key, { planned_rate: v })} />
            ) : <Money value={m.planned_rate} />,
        },
        { key: 'amt', header: 'Amount', align: 'right', render: m => <Money value={num(m.planned_qty) * num(m.planned_rate)} /> },
    ]
    if (editable) {
        matCols.push({ key: 'act', header: <span style={{ position: 'absolute', left: -9999 }}>Actions</span>, width: 60, render: m => <Button size="sm" variant="ghost" aria-label="Remove material" icon="delete" onClick={() => edit(d => ({ ...d, mats: d.mats.filter(x => x.key !== m.key) }))} /> })
    }

    const statusNote = boq.status === 'BASELINE_LOCKED'
        ? `Locked as the baseline${boq.locked_at ? ` on ${fmtDate(boq.locked_at)}` : ''}. It is read-only.`
        : boq.status === 'SUPERSEDED' ? 'A newer revision has replaced this BOQ. It is kept for reference and is read-only.' : null
    const backHref = boq.enquiry ? `/erp/enquiries/${boq.enquiry.id}` : boq.project ? `/erp/projects/${boq.project.id}` : '/erp/enquiries'

    return (
        <>
            <div className="small" style={{ marginBottom: 8 }}>
                <Link href={backHref}>&larr; {boq.enquiry ? `Enquiry ${boq.enquiry.enquiry_no}` : boq.project ? `Project ${boq.project.project_code}` : 'All enquiries'}</Link>
            </div>
            <PageHeader
                title={`${boq.boq_no} · Version ${boq.version_no}`}
                subtitle={<>{boq.enquiry ? `${boq.enquiry.client_name} · ${boq.enquiry.project_name}` : boq.project ? boq.project.name : ''} · <StatusBadge status={boq.status} /></>}
                actions={
                    <>
                        {dirty ? <span className="badge warning">Unsaved changes</span> : null}
                        {editable ? (
                            <>
                                <Button onClick={() => setDraft(null)} disabled={!dirty || saving}>Discard edits</Button>
                                <Button icon="save" loading={saving && !lockOpen} disabled={!dirty} onClick={() => void save()}>Save</Button>
                                <Button variant="primary" icon="lock" disabled={saving || !cur.lines.length} onClick={() => setLockOpen(true)}>Lock as baseline</Button>
                            </>
                        ) : writer && !boq.project_id ? (
                            <Button variant="primary" icon="content_copy" loading={revising} onClick={newRevision}>New revision</Button>
                        ) : null}
                    </>
                }
            />

            {statusNote ? <Alert tone="info">{statusNote}{writer && boq.project_id ? ' This BOQ now belongs to a project; later changes go through Extra work.' : writer ? ' Use "New revision" to make changes in a new draft.' : ''}</Alert> : null}
            {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
            {showProblems && problems.messages.length ? (
                <Alert tone="danger">
                    <strong>Fix these before saving:</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 20, listStyle: "disc" }}>{problems.messages.slice(0, 8).map((m, i) => <li key={i}>{m}</li>)}{problems.messages.length > 8 ? <li>and {problems.messages.length - 8} more</li> : null}</ul>
                </Alert>
            ) : null}

            <div className="kpi-grid">
                <Kpi label="Estimated cost" value={<Money value={total.cost} />} sub={`${cur.lines.length} line${cur.lines.length === 1 ? '' : 's'}`} />
                <Kpi label="Selling total (excl. GST)" value={<Money value={total.sell} />} />
                <Kpi label="Gross profit" value={<Money value={total.profit} />} tone={total.profit < 0 ? 'bad' : undefined} />
                <Kpi label="Gross margin" value={pct(total.margin, 2)} tone={total.sell <= 0 ? undefined : total.margin < 15 ? 'warn' : 'good'} sub={total.sell > 0 && total.margin < 15 ? 'below 15%' : undefined} />
            </div>

            <div className="card">
                <Tabs tabs={[{ id: 'lines', label: 'BOQ lines', count: cur.lines.length }, { id: 'materials', label: 'Planned materials', count: cur.mats.length }]} value={tab} onChange={setTab} />

                {tab === 'lines' ? (
                    <>
                        {editable ? (
                            <div className="actions" style={{ marginBottom: 12 }}>
                                <Button icon="add" onClick={addLine}>Add line</Button>
                                <Button icon="library_add" onClick={() => setPicker(true)}>Import from templates</Button>
                            </div>
                        ) : null}
                        <div className="boq-grid">
                        <DataTable<GLine>
                            rows={cur.lines}
                            columns={lineCols}
                            empty={<Empty title="No lines yet" icon="table_chart">{editable ? 'Add a line or import work items from the templates.' : 'This BOQ has no lines.'}</Empty>}
                            footer={cur.lines.length ? (
                                <tr>
                                    <td colSpan={8}>Total ({cur.lines.length} lines)</td>
                                    <td className="num"><Money value={total.cost} /></td>
                                    <td className="num"><Money value={total.sell} /></td>
                                    <td className="num">{pct(total.margin)}</td>
                                    {editable ? <td /> : null}
                                </tr>
                            ) : undefined}
                        />
                        </div>
                    </>
                ) : (
                    <>
                        <p className="muted small" style={{ marginTop: 0 }}>Planned materials per BOQ line. Purchase orders that exceed these quantities are flagged later. Each item can appear once per line.</p>
                        {editable ? (
                            <div className="actions" style={{ marginBottom: 12 }}>
                                <Button icon="add" onClick={addMaterial} disabled={!cur.lines.length}>Add material</Button>
                                {!cur.lines.length ? <span className="muted small">Add BOQ lines first.</span> : null}
                            </div>
                        ) : null}
                        <div className="boq-grid mats">
                        <DataTable<GMat>
                            rows={cur.mats}
                            columns={matCols}
                            empty={<Empty title="No planned materials" icon="inventory_2">{editable ? 'Add the items each BOQ line will consume.' : 'No materials were planned on this BOQ.'}</Empty>}
                            footer={cur.mats.length ? (
                                <tr>
                                    <td colSpan={5}>Planned material cost (estimated cost of all lines: <Money value={total.cost} />)</td>
                                    <td className="num"><Money value={matTotal} /></td>
                                    {editable ? <td /> : null}
                                </tr>
                            ) : undefined}
                        />
                        </div>
                    </>
                )}
            </div>
            {/* Cell inputs need room: the grid scrolls sideways inside its own box instead of squeezing the columns. */}
            <style>{'.boq-grid .table { min-width: 1380px } .boq-grid.mats .table { min-width: 860px } .boq-grid .table th { vertical-align: bottom } .boq-grid .table td { vertical-align: top }'}</style>

            {picker ? <TemplatePicker onClose={() => setPicker(false)} onAdd={addFromTemplates} /> : null}
            <Modal open={lockOpen} title="Lock as baseline" onClose={() => setLockOpen(false)} footer={
                <>
                    <Button onClick={() => setLockOpen(false)} disabled={saving}>Cancel</Button>
                    <Button variant="primary" icon="lock" loading={saving} onClick={() => void lock()}>Lock BOQ</Button>
                </>
            }>
                <p style={{ marginTop: 0 }}>Locking freezes <strong>{boq.boq_no}</strong> as the baseline budget and contract basis:</p>
                <ul style={{ paddingLeft: 20, listStyle: "disc" }}>
                    <li>Lines, quantities, rates and planned materials can no longer be edited. To change them you create a new revision.</li>
                    <li>Any earlier locked version of this enquiry becomes superseded.</li>
                    <li>The enquiry moves to BOQ submitted and quotations can be created from this BOQ.</li>
                </ul>
                <div className="row"><span className="muted">Estimated cost</span><span className="spacer" /><Money value={total.cost} /></div>
                <div className="row"><span className="muted">Selling total</span><span className="spacer" /><Money value={total.sell} /></div>
                <div className="row strong"><span>Gross margin</span><span className="spacer" /><span>{pct(total.margin, 2)}</span></div>
                {dirty ? <Alert tone="warn"><Icon name="info" /> Your unsaved edits will be saved first.</Alert> : null}
                {dirty && problems.messages.length ? <Alert tone="danger">Fix the highlighted problems before locking. Close this dialog and press Save to see them.</Alert> : null}
            </Modal>
        </>
    )
}
