import type { EnquiryRecord } from '../EnquiryFormModal'

export interface Activity {
    id: string
    activity_type: string
    from_status: string | null
    to_status: string | null
    note: string | null
    created_at: string
    created_by_user: { full_name: string } | null
}
export interface BoqVersion {
    id: string
    boq_no: string
    version_no: number
    status: string
    est_total_cost: number
    sell_total: number
    gross_margin_pct: number
}
export interface Quotation {
    id: string
    quotation_no: string
    revision_no: number
    boq_id: string
    quotation_date: string
    valid_until: string | null
    subtotal_amount: number
    gst_pct: number
    terms: string | null
    status: string
}
export interface WorkOrder {
    id: string
    wo_no: string
    client_ref_no: string | null
    quotation_id: string | null
    contract_value: number
    advance_pct: number
    retention_pct: number
    status: string
    signed_on: string | null
    project_id: string | null
    client: { legal_name: string }
    created_at: string
}
export interface Enquiry extends EnquiryRecord {
    status: string
    enquiry_date: string
    site_visit_date: string | null
    outcome_reason: string | null
    project_id: string | null
    sales_person: { full_name: string } | null
    project: { id: string; project_code: string; name: string } | null
    project_type: { name: string } | null
    enquiry_activities: Activity[]
    boq_headers: BoqVersion[]
    quotations: Quotation[]
    client_work_orders: WorkOrder[]
}

export const STEPS: { id: string; label: string }[] = [
    { id: 'NEW', label: 'New' },
    { id: 'SITE_VISIT', label: 'Site visit' },
    { id: 'BOQ_SUBMITTED', label: 'BOQ submitted' },
    { id: 'QUOTATION_SENT', label: 'Quotation sent' },
    { id: 'WON', label: 'Won' },
]
export const stepIndex = (status: string) => STEPS.findIndex(s => s.id === status)
