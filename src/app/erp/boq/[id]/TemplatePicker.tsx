'use client'
import { useMemo, useState } from 'react'
import { useApi } from '@/lib/api'
import { Async, Button, Empty, Input, Modal, Money } from '@/components/ui'
import type { GLine } from './types'

interface Template {
    id: string
    template_code: string
    version_no: number
    description: string
    cost_centre_id: string
    trade_id: string
    uom_id: string
    default_cost_rate: number
    default_selling_rate: number
}
interface Listing { items: Template[]; labels: Record<string, Record<string, string>> }

/** Same defaults as lineFromTemplate() on the server: rates come from the template and can be edited after. */
function lineFromTemplate(t: Template, qty: number): Omit<GLine, 'key'> {
    return {
        template_id: t.id, item_id: null, cost_centre_id: t.cost_centre_id, trade_id: t.trade_id, description: t.description, uom_id: t.uom_id,
        qty, est_cost_rate: Number(t.default_cost_rate), selling_rate: Number(t.default_selling_rate),
    }
}

export function TemplatePicker({ onClose, onAdd }: { onClose: () => void; onAdd: (lines: Omit<GLine, 'key'>[]) => void }) {
    const state = useApi<Listing>('/masters/boq-templates?limit=200')
    return (
        <Modal open wide title="Import from work-item templates" onClose={onClose}>
            <Async state={state}>{d => <Picker data={d} onClose={onClose} onAdd={onAdd} />}</Async>
        </Modal>
    )
}

function Picker({ data, onClose, onAdd }: { data: Listing; onClose: () => void; onAdd: (lines: Omit<GLine, 'key'>[]) => void }) {
    const [search, setSearch] = useState('')
    const [picked, setPicked] = useState<Record<string, number | ''>>({})
    // Only the newest version of each template code is offered.
    const latest = useMemo(() => {
        const m = new Map<string, Template>()
        for (const t of data.items) { const c = m.get(t.template_code); if (!c || t.version_no > c.version_no) m.set(t.template_code, t) }
        return [...m.values()].sort((a, b) => a.template_code.localeCompare(b.template_code))
    }, [data.items])
    const q = search.trim().toLowerCase()
    const rows = latest.filter(t => !q || `${t.template_code} ${t.description}`.toLowerCase().includes(q))
    const label = (field: string, id: string) => data.labels?.[field]?.[id] ?? '—'
    const chosen = latest.filter(t => t.id in picked)

    function toggle(t: Template) {
        setPicked(p => {
            const next = { ...p }
            if (t.id in next) delete next[t.id]; else next[t.id] = 1
            return next
        })
    }

    return (
        <>
            <div className="row" style={{ marginBottom: 12 }}>
                <div style={{ flex: '1 1 260px', maxWidth: 420 }}>
                    <Input type="search" aria-label="Search templates" placeholder="Search templates" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <span className="muted small">{chosen.length} selected</span>
            </div>
            {rows.length ? (
                <div className="table-wrap" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                    <table className="table">
                        <thead>
                            <tr><th style={{ width: 36 }}><span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Select</span></th><th>Template</th><th>Cost centre</th><th>Trade</th><th className="num">Cost rate</th><th className="num">Sell rate</th><th className="num" style={{ width: 110 }}>Qty</th></tr>
                        </thead>
                        <tbody>
                            {rows.map(t => (
                                <tr key={t.id}>
                                    <td><input type="checkbox" aria-label={`Select ${t.template_code}`} checked={t.id in picked} onChange={() => toggle(t)} /></td>
                                    <td><div className="strong">{t.template_code}</div><div className="small">{t.description}</div></td>
                                    <td>{label('cost_centre_id', t.cost_centre_id)}</td>
                                    <td>{label('trade_id', t.trade_id)}</td>
                                    <td className="num"><Money value={t.default_cost_rate} />/{label('uom_id', t.uom_id).split(' · ')[0]}</td>
                                    <td className="num"><Money value={t.default_selling_rate} /></td>
                                    <td className="num">
                                        {t.id in picked ? (
                                            <input type="number" className="input num cell-input" aria-label={`Quantity for ${t.template_code}`} min={0} step="any" value={picked[t.id]}
                                                onChange={e => setPicked(p => ({ ...p, [t.id]: e.target.value === '' ? '' : Number(e.target.value) }))} />
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : <Empty title="No templates found" icon="search">{latest.length ? 'Try another search.' : 'Add work-item templates in Master data first.'}</Empty>}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" icon="add" disabled={!chosen.length} onClick={() => onAdd(chosen.map(t => lineFromTemplate(t, Number(picked[t.id]) || 0)))}>
                    Add {chosen.length || ''} line{chosen.length === 1 ? '' : 's'}
                </Button>
            </div>
        </>
    )
}
