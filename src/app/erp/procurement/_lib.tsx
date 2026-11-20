'use client'
import { useMemo } from 'react'
import { useApi } from '@/lib/api'
import { toNum } from '@/lib/format'

/** Helpers shared by the procurement, inventory and subcontractor screens (private folder, not a route). */

/** Roles that may read RFQs and act on the purchase side (matches the API). */
export const PURCHASE_READERS = ['PURCHASE_MGR', 'DIRECTOR', 'PROJECT_MANAGER', 'PROJECT_HEAD']
/** Roles that create RFQs, record quotes, award and raise purchase orders. */
export const PURCHASERS = ['PURCHASE_MGR', 'DIRECTOR']

export interface ItemInfo {
    id: string
    item_code: string
    name: string
    purchase_uom_id: string
    uom: string
    base_uom: string
    factor: number
    std_rate: number
    gst_pct: number
}

interface ItemsResp { items: Record<string, unknown>[]; labels: Record<string, Record<string, string>> }
interface HsnResp { items: { id: string; default_gst_tax_id: string | null }[] }
interface GstResp { items: { id: string; total_rate_pct: number }[] }

const codeOf = (label: string | undefined) => (label ?? '').split(' · ')[0]

/** Item master with purchase UOM, conversion factor, standard cost and default GST rate. */
export function useItemCatalogue() {
    const items = useApi<ItemsResp>('/masters/items?limit=200')
    const hsn = useApi<HsnResp>('/masters/hsn-sac?limit=200')
    const gst = useApi<GstResp>('/masters/gst-taxes?limit=200')
    const list = useMemo<ItemInfo[]>(() => {
        if (!items.data) return []
        const gstById = new Map((gst.data?.items ?? []).map(g => [g.id, toNum(g.total_rate_pct)]))
        const hsnTax = new Map((hsn.data?.items ?? []).map(h => [h.id, h.default_gst_tax_id]))
        return items.data.items.map(r => {
            const taxId = hsnTax.get(String(r.hsn_sac_id))
            return {
                id: String(r.id),
                item_code: String(r.item_code),
                name: String(r.name),
                purchase_uom_id: String(r.purchase_uom_id),
                uom: codeOf(items.data!.labels.purchase_uom_id?.[String(r.purchase_uom_id)]),
                base_uom: codeOf(items.data!.labels.base_uom_id?.[String(r.base_uom_id)]),
                factor: toNum(r.purchase_to_base_factor) || 1,
                std_rate: toNum(r.standard_cost_rate),
                gst_pct: taxId ? gstById.get(taxId) ?? 0 : 0,
            }
        })
    }, [items.data, hsn.data, gst.data])
    const byId = useMemo(() => new Map(list.map(i => [i.id, i])), [list])
    return { items: list, byId, loading: items.loading || hsn.loading || gst.loading, error: items.error, reload: items.reload }
}

export interface ApprovalRule {
    id: string
    doc_type: string
    branch_id: string | null
    step_order: number
    min_amount: number
    max_amount: number | null
    max_inclusive: boolean
    is_active: boolean
    approver_role: { code: string; name: string }
}

/** Mirrors the server's rule matching (engines/workflow.ts matchRules) so the tier can be shown before submit. */
export function matchRules(rules: ApprovalRule[], docType: string, branchId: string | null | undefined, amount: number): ApprovalRule[] {
    const inBand = rules
        .filter(r => r.is_active && r.doc_type === docType && (r.branch_id === null || r.branch_id === branchId))
        .filter(r => {
            if (amount < toNum(r.min_amount)) return false
            if (r.max_amount === null) return true
            return r.max_inclusive ? amount <= toNum(r.max_amount) : amount < toNum(r.max_amount)
        })
        .sort((a, b) => a.step_order - b.step_order)
    const branchRules = inBand.filter(r => r.branch_id)
    return branchRules.length ? branchRules : inBand
}

export function useApprovalRules() {
    return useApi<{ items: ApprovalRule[] }>('/admin/approval-rules')
}

/** Display of an approval band, e.g. "Below ₹25,000" or "₹1,00,000 and above". */
export function bandLabel(rules: ApprovalRule[]): string {
    const r = rules[0]
    if (!r) return ''
    const f = (v: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v)}`
    if (r.max_amount === null) return `Above ${f(toNum(r.min_amount))}`
    if (toNum(r.min_amount) <= 0) return `Up to ${f(toNum(r.max_amount))}${r.max_inclusive ? '' : ' (exclusive)'}`
    return `${f(toNum(r.min_amount))} to ${f(toNum(r.max_amount))}`
}
