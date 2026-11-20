'use client'
import { Suspense, useId, useMemo, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, qs, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDate, inr, qty } from '@/lib/format'
import {
    Alert, Async, Button, Card, DataTable, Empty, Field, Input, MasterSelect, Modal, NumberInput, PageHeader, Select, Tabs, Textarea,
    useAction, useDebounced, useToast, type Column,
} from '@/components/ui'

/** WEB-01 Master Data Console: one generic, metadata-driven table and form for every master served by /masters. */

type FieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'select' | 'fk' | 'tags'
interface MasterField { name: string; label: string; type: FieldType; required?: boolean; fk?: string; options?: string[]; hint?: string; readonly?: boolean }
interface MasterMeta { key: string; title: string; group: string; columns: string[]; fields: MasterField[]; label_field: string; code_field: string | null }
type Row = Record<string, unknown> & { id: string; is_active?: boolean }
interface ListResponse { items: Row[]; total: number; page: number; limit: number; labels: Record<string, Record<string, string>> }

const WRITE_ROLES = ['ADMIN', 'COMMERCIAL', 'ACCOUNTS', 'DIRECTOR']
const GROUP_ORDER = ['Organisation', 'Parties', 'Items and estimation', 'Finance and tax', 'Inventory']
const PAGE_SIZE = 25
/** Masters whose server-side search list is empty. */
const NO_SEARCH = new Set(['item-uom-conversions'])

export default function MastersPage() {
    return (
        <Suspense fallback={null}>
            <Console />
        </Suspense>
    )
}

function Console() {
    const { can } = useSession()
    const router = useRouter()
    const params = useSearchParams()
    const meta = useApi<{ masters: MasterMeta[] }>('/masters')
    const canWrite = can(...WRITE_ROLES)

    return (
        <>
            <PageHeader
                title="Master data"
                subtitle="The reference lists every other screen draws from: parties, items, rates, tax and stores. Records are never deleted, only deactivated, so history stays intact."
            />
            {!canWrite ? <Alert tone="info">You can browse master data but not change it. Only Admin, Commercial, Accounts and Director can add or edit records.</Alert> : null}
            <Async state={meta}>
                {d => {
                    const masters = d.masters
                    const selected = masters.find(m => m.key === params.get('m')) ?? masters[0]
                    if (!selected) return <Empty title="No masters are configured" />
                    const groups = GROUP_ORDER.filter(g => masters.some(m => m.group === g)).concat(
                        [...new Set(masters.map(m => m.group))].filter(g => !GROUP_ORDER.includes(g))
                    )
                    const pick = (key: string) => router.replace(`/erp/masters?m=${key}`, { scroll: false })
                    return (
                        <>
                            <Tabs
                                tabs={groups.map(g => ({ id: g, label: g, count: masters.filter(m => m.group === g).length }))}
                                value={selected.group}
                                onChange={g => pick(masters.find(m => m.group === g)!.key)}
                            />
                            <div className="row" style={{ marginBottom: 14, gap: 6 }} role="group" aria-label={`${selected.group} masters`}>
                                {masters.filter(m => m.group === selected.group).map(m => (
                                    <Button key={m.key} size="sm" variant={m.key === selected.key ? 'primary' : 'default'} aria-pressed={m.key === selected.key} onClick={() => pick(m.key)}>
                                        {m.title}
                                    </Button>
                                ))}
                            </div>
                            <MasterTable key={selected.key} meta={selected} canWrite={canWrite} />
                        </>
                    )
                }}
            </Async>
        </>
    )
}

