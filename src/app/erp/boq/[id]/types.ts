export interface Opt { id: string; label: string; code: string }

export interface ServerLine {
    id: string
    code: string
    cost_centre_id: string
    trade_id: string | null
    item_id: string | null
    template_id: string | null
    description: string
    uom_id: string
    qty: number
    est_cost_rate: number
    selling_rate: number
}
export interface ServerMaterial {
    id: string
    boq_line_id: string
    line_code: string
    item_id: string
    planned_qty: number
    planned_rate: number
    item: { item_code: string; name: string }
    uom: { code: string }
}
export interface Boq {
    id: string
    boq_no: string
    version_no: number
    status: 'DRAFT' | 'BASELINE_LOCKED' | 'SUPERSEDED' | string
    enquiry_id: string | null
    project_id: string | null
    locked_at: string | null
    enquiry: { id: string; enquiry_no: string; client_name: string; project_name: string } | null
    project: { id: string; project_code: string; name: string } | null
    lines: ServerLine[]
    materials: ServerMaterial[]
    totals: { est_total_cost: number; sell_total: number; gross_profit: number; gross_margin_pct: number }
}

/** A line in the grid. `key` is the server id for saved lines or a client id for new ones. */
export interface GLine {
    key: string
    template_id: string | null
    item_id: string | null
    cost_centre_id: string
    trade_id: string
    description: string
    uom_id: string
    qty: number | ''
    est_cost_rate: number | ''
    selling_rate: number | ''
}
export interface GMat {
    key: string
    line_key: string
    item_id: string
    item_label: string
    uom_code: string
    planned_qty: number | ''
    planned_rate: number | ''
}
export interface Draft { lines: GLine[]; mats: GMat[] }

export const num = (v: number | ''): number => (v === '' ? 0 : v)
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100
export const marginPct = (cost: number, sell: number) => (sell > 0 ? ((sell - cost) / sell) * 100 : 0)

export function fromServer(b: Boq): Draft {
    return {
        lines: b.lines.map(l => ({
            key: l.id, template_id: l.template_id, item_id: l.item_id, cost_centre_id: l.cost_centre_id, trade_id: l.trade_id ?? '', description: l.description,
            uom_id: l.uom_id, qty: l.qty, est_cost_rate: l.est_cost_rate, selling_rate: l.selling_rate,
        })),
        mats: b.materials.map(m => ({
            key: m.id, line_key: m.boq_line_id, item_id: m.item_id, item_label: `${m.item.item_code} · ${m.item.name}`, uom_code: m.uom.code, planned_qty: m.planned_qty, planned_rate: m.planned_rate,
        })),
    }
}

export const codeFor = (index: number) => `BOQ-${String(index + 1).padStart(2, '0')}`

/** Problems that would stop a save, per field, so the grid can mark them. */
export interface Problems { messages: string[]; line: Record<string, Set<string>>; mat: Record<string, Set<string>> }
export function validate(d: Draft): Problems {
    const p: Problems = { messages: [], line: {}, mat: {} }
    const mark = (bag: Record<string, Set<string>>, key: string, field: string) => { (bag[key] ??= new Set()).add(field) }
    if (!d.lines.length) p.messages.push('Add at least one BOQ line.')
    d.lines.forEach((l, i) => {
        const at = `Line ${i + 1}`
        if (!l.cost_centre_id) { mark(p.line, l.key, 'cc'); p.messages.push(`${at}: choose a cost centre.`) }
        if (!l.description.trim()) { mark(p.line, l.key, 'desc'); p.messages.push(`${at}: enter a description.`) }
        if (!l.uom_id) { mark(p.line, l.key, 'uom'); p.messages.push(`${at}: choose a unit.`) }
        if (l.qty === '' || l.qty < 0) { mark(p.line, l.key, 'qty'); p.messages.push(`${at}: enter a quantity (zero or more).`) }
        if (l.est_cost_rate === '' || l.est_cost_rate < 0) { mark(p.line, l.key, 'cost'); p.messages.push(`${at}: enter an estimated cost rate (zero or more).`) }
        if (l.selling_rate === '' || l.selling_rate < 0) { mark(p.line, l.key, 'sell'); p.messages.push(`${at}: enter a selling rate (zero or more).`) }
    })
    const seen = new Set<string>()
    d.mats.forEach((m, i) => {
        const at = `Material ${i + 1}`
        if (!m.item_id) { mark(p.mat, m.key, 'item'); p.messages.push(`${at}: choose an item.`) }
        if (m.planned_qty === '' || m.planned_qty <= 0) { mark(p.mat, m.key, 'qty'); p.messages.push(`${at}: planned quantity must be above zero.`) }
        if (m.planned_rate === '' || m.planned_rate < 0) { mark(p.mat, m.key, 'rate'); p.messages.push(`${at}: enter a rate (zero or more).`) }
        const pair = `${m.line_key}|${m.item_id}`
        if (m.item_id && seen.has(pair)) { mark(p.mat, m.key, 'item'); p.messages.push(`${at}: the same item is already planned for this line. Combine the quantities.`) }
        seen.add(pair)
    })
    return p
}

/** Client-side id for new rows (randomUUID needs a secure context, so fall back on plain pages). */
export const uid = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)
