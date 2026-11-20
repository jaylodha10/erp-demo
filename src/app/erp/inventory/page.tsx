'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { api, qs, useApi } from '@/lib/api'
import { fmtDateTime, humanize, inr, qty, toNum } from '@/lib/format'
import { useSession } from '@/lib/session'
import {
    Alert, ApiSelect, Async, Button, Card, DataTable, Empty, Field, Icon, Input, Kpi, MasterSelect, NumberInput, PageHeader, ProjectSelect, Select, Tabs, Textarea, useAction, useDebounced, type Column,
} from '@/components/ui'

interface StockRow {
    warehouse_id: string
    warehouse_code: string
    warehouse_name: string
    warehouse_type: 'CENTRAL' | 'SITE'
    project_code: string | null
    item_id: string
    item_code: string
    item_name: string
    display_uom: string
    base_uom: string
    available: number
    available_base: number
    stock_value: number
    avg_rate_per_display_uom: number
    received: number
    issued_to_site: number
    received_from_central: number
    consumed: number
    returned: number
    wastage: number
}
interface Hold { id: string; severity: string; source_doc_no: string | null; message: string; assigned_role: string | null; created_at: string; project_id: string | null }
interface StockResp { items: StockRow[]; holds: Hold[]; total_value?: number }
interface LedgerRow {
    id: string
    entry_no: number
    posting_ts: string
    movement_type: string
    source_doc_type: string
    qty_in_base_uom: number
    unit_valuation_rate: number
    total_value: number
    balance_qty_after: number
    is_reversal_of: string | null
    item: { item_code: string; name: string }
    warehouse: { code: string }
}
interface WarehouseRow { id: string; code: string; name: string; warehouse_type: string }