// ---------------------------------------------------------------------------------------------- table
function MasterTable({ meta, canWrite }: { meta: MasterMeta; canWrite: boolean }) {
    const toast = useToast()
    const { run, busy } = useAction()
    const [search, setSearch] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const [page, setPage] = useState(1)
    const [editing, setEditing] = useState<Row | 'new' | null>(null)
    const [deactivating, setDeactivating] = useState<Row | null>(null)
    const debounced = useDebounced(search.trim(), 300)

    const state = useApi<ListResponse>(`/masters/${meta.key}${qs({ search: debounced, active: showInactive ? 'all' : undefined, page, limit: PAGE_SIZE })}`)
    const fieldByName = useMemo(() => new Map(meta.fields.map(f => [f.name, f])), [meta.fields])
    const labelOf = (r: Row) => String(r[meta.label_field] ?? (meta.code_field ? r[meta.code_field] : '') ?? r.id)

    async function setActive(row: Row, active: boolean) {
        const ok = await run(() => (active ? api.put(`/masters/${meta.key}/${row.id}`, { is_active: true }) : api.del(`/masters/${meta.key}/${row.id}`)), active ? 'Record reactivated' : 'Record deactivated')
        if (ok) { setDeactivating(null); await state.reload() }
    }

    const columns: Column<Row>[] = [
        ...meta.columns.map<Column<Row>>(name => {
            const f = fieldByName.get(name)
            return {
                key: name,
                header: f?.label.replace(/\s*\(.*\)$/, '') ?? name,
                align: f?.type === 'number' ? 'right' : undefined,
                width: name === meta.label_field && name !== meta.code_field ? 240 : undefined,
                render: r => name === meta.code_field
                    ? <strong style={{ whiteSpace: 'nowrap' }}><CellValue field={f} value={r[name]} labels={state.data?.labels[name]} /></strong>
                    : <CellValue field={f} value={r[name]} labels={state.data?.labels[name]} />,
            }
        }),
        { key: 'is_active', header: 'Status', render: r => <span className={`badge ${r.is_active === false ? '' : 'success'}`}>{r.is_active === false ? 'Inactive' : 'Active'}</span> },
        ...(canWrite ? [{
            key: '_actions', header: 'Actions', align: 'right' as const, render: (r: Row) => (
                <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <Button size="sm" icon="edit" onClick={() => setEditing(r)} aria-label={`Edit ${labelOf(r)}`}>Edit</Button>
                    {r.is_active === false
                        ? <Button size="sm" icon="undo" loading={busy} onClick={() => void setActive(r, true)} aria-label={`Reactivate ${labelOf(r)}`}>Reactivate</Button>
                        : <Button size="sm" variant="danger" icon="block" onClick={() => setDeactivating(r)} aria-label={`Deactivate ${labelOf(r)}`}>Deactivate</Button>}
                </div>
            ),
        }] : []),
    ]

    const d = state.data
    const pages = d ? Math.max(1, Math.ceil(d.total / d.limit)) : 1

    return (
        <Card
            title={meta.title}
            sub={d ? `${d.total} record${d.total === 1 ? '' : 's'}${showInactive ? ' including inactive' : ''}` : undefined}
            actions={canWrite ? <Button variant="primary" icon="add" onClick={() => setEditing('new')}>Add record</Button> : undefined}
        >
            <div className="row" style={{ marginBottom: 12 }}>
                {NO_SEARCH.has(meta.key) ? null : (
                    <div style={{ flex: '1 1 240px', maxWidth: 380 }}>
                        <Input type="search" aria-label={`Search ${meta.title}`} placeholder="Search by code, name or number..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
                    </div>
                )}
                <label className="checkbox">
                    <input type="checkbox" checked={showInactive} onChange={e => { setShowInactive(e.target.checked); setPage(1) }} />
                    Show inactive
                </label>
                <span className="spacer" />
                {state.loading && d ? <span className="muted small" role="status">Updating...</span> : null}
            </div>
            <Async state={state}>
                {data => (
                    <>
                        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
                        <DataTable
                            columns={columns}
                            rows={data.items}
                            empty={<Empty title={debounced ? 'No records match your search' : 'No records yet'} icon="database">{debounced ? 'Try a shorter search, or tick "Show inactive".' : canWrite ? 'Use the Add button to create the first one.' : undefined}</Empty>}
                        />
                        {data.total > data.limit ? (
                            <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                                <span className="muted small">Showing {(data.page - 1) * data.limit + 1} to {Math.min(data.total, data.page * data.limit)} of {data.total}</span>
                                <div className="row">
                                    <Button size="sm" icon="chevron_left" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                                    <span className="small">Page {data.page} of {pages}</span>
                                    <Button size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next<span className="material-symbols-outlined" aria-hidden="true">chevron_right</span></Button>
                                </div>
                            </div>
                        ) : null}
                    </>
                )}
            </Async>

            {editing ? (
                <RecordForm
                    key={editing === 'new' ? 'new' : editing.id}
                    meta={meta}
                    row={editing === 'new' ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={async (created) => { setEditing(null); toast.success(created ? 'Record created' : 'Changes saved'); setPage(1); await state.reload() }}
                />
            ) : null}

            <Modal
                open={!!deactivating}
                title="Deactivate record"
                onClose={() => setDeactivating(null)}
                footer={<>
                    <Button onClick={() => setDeactivating(null)}>Keep active</Button>
                    <Button variant="danger-solid" loading={busy} onClick={() => deactivating && void setActive(deactivating, false)}>Deactivate</Button>
                </>}
            >
                <p style={{ marginTop: 0 }}>Deactivate <strong>{deactivating ? labelOf(deactivating) : ''}</strong>?</p>
                <p className="muted small" style={{ marginBottom: 0 }}>It disappears from dropdowns and new documents, but existing documents that use it stay unchanged. You can reactivate it later with &quot;Show inactive&quot;.</p>
            </Modal>
        </Card>
    )
}

function CellValue({ field, value, labels }: { field?: MasterField; value: unknown; labels?: Record<string, string> }): ReactNode {
    if (value === null || value === undefined || value === '') return <span className="muted">—</span>
    switch (field?.type) {
        case 'fk': return labels?.[String(value)] ?? <span className="muted">—</span>
        case 'boolean': return value ? <span className="badge info">Yes</span> : <span className="muted">No</span>
        case 'number': return <span className="mono">{field.label.includes('₹') ? inr(value, true) : qty(value, 4)}</span>
        case 'date': return fmtDate(value)
        case 'tags': return Array.isArray(value) && value.length ? value.join(', ') : <span className="muted">—</span>
        default: return String(value)
    }
}

// ---------------------------------------------------------------------------------------------- create / edit form
type Vals = Record<string, string | number | boolean>

function initialValues(meta: MasterMeta, row: Row | null): Vals {
    const out: Vals = {}
    for (const f of meta.fields) {
        if (f.readonly) continue
        const v = row?.[f.name]
        if (f.type === 'boolean') out[f.name] = Boolean(v)
        else if (f.type === 'number') out[f.name] = v === null || v === undefined ? '' : Number(v)
        else if (f.type === 'date') out[f.name] = v ? String(v).slice(0, 10) : ''
        else if (f.type === 'tags') out[f.name] = Array.isArray(v) ? v.join(', ') : ''
        else out[f.name] = v === null || v === undefined ? '' : String(v)
    }
    return out
}

function RecordForm({ meta, row, onClose, onSaved }: { meta: MasterMeta; row: Row | null; onClose: () => void; onSaved: (created: boolean) => Promise<void> }) {
    const formId = useId()
    const [vals, setVals] = useState<Vals>(() => initialValues(meta, row))
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [serverError, setServerError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const fields = meta.fields.filter(f => !f.readonly)
    const set = (name: string, v: string | number | boolean) => { setVals(s => ({ ...s, [name]: v })); setErrors(e => ({ ...e, [name]: '' })) }

    function validate(): Record<string, string> {
        const e: Record<string, string> = {}
        for (const f of fields) {
            const v = vals[f.name]
            if (f.type === 'boolean') continue
            if (f.required && (v === '' || v === undefined)) e[f.name] = `${f.label} is required`
            if (f.type === 'number' && v !== '' && !Number.isFinite(Number(v))) e[f.name] = `${f.label} must be a number`
            if (f.type === 'fk' && f.fk === meta.key && row && v === row.id) e[f.name] = `${f.label} cannot be the record itself`
        }
        return e
    }

    async function submit(ev: React.FormEvent) {
        ev.preventDefault()
        const e = validate()
        setErrors(e)
        setServerError(null)
        if (Object.keys(e).length) return
        const body: Record<string, unknown> = {}
        for (const f of fields) {
            const v = vals[f.name]
            // Optional fields left empty are not sent (the server would store NULL, which some columns, like defaults, refuse).
            const wasEmpty = !row || row[f.name] === null || row[f.name] === undefined || (Array.isArray(row[f.name]) && (row[f.name] as unknown[]).length === 0)
            if (v === '' && !f.required && wasEmpty) continue
            body[f.name] = f.type === 'tags' ? String(v).split(',').map(s => s.trim()).filter(Boolean) : v
        }
        setBusy(true)
        try {
            if (row) await api.put(`/masters/${meta.key}/${row.id}`, body)
            else await api.post(`/masters/${meta.key}`, body)
            await onSaved(!row)
        } catch (x) {
            setServerError(x instanceof Error ? x.message : 'Could not save this record')
        } finally {
            setBusy(false)
        }
    }

    const singular = meta.title.replace(/\s*\(.*\)$/, '')
    return (
        <Modal
            open
            wide={fields.length > 8}
            title={`${row ? 'Edit record' : 'New record'}: ${singular}`}
            onClose={onClose}
            footer={<>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" form={formId} loading={busy}>{row ? 'Save changes' : 'Create'}</Button>
            </>}
        >
            <form id={formId} onSubmit={e => void submit(e)} noValidate>
                {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
                {Object.values(errors).some(Boolean) ? <Alert tone="warn">Fix the highlighted fields and try again.</Alert> : null}
                <div className="form-grid">
                    {fields.map(f => (
                        <FieldControl key={f.name} field={f} value={vals[f.name]} error={errors[f.name]} onChange={v => set(f.name, v)} autoFocus={f === fields[0]} />
                    ))}
                </div>
            </form>
        </Modal>
    )
}

function FieldControl({ field: f, value, error, onChange, autoFocus }: { field: MasterField; value: string | number | boolean; error?: string; onChange: (v: string | number | boolean) => void; autoFocus?: boolean }) {
    const label = <>{f.label}{f.required ? <span aria-hidden="true" style={{ color: 'var(--danger)' }}> *</span> : null}</>
    const wide = f.type === 'textarea' || f.type === 'tags' ? 'full' : ''
    if (f.type === 'boolean') {
        return (
            <Field className={wide} hint={f.hint} error={error}>
                <label className="checkbox" style={{ marginTop: 6 }}>
                    <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
                    {f.label}
                </label>
            </Field>
        )
    }
    return (
        <Field label={label} hint={f.type === 'tags' ? (f.hint ?? 'Separate with commas') : f.hint} error={error} className={wide}>
            {f.type === 'textarea' ? <Textarea value={String(value)} onChange={e => onChange(e.target.value)} aria-required={f.required} />
                : f.type === 'number' ? <NumberInput value={value === '' ? '' : Number(value)} onChange={v => onChange(v)} step="any" aria-required={f.required} />
                : f.type === 'date' ? <Input type="date" value={String(value)} onChange={e => onChange(e.target.value)} aria-required={f.required} />
                : f.type === 'select' ? (
                    <Select value={String(value)} onChange={e => onChange(e.target.value)} aria-required={f.required}>
                        <option value="">Select...</option>
                        {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </Select>
                )
                : f.type === 'fk' ? <MasterSelect master={f.fk!} value={String(value)} onChange={id => onChange(id)} />
                : <Input value={String(value)} onChange={e => onChange(e.target.value)} autoFocus={autoFocus} aria-required={f.required} />}
        </Field>
    )
}