const TABS = [
    { id: 'stock', label: 'Stock balances' },
    { id: 'ledger', label: 'Stock ledger' },
    { id: 'transfers', label: 'Transfers' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function StockExplorerPage() {
    const [tab, setTab] = useState<TabId>('stock')
    return (
        <>
            <PageHeader title="Stock explorer" subtitle="Live stock in the central store and in every site store, the immutable stock ledger, and transfers between them." />
            <Tabs tabs={TABS.map(t => ({ id: t.id, label: t.label }))} value={tab} onChange={setTab} />
            {tab === 'stock' ? <BalancesTab /> : tab === 'ledger' ? <LedgerTab /> : <TransfersTab />}
        </>
    )
}

const whLabel = (w: WarehouseRow) => `${w.code} · ${w.name}`

// ---------------------------------------------------------------------------------------------- balances
function BalancesTab() {
    const [warehouseId, setWarehouseId] = useState('')
    const [projectId, setProjectId] = useState('')
    const [search, setSearch] = useState('')
    const debounced = useDebounced(search)
    const state = useApi<StockResp>(`/inventory/stock${qs({ warehouse_id: warehouseId, project_id: projectId, search: debounced.trim() })}`)

    const columns: Column<StockRow>[] = [
        { key: 'wh', header: 'Store', render: r => <><div className="strong">{r.warehouse_code}</div><div className="muted small">{r.warehouse_type === 'CENTRAL' ? 'Central store' : `Site store${r.project_code ? ` · ${r.project_code}` : ''}`}</div></> },
        { key: 'item', header: 'Item', render: r => <><div>{r.item_name}</div><div className="muted small">{r.item_code}</div></> },
        { key: 'rec', header: 'Received', align: 'right', render: r => <Qty v={r.received} uom={r.display_uom} extra={r.received_from_central > 0 ? `+${qty(r.received_from_central)} from central` : undefined} /> },
        { key: 'iss', header: 'Issued to site', align: 'right', render: r => <Qty v={r.issued_to_site} uom={r.display_uom} /> },
        { key: 'con', header: 'Consumed', align: 'right', render: r => <Qty v={r.consumed} uom={r.display_uom} /> },
        {
            key: 'av', header: 'Available', align: 'right',
            render: r => (
                <>
                    <div className="strong" style={r.available < 0 ? { color: 'var(--danger)' } : undefined}>{qty(r.available)} {r.display_uom}</div>
                    {r.display_uom !== r.base_uom ? <div className="muted small">{qty(r.available_base)} {r.base_uom}</div> : null}
                </>
            ),
        },
        { key: 'ret', header: 'Returned', align: 'right', render: r => <Qty v={r.returned} uom={r.display_uom} /> },
        { key: 'was', header: 'Wastage', align: 'right', render: r => <Qty v={r.wastage} uom={r.display_uom} warn /> },
        { key: 'val', header: 'Value', align: 'right', render: r => inr(r.stock_value) },
        { key: 'avg', header: 'Average rate', align: 'right', render: r => (r.avg_rate_per_display_uom ? `${inr(r.avg_rate_per_display_uom, true)} / ${r.display_uom}` : '—') },
    ]

    return (
        <>
            <Card>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                    <Field label="Store"><ApiSelect<WarehouseRow> path="/inventory/warehouses" value={warehouseId} onChange={id => setWarehouseId(id)} label={whLabel} placeholder="Central store and all sites" /></Field>
                    <Field label="Project"><ProjectSelect value={projectId} onChange={id => setProjectId(id)} placeholder="All projects" /></Field>
                    <Field label="Search item"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Item name or code" /></Field>
                </div>
            </Card>
            <Async state={state}>
                {d => {
                    const central = d.items.filter(i => i.warehouse_type === 'CENTRAL').reduce((s, i) => s + i.stock_value, 0)
                    const site = d.items.filter(i => i.warehouse_type === 'SITE').reduce((s, i) => s + i.stock_value, 0)
                    const total = d.items.reduce((s, i) => s + i.stock_value, 0)
                    return (
                        <>
                            <div className="kpi-grid">
                                <Kpi label="Stock value" value={inr(total)} sub={`${d.items.length} stock lines`} />
                                <Kpi label="In central store" value={inr(central)} />
                                <Kpi label="At sites" value={inr(site)} sub="Held as an asset until consumed" />
                                <Kpi label="GRN mismatch holds" value={d.holds.length} tone={d.holds.length ? 'bad' : 'good'} sub={d.holds.length ? 'Vendor invoices on hold' : 'No open holds'} />
                            </div>
                            {d.holds.length ? (
                                <Card title="GRN mismatch holds" sub="Short or damaged deliveries. The vendor invoice stays on hold until the mismatch is settled." actions={<Link className="btn btn-sm" href="/erp/exceptions">Open exceptions</Link>}>
                                    <DataTable
                                        rows={d.holds}
                                        columns={[
                                            { key: 'grn', header: 'GRN', render: h => <span className="strong">{h.source_doc_no ?? '—'}</span> },
                                            { key: 'msg', header: 'What happened', render: h => <span style={{ whiteSpace: 'normal' }}>{h.message}</span> },
                                            { key: 'role', header: 'Owner', render: h => humanize(h.assigned_role) },
                                            { key: 'when', header: 'Raised', render: h => fmtDateTime(h.created_at) },
                                            { key: 'sev', header: 'Severity', render: h => <span className={`badge ${h.severity === 'CRITICAL' ? 'danger' : 'warning'}`}>{humanize(h.severity)}</span> },
                                        ]}
                                    />
                                </Card>
                            ) : null}
                            <DataTable
                                columns={columns}
                                rows={d.items}
                                rowKey={r => `${r.warehouse_id}:${r.item_id}`}
                                empty={<Empty title="No stock found" icon="warehouse">No stock lines match these filters.</Empty>}
                                footer={d.items.length ? <tr><td colSpan={8}>Total</td><td className="num">{inr(total)}</td><td /></tr> : undefined}
                            />
                            <div className="muted small" style={{ marginTop: 8 }}>Quantities are shown in the item&apos;s purchase unit; the base unit is shown underneath where it differs. Returned counts stock sent back or received back, whichever applies to the store.</div>
                        </>
                    )
                }}
            </Async>
        </>
    )
}

function Qty({ v, uom, extra, warn }: { v: number; uom: string; extra?: string; warn?: boolean }) {
    if (!toNum(v)) return <span className="muted">0</span>
    return <><div style={warn ? { color: 'var(--danger)' } : undefined}>{qty(v)} {uom}</div>{extra ? <div className="muted small">{extra}</div> : null}</>
}

// ---------------------------------------------------------------------------------------------- ledger
const MOVEMENT_TONE: Record<string, string> = { GRN_INWARD: 'success', CENTRAL_TO_SITE_ISSUE: 'info', SITE_RETURN: 'purple', DAILY_CONSUMPTION: 'warning', WASTAGE: 'danger' }

function LedgerTab() {
    const [warehouseId, setWarehouseId] = useState('')
    const [projectId, setProjectId] = useState('')
    const [itemId, setItemId] = useState('')
    const [type, setType] = useState('')
    const [limit, setLimit] = useState('100')
    const state = useApi<{ items: LedgerRow[] }>(`/inventory/ledger${qs({ warehouse_id: warehouseId, project_id: projectId, item_id: itemId, limit })}`)

    const view = useMemo(() => {
        const rows = state.data?.items ?? []
        const reversed = new Set(rows.map(r => r.is_reversal_of).filter(Boolean))
        const byId = new Map(rows.map(r => [r.id, r]))
        return { rows: rows.filter(r => !type || r.movement_type === type), reversed, byId, types: [...new Set(rows.map(r => r.movement_type))].sort() }
    }, [state.data, type])

    return (
        <>
            <Alert tone="info">The stock ledger is append-only. Nothing is edited or deleted: a correction is a new row marked as a reversal of the original.</Alert>
            <Card>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                    <Field label="Store"><ApiSelect<WarehouseRow> path="/inventory/warehouses" value={warehouseId} onChange={id => setWarehouseId(id)} label={whLabel} placeholder="All stores" /></Field>
                    <Field label="Project"><ProjectSelect value={projectId} onChange={id => setProjectId(id)} placeholder="All projects" /></Field>
                    <Field label="Item"><MasterSelect master="items" value={itemId} onChange={id => setItemId(id)} placeholder="All items" /></Field>
                    <Field label="Movement">
                        <Select value={type} onChange={e => setType(e.target.value)}>
                            <option value="">All movements</option>
                            {view.types.map(t => <option key={t} value={t}>{humanize(t)}</option>)}
                        </Select>
                    </Field>
                    <Field label="Show latest">
                        <Select value={limit} onChange={e => setLimit(e.target.value)}>
                            <option value="100">100 entries</option>
                            <option value="250">250 entries</option>
                            <option value="500">500 entries</option>
                        </Select>
                    </Field>
                </div>
            </Card>
            <Async state={state}>
                {() => (
                    <DataTable
                        rows={view.rows}
                        empty={<Empty title="No ledger entries" icon="receipt_long">No movements match these filters.</Empty>}
                        columns={[
                            { key: 'no', header: 'Entry', render: r => <span className="strong mono">#{r.entry_no}</span>, width: 70 },
                            { key: 'ts', header: 'Posted', render: r => fmtDateTime(r.posting_ts) },
                            { key: 'wh', header: 'Store', render: r => r.warehouse.code },
                            { key: 'item', header: 'Item', render: r => <><div>{r.item.name}</div><div className="muted small">{r.item.item_code}</div></> },
                            { key: 'type', header: 'Movement', render: r => <span className={`badge ${MOVEMENT_TONE[r.movement_type] ?? ''}`}>{humanize(r.movement_type)}</span> },
                            { key: 'src', header: 'Source', render: r => <span className="muted small">{humanize(r.source_doc_type)}</span> },
                            { key: 'qty', header: 'Quantity (base)', align: 'right', render: r => <span className="strong" style={{ color: r.qty_in_base_uom < 0 ? 'var(--danger)' : 'var(--success)' }}>{r.qty_in_base_uom > 0 ? '+' : ''}{qty(r.qty_in_base_uom)}</span> },
                            { key: 'rate', header: 'Rate', align: 'right', render: r => inr(r.unit_valuation_rate, true) },
                            { key: 'val', header: 'Value', align: 'right', render: r => `${r.total_value > 0 ? '+' : ''}${inr(r.total_value)}` },
                            { key: 'bal', header: 'Balance after', align: 'right', render: r => qty(r.balance_qty_after) },
                            {
                                key: 'rev', header: 'Reversal',
                                render: r => r.is_reversal_of
                                    ? <span className="badge danger"><Icon name="undo" />Reverses {view.byId.get(r.is_reversal_of) ? `#${view.byId.get(r.is_reversal_of)!.entry_no}` : 'earlier entry'}</span>
                                    : view.reversed.has(r.id) ? <span className="badge warning">Reversed</span> : <span className="muted">—</span>,
                            },
                        ] satisfies Column<LedgerRow>[]}
                    />
                )}
            </Async>
        </>
    )
}

// ---------------------------------------------------------------------------------------------- transfers
type TransferType = 'CENTRAL_TO_SITE' | 'SITE_RETURN' | 'WASTAGE'
const TRANSFER_INFO: Record<TransferType, { label: string; icon: string; blurb: string; tone: 'info' | 'warn' }> = {
    CENTRAL_TO_SITE: { label: 'Issue to site', icon: 'arrow_forward', tone: 'info', blurb: 'Moves stock from the central store into the site store at the central average rate. This is a transfer between two stores: it does not touch project cost.' },
    SITE_RETURN: { label: 'Return to central', icon: 'undo', tone: 'info', blurb: 'Sends leftover stock from the site store back to the central store at its value. A transfer, not a cost: project cost is unchanged.' },
    WASTAGE: { label: 'Write off wastage', icon: 'delete_sweep', tone: 'warn', blurb: 'Removes damaged or lost stock from the site store. Unlike transfers, wastage is charged to the project as material cost at the stock rate.' },
}

interface ItemsResp { items: { id: string; item_code: string; name: string; purchase_uom_id: string; base_uom_id: string; purchase_to_base_factor: number }[]; labels: Record<string, Record<string, string>> }
interface ProjectDetail { sites: { id: string; code: string; name: string; city: string }[] }

function TransfersTab() {
    const { can } = useSession()
    const canTransfer = can('STOREKEEPER', 'PURCHASE_MGR', 'PROJECT_MANAGER', 'PROJECT_HEAD', 'DIRECTOR')
    const [type, setType] = useState<TransferType>('CENTRAL_TO_SITE')
    const [projectId, setProjectId] = useState('')
    const [siteId, setSiteId] = useState('')
    const [itemId, setItemId] = useState('')
    const [amount, setAmount] = useState<number | ''>('')
    const [remarks, setRemarks] = useState('')
    const [done, setDone] = useState<{ type: TransferType; value: number; qty: number; item: string; uom: string } | null>(null)
    const { run, busy } = useAction()

    const project = useApi<ProjectDetail>(projectId ? `/projects/${projectId}` : null)
    const items = useApi<ItemsResp>('/masters/items?limit=200')
    const item = items.data?.items.find(i => i.id === itemId)
    const uom = item ? items.data?.labels.purchase_uom_id?.[item.purchase_uom_id]?.split(' · ')[0] ?? '' : ''
    const baseUom = item ? items.data?.labels.base_uom_id?.[item.base_uom_id]?.split(' · ')[0] ?? '' : ''
    const factor = item ? toNum(item.purchase_to_base_factor) || 1 : 1

    const sites = project.data?.sites ?? []
    const effectiveSite = siteId || (sites.length === 1 ? sites[0].id : '')

    // What is on hand at the source, so the user sees the limit before posting.
    const stock = useApi<StockResp>(item && effectiveSite ? `/inventory/stock${qs({ project_id: projectId, search: item.item_code })}` : null)
    const stockCentral = useApi<StockResp>(item && type !== 'WASTAGE' ? `/inventory/stock${qs({ search: item.item_code })}` : null)
    const siteLine = stock.data?.items.find(r => r.item_id === itemId && r.warehouse_type === 'SITE')
    const centralLine = stockCentral.data?.items.find(r => r.item_id === itemId && r.warehouse_type === 'CENTRAL')
    const source = type === 'CENTRAL_TO_SITE' ? centralLine : siteLine
    const sourceLabel = type === 'CENTRAL_TO_SITE' ? 'central store' : 'site store'

    const recent = useApi<{ items: LedgerRow[] }>('/inventory/ledger?limit=300')
    const recentRows = (recent.data?.items ?? []).filter(r => ['CENTRAL_TO_SITE_ISSUE', 'SITE_RETURN', 'WASTAGE'].includes(r.movement_type)).slice(0, 12)

    const need = type === 'WASTAGE' && !remarks.trim() ? 'Say what was wasted and why.' : null
    const over = source && toNum(amount) > source.available
    const ready = !!effectiveSite && !!itemId && toNum(amount) > 0 && !need

    const submit = async () => {
        const res = await run(() => api.post<{ type: TransferType; value: number; qty: number }>('/inventory/site-transfers', {
            type, site_id: effectiveSite, item_id: itemId, qty: toNum(amount), remarks: remarks.trim() || undefined,
        }), `${TRANSFER_INFO[type].label} posted`)
        if (res) {
            setDone({ type, value: res.value, qty: res.qty, item: item?.name ?? '', uom })
            setAmount(''); setRemarks('')
            void stock.reload(); void stockCentral.reload(); void recent.reload()
        }
    }

    if (!canTransfer) return <Alert tone="warn">Your role can view stock but not move it. Transfers are done by the storekeeper, purchase manager, project manager, project head or director.</Alert>

    return (
        <>
            <div className="grid cols-3" style={{ marginBottom: 14 }}>
                {(Object.keys(TRANSFER_INFO) as TransferType[]).map(t => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => { setType(t); setDone(null) }}
                        aria-pressed={type === t}
                        className="card"
                        style={{ textAlign: 'left', cursor: 'pointer', marginBottom: 0, borderColor: type === t ? 'var(--primary)' : undefined, outline: type === t ? '2px solid #bfdbfe' : undefined, font: 'inherit' }}
                    >
                        <div className="strong"><Icon name={TRANSFER_INFO[t].icon} /> {TRANSFER_INFO[t].label}</div>
                        <div className="muted small" style={{ marginTop: 4 }}>{t === 'CENTRAL_TO_SITE' ? 'Central store to site' : t === 'SITE_RETURN' ? 'Site back to central store' : 'Loss charged to the project'}</div>
                    </button>
                ))}
            </div>
            <Alert tone={TRANSFER_INFO[type].tone}>{TRANSFER_INFO[type].blurb}</Alert>

            <Card title={TRANSFER_INFO[type].label}>
                <div className="form-grid">
                    <Field label="Project"><ProjectSelect value={projectId} status="ACTIVE" onChange={id => { setProjectId(id); setSiteId('') }} /></Field>
                    <Field label="Site">
                        <Select value={effectiveSite} disabled={!projectId || project.loading} onChange={e => setSiteId(e.target.value)}>
                            <option value="">{project.loading ? 'Loading...' : 'Select site...'}</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}, {s.city}</option>)}
                        </Select>
                    </Field>
                    <Field label="Item"><MasterSelect master="items" value={itemId} onChange={id => setItemId(id)} placeholder="Choose item..." /></Field>
                    <Field
                        label={`Quantity${uom ? ` (${uom})` : ''}`}
                        hint={item ? `${factor !== 1 ? `1 ${uom} = ${qty(factor)} ${baseUom}. ` : ''}${source ? `${qty(source.available)} ${source.display_uom} available in the ${sourceLabel}.` : effectiveSite ? `No stock recorded in the ${sourceLabel}.` : ''}` : undefined}
                        error={over ? `Only ${qty(source!.available)} ${source!.display_uom} is available in the ${sourceLabel}.` : undefined}
                    >
                        <NumberInput value={amount} min={0} onChange={setAmount} />
                    </Field>
                    <Field label={type === 'WASTAGE' ? 'What was wasted and why (required)' : 'Remarks'} className="full"><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} style={{ minHeight: 50 }} /></Field>
                </div>
                <div className="actions">
                    <Button variant={type === 'WASTAGE' ? 'danger-solid' : 'primary'} icon={TRANSFER_INFO[type].icon} loading={busy} disabled={!ready} onClick={submit}>{TRANSFER_INFO[type].label}</Button>
                    {need ? <span className="muted small">{need}</span> : null}
                </div>
            </Card>

            {done ? (
                <Alert tone="success">
                    {TRANSFER_INFO[done.type].label}: {qty(done.qty)} {done.uom} of {done.item}, valued at <strong>{inr(done.value)}</strong>.{' '}
                    {done.type === 'WASTAGE' ? 'This amount has been charged to the project as material cost.' : 'Project cost is unchanged: the stock only moved between stores.'}
                </Alert>
            ) : null}

            <Card title="Recent transfers, returns and wastage" sub="Latest movements from the stock ledger (each transfer shows an out row and an in row)">
                <Async state={recent}>
                    {() => (
                        <DataTable
                            rows={recentRows}
                            empty={<Empty title="No transfers yet" icon="swap_horiz" />}
                            columns={[
                                { key: 'ts', header: 'Posted', render: r => fmtDateTime(r.posting_ts) },
                                { key: 'type', header: 'Movement', render: r => <span className={`badge ${MOVEMENT_TONE[r.movement_type] ?? ''}`}>{humanize(r.movement_type)}</span> },
                                { key: 'wh', header: 'Store', render: r => r.warehouse.code },
                                { key: 'item', header: 'Item', render: r => r.item.name },
                                { key: 'qty', header: 'Quantity (base)', align: 'right', render: r => `${r.qty_in_base_uom > 0 ? '+' : ''}${qty(r.qty_in_base_uom)}` },
                                { key: 'val', header: 'Value', align: 'right', render: r => inr(r.total_value) },
                            ]}
                        />
                    )}
                </Async>
            </Card>
        </>
    )
}
