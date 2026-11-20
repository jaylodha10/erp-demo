import { NextRequest, NextResponse } from 'next/server'
import {
    DEMO_USERS,
    BRANCHES,
    ROLES,
    UOMS,
    GST_RATES,
    TDS_SECTIONS,
    COST_CENTRES,
    TRADES,
    ITEMS,
    CLIENTS,
    VENDORS,
    SUBCONTRACTORS,
    EXPENSE_CATEGORIES,
    WAREHOUSES,
    STAGES,
    BOQ_TEMPLATES,
    type DemoUser,
} from '@/mock/store'
import {
    MOCK_PROJECTS,
    MOCK_ENQUIRIES,
    MOCK_BOQ,
    MOCK_PURCHASE_ORDERS,
    MOCK_PURCHASE_QUEUE,
    MOCK_VARIATIONS,
    MOCK_SUBCONTRACTORS,
    MOCK_PURCHASE_INVOICES,
    MOCK_SALES_INVOICES,
    MOCK_RECEIPTS,
    MOCK_PETTY_CASH,
    MOCK_INBOX_ITEMS,
    MOCK_NOTIFICATIONS,
    MOCK_EXCEPTIONS,
    type MockProject,
} from '@/mock/data'

export const dynamic = 'force-dynamic'

// Mutable runtime state during user interaction in the demo
class DemoState {
    projects = [...MOCK_PROJECTS]
    enquiries = [...MOCK_ENQUIRIES]
    boq = JSON.parse(JSON.stringify(MOCK_BOQ))
    purchaseOrders = [...MOCK_PURCHASE_ORDERS]
    purchaseQueue = [...MOCK_PURCHASE_QUEUE]
    variations = [...MOCK_VARIATIONS]
    subcontractors = [...MOCK_SUBCONTRACTORS]
    purchaseInvoices = [...MOCK_PURCHASE_INVOICES]
    salesInvoices = [...MOCK_SALES_INVOICES]
    receipts = [...MOCK_RECEIPTS]
    pettyCash = JSON.parse(JSON.stringify(MOCK_PETTY_CASH))
    inbox = [...MOCK_INBOX_ITEMS]
    notifications = [...MOCK_NOTIFICATIONS]
    exceptions = [...MOCK_EXCEPTIONS]
    currentUserKey = 'rohit'
}

// Global state instance across requests
const state = new DemoState()

function getUser(req: NextRequest): DemoUser {
    const cookieUser = req.cookies.get('r9_demo_user')?.value
    const key = cookieUser && DEMO_USERS[cookieUser] ? cookieUser : state.currentUserKey
    return DEMO_USERS[key] ?? DEMO_USERS.rohit
}

function parseJson(req: NextRequest): Promise<any> {
    return req.json().catch(() => ({}))
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
    const segments = (await params).path ?? []
    const path = '/' + segments.join('/')
    const url = new URL(req.url)
    const q = Object.fromEntries(url.searchParams.entries())
    const user = getUser(req)

    // 1. Auth & Session
    if (path === '/auth/me') {
        return NextResponse.json({ user })
    }

    // 2. Dashboards
    if (path === '/dashboards/ceo-summary') {
        const active = state.projects.filter(p => p.status === 'ACTIVE')
        const totalContract = active.reduce((s, p) => s + p.total_contract, 0)
        const unbilled = active.reduce((s, p) => s + Math.max(0, p.total_contract - p.billed), 0)
        const receivables = state.salesInvoices.reduce((s, i) => s + i.balance_due, 0)
        const vendorPayable = state.purchaseInvoices.reduce((s, i) => s + i.balance_due, 0)
        const pendingApprovals = state.inbox.filter(i => i.status === 'PENDING').length

        return NextResponse.json({
            sales_pipeline: {
                open_enquiries: state.enquiries.filter(e => e.status !== 'WON' && e.status !== 'LOST').length,
                value: state.enquiries.filter(e => e.status !== 'WON' && e.status !== 'LOST').reduce((s, e) => s + e.expected_value, 0),
                by_status: [
                    { status: 'NEW', count: 1, value: 5400000 },
                    { status: 'SITE_VISIT', count: 1, value: 3800000 },
                    { status: 'BOQ_SUBMITTED', count: 1, value: 12500000 },
                    { status: 'QUOTATION_SENT', count: 1, value: 6200000 },
                ],
            },
            order_book: {
                total_contract_value: totalContract,
                unbilled_balance: unbilled,
            },
            active_projects: active.length,
            projects_at_risk: active.filter(p => p.at_risk).map(p => ({
                project_id: p.id,
                project_code: p.project_code,
                name: p.name,
                reasons: p.risk_reasons,
                projected_margin_pct: p.projected_margin_pct,
                schedule_status: p.schedule_status,
            })),
            receivables,
            payables: {
                total: vendorPayable,
                vendors: vendorPayable,
                subcontractors: 0,
                on_hold_mismatch: 0,
            },
            projected_profit: {
                value: active.reduce((s, p) => s + p.projected_profit, 0),
                on_contract_value: totalContract,
            },
            open_exceptions: state.exceptions.filter(e => e.status === 'OPEN').length,
            pending_approvals: pendingApprovals,
            projects: active.map(p => ({
                project_id: p.id,
                project_code: p.project_code,
                name: p.name,
                client: p.client.legal_name,
                total_contract: p.total_contract,
                actual_total: p.actual_total,
                eac: p.eac,
                projected_profit: p.projected_profit,
                projected_margin_pct: p.projected_margin_pct,
                physical_progress_pct: p.physical_progress_pct,
                schedule_status: p.schedule_status,
                at_risk: p.at_risk,
            })),
        })
    }

    if (path === '/dashboards/project-profitability') {
        let list = [...state.projects]
        if (q.status) list = list.filter(p => p.status === q.status)
        if (q.project_id) list = list.filter(p => p.id === q.project_id)
        return NextResponse.json({
            items: list,
            totals: {
                total_contract: list.reduce((s, p) => s + p.total_contract, 0),
                baseline_estimated_cost: list.reduce((s, p) => s + p.baseline_estimated_cost, 0),
                po_committed: list.reduce((s, p) => s + p.po_committed, 0),
                site_stock_value: list.reduce((s, p) => s + p.site_stock_value, 0),
                actual_total: list.reduce((s, p) => s + p.actual_total, 0),
                eac: list.reduce((s, p) => s + p.eac, 0),
                projected_profit: list.reduce((s, p) => s + p.projected_profit, 0),
            },
        })
    }

    // 3. Projects
    if (path === '/projects') {
        let items = [...state.projects]
        if (q.status) items = items.filter(p => p.status === q.status)
        return NextResponse.json({ items })
    }

    if (path === '/project-stages') {
        return NextResponse.json({ stages: STAGES })
    }

    if (path.startsWith('/projects/') && path.endsWith('/workspace')) {
        const id = segments[1]
        const project = state.projects.find(p => p.id === id) ?? state.projects[0]
        return NextResponse.json({
            project,
            boq: state.boq,
            pos: state.purchaseOrders.filter(p => p.project_id === project.id),
            subcontractors: state.subcontractors.filter(s => s.project_id === project.id),
            variations: state.variations.filter(v => v.project_id === project.id),
            stock: [
                { item_code: 'ITM-CIV-01', item_name: 'UltraTech PPC Cement', quantity: 120, uom: 'BAG', value: 46800 },
                { item_code: 'ITM-CIV-02', item_name: 'River Sand', quantity: 650, uom: 'CFT', value: 42250 },
                { item_code: 'ITM-FLR-01', item_name: 'Kajaria 800x800 Tile', quantity: 45, uom: 'BOX', value: 51750 },
                { item_code: 'ITM-CEL-01', item_name: 'Gyproc 12.5mm Board', quantity: 28, uom: 'SHEET', value: 13440 },
                { item_code: 'ITM-CAR-01', item_name: 'Sainik 710 18mm Ply', quantity: 42, uom: 'SHEET', value: 102900 },
            ],
            attendance: [
                { date: '2026-11-20', trade: 'Carpenter', count: 6, total_wage: 5700 },
                { date: '2026-11-20', trade: 'Painter', count: 4, total_wage: 3200 },
                { date: '2026-11-20', trade: 'Electrician', count: 2, total_wage: 1800 },
                { date: '2026-11-20', trade: 'Helper', count: 3, total_wage: 1800 },
            ],
        })
    }

    if (path.startsWith('/projects/') && path.endsWith('/boq-vs-actual')) {
        return NextResponse.json({
            lines: state.boq.lines.map((l: any) => ({
                trade_code: l.trade_code,
                trade_name: l.trade_name,
                description: l.description,
                uom: l.uom,
                boq_qty: l.quantity,
                boq_cost_rate: l.cost_rate,
                boq_cost_amount: l.cost_amount,
                actual_qty: Math.round(l.quantity * 0.65),
                actual_cost_amount: Math.round(l.cost_amount * 0.62),
                variance_amount: Math.round(l.cost_amount * 0.03),
                status: 'ON_TRACK',
            })),
        })
    }

    if (path.startsWith('/projects/') && segments.length === 2) {
        const id = segments[1]
        const project = state.projects.find(p => p.id === id) ?? state.projects[0]
        return NextResponse.json(project)
    }

    // 4. Enquiries & BOQ
    if (path === '/enquiries') {
        const items = state.enquiries
        return NextResponse.json({
            items,
            summary: {
                total: items.length,
                open: items.filter(e => e.status !== 'WON' && e.status !== 'LOST').length,
                pipeline_value: items.filter(e => e.status !== 'WON' && e.status !== 'LOST').reduce((s, e) => s + e.expected_value, 0),
                quotations_awaiting_wo: items.filter(e => e.status === 'QUOTATION_SENT').length,
                followups_due: items.filter(e => e.next_followup_date).length,
            },
        })
    }

    if (path.startsWith('/enquiries/') && segments.length === 2) {
        const id = segments[1]
        const enquiry = state.enquiries.find(e => e.id === id) ?? state.enquiries[0]
        return NextResponse.json({
            ...enquiry,
            client: CLIENTS[0],
            quotations: [
                {
                    id: 'quot-01',
                    quotation_no: 'QUOT-JPR-2026-031',
                    version_no: 1,
                    subtotal: 4850000,
                    gst_pct: 18,
                    gst_amount: 873000,
                    grand_total: 5723000,
                    status: 'ACCEPTED',
                    created_at: '2026-09-22T14:00:00Z',
                    valid_until: '2026-10-22',
                    terms: '1. 10% Mobilisation advance\n2. Running bills fortnightly\n3. 5% Retention held for 6 months defect liability period\n4. Electricity and water provided by client at site',
                },
            ],
            boqs: [
                {
                    id: 'boq-udr-015',
                    boq_no: 'BOQ-UDR-2026-015',
                    version_no: 1,
                    status: 'BASELINE_LOCKED',
                    total_selling_amount: 4850000,
                    total_estimated_cost: 3650000,
                    gross_margin_pct: 24.74,
                },
            ],
            work_order: {
                id: 'wo-client-01',
                wo_number: 'MRV/WO/2026/045',
                wo_date: '2026-09-28',
                contract_value: 4850000,
                status: 'APPROVED',
                client_contact: 'Mr. Arvind Singhania (+91-98290-11223)',
            },
        })
    }

    if (path === '/boqs') {
        return NextResponse.json({ items: [state.boq] })
    }

    if (path.startsWith('/boqs/') && segments.length === 2) {
        return NextResponse.json(state.boq)
    }

    if (path === '/boq-templates') {
        return NextResponse.json({ items: BOQ_TEMPLATES })
    }

    // 5. Variations
    if (path === '/variations') {
        return NextResponse.json({ items: state.variations })
    }

    if (path.startsWith('/variations/') && segments.length === 2) {
        const id = segments[1]
        const v = state.variations.find(x => x.id === id) ?? state.variations[0]
        return NextResponse.json(v)
    }

    // 6. Procurement
    if (path === '/procurement/queue') {
        return NextResponse.json({ items: state.purchaseQueue })
    }

    if (path === '/procurement/purchase-orders') {
        return NextResponse.json({ items: state.purchaseOrders })
    }

    if (path.startsWith('/procurement/purchase-orders/') && segments.length === 3) {
        const id = segments[2]
        const po = state.purchaseOrders.find(p => p.id === id) ?? state.purchaseOrders[0]
        return NextResponse.json(po)
    }

    if (path === '/procurement/rfqs') {
        return NextResponse.json({
            items: [
                {
                    id: 'rfq-01',
                    rfq_no: 'RFQ-JPR-2026-018',
                    project_code: 'R9-2026-015',
                    title: 'Lighting Fixtures and RGB Strip Procurement',
                    status: 'QUOTES_RECEIVED',
                    due_date: '2026-11-22',
                    created_by: 'Priya Nair',
                    vendors_count: 3,
                },
            ],
        })
    }

    if (path.startsWith('/procurement/rfqs/') && segments.length === 3) {
        return NextResponse.json({
            id: 'rfq-01',
            rfq_no: 'RFQ-JPR-2026-018',
            project_code: 'R9-2026-015',
            title: 'Lighting Fixtures and RGB Strip Procurement',
            status: 'QUOTES_RECEIVED',
            due_date: '2026-11-22',
            items: [
                { item_code: 'ITM-MEP-02', name: 'Philips 24W Track Light', qty: 48, uom: 'NOS' },
                { item_code: 'ITM-MEP-03', name: 'Philips 15W LED Panels', qty: 1, uom: 'LOT' },
            ],
            quotes: [
                { vendor_name: 'CoolAir and BrightLight MEP Solutions', total_amount: 142000, is_lowest: true, payment_terms: '30 Days' },
                { vendor_name: 'Udaipur Hardware Mart', total_amount: 149500, is_lowest: false, payment_terms: '15 Days' },
            ],
        })
    }

    // 7. Inventory
    if (path === '/inventory/warehouses') {
        return NextResponse.json({ items: WAREHOUSES })
    }

    if (path === '/inventory/stock') {
        const stockItems = ITEMS.map((item, idx) => ({
            id: `stk-${idx}`,
            item_code: item.item_code,
            item_name: item.name,
            category: item.category,
            base_uom: item.base_uom,
            purchase_uom: item.purchase_uom,
            standard_cost_rate: item.standard_cost_rate,
            total_stock: (idx + 1) * 35,
            reserved_stock: idx * 5,
            available_stock: (idx + 1) * 35 - idx * 5,
            total_value: ((idx + 1) * 35) * item.standard_cost_rate,
            warehouse_balances: [
                { warehouse_code: 'WH-SITE-UDR-015', qty: (idx + 1) * 20 },
                { warehouse_code: 'WH-CENTRAL-JPR', qty: (idx + 1) * 15 },
            ],
        }))
        return NextResponse.json({ items: stockItems })
    }

    if (path === '/inventory/ledger') {
        return NextResponse.json({
            items: [
                { id: 'tx-1', date: '2026-11-18', doc_no: 'GRN-015-08', type: 'RECEIPT', item_code: 'ITM-CAR-01', item_name: 'Sainik 710 18mm Ply', qty: 150, uom: 'SHEET', warehouse: 'WH-SITE-UDR-015', balance_after: 150 },
                { id: 'tx-2', date: '2026-11-19', doc_no: 'ISS-015-12', type: 'ISSUE', item_code: 'ITM-CAR-01', item_name: 'Sainik 710 18mm Ply', qty: -40, uom: 'SHEET', warehouse: 'WH-SITE-UDR-015', balance_after: 110 },
                { id: 'tx-3', date: '2026-11-15', doc_no: 'GRN-015-07', type: 'RECEIPT', item_code: 'ITM-FLR-01', item_name: 'Kajaria 800x800 Tile', qty: 180, uom: 'BOX', warehouse: 'WH-SITE-UDR-015', balance_after: 180 },
                { id: 'tx-4', date: '2026-11-16', doc_no: 'ISS-015-11', type: 'ISSUE', item_code: 'ITM-FLR-01', item_name: 'Kajaria 800x800 Tile', qty: -135, uom: 'BOX', warehouse: 'WH-SITE-UDR-015', balance_after: 45 },
            ],
        })
    }

    // 8. Subcontractors
    if (path === '/subcontractors/work-orders') {
        return NextResponse.json({ items: state.subcontractors })
    }

    if (path.startsWith('/subcontractors/work-orders/') && path.endsWith('/measurements')) {
        return NextResponse.json({
            items: [
                { id: 'ms-1', date: '2026-11-10', item_description: 'Toughened glass partition installed (Shopfront)', qty: 380, uom: 'SQFT', rate: 1000, amount: 380000, is_billed: true },
            ],
        })
    }

    if (path.startsWith('/subcontractors/work-orders/') && segments.length === 3) {
        const id = segments[2]
        const swo = state.subcontractors.find(s => s.id === id) ?? state.subcontractors[0]
        return NextResponse.json(swo)
    }

    if (path === '/subcontractors/running-bills') {
        return NextResponse.json({
            items: [
                {
                    id: 'srb-01',
                    bill_no: 'SRB-2026-003',
                    work_order_no: 'SWO-UDR-2026-003',
                    subcontractor_name: 'Mewar Glass and Glazing Works',
                    project_code: 'R9-2026-015',
                    bill_date: '2026-11-12',
                    gross_amount: 380000,
                    retention_amount: 19000,
                    tds_amount: 7600,
                    net_payable: 353400,
                    status: 'APPROVED',
                },
            ],
        })
    }

    // 9. Finance
    if (path === '/finance/purchase-invoices') {
        return NextResponse.json({ items: state.purchaseInvoices })
    }

    if (path === '/finance/sales-invoices') {
        return NextResponse.json({ items: state.salesInvoices })
    }

    if (path === '/finance/client-receipts') {
        return NextResponse.json({ items: state.receipts })
    }

    if (path === '/finance/payables') {
        const vendorPayable = state.purchaseInvoices.reduce((s, i) => s + i.balance_due, 0)
        return NextResponse.json({
            summary: {
                total_payables: vendorPayable,
                vendor_invoices: vendorPayable,
                subcontractor_bills: 0,
                due_in_7_days: 0,
                overdue: 0,
            },
            vendors: VENDORS.map(v => ({
                id: v.id,
                legal_name: v.legal_name,
                code: v.code,
                total_outstanding: v.code === 'V-JPR-003' ? 453915 : 0,
                overdue_amount: 0,
            })),
            subcontractors: [],
        })
    }

    if (path === '/finance/vendor-payments') {
        return NextResponse.json({
            items: [
                {
                    id: 'pay-01',
                    payment_no: 'PAY-2026-012',
                    payment_date: '2026-10-18',
                    vendor_name: 'Mewar Building Material Suppliers',
                    amount: 530550,
                    payment_mode: 'NEFT',
                    reference_no: 'HDFCR9PAY202610189',
                    invoice_no: 'PINV-052',
                    project_code: 'R9-2026-015',
                },
            ],
        })
    }

    if (path === '/finance/direct-expenses') {
        return NextResponse.json({
            items: [
                {
                    id: 'dexp-01',
                    voucher_no: 'EXP-2026-009',
                    date: '2026-10-05',
                    project_code: 'R9-2026-015',
                    category_name: 'Crane / Boom Lift Hire',
                    amount: 45000,
                    vendor_or_payee: 'Udaipur Heavy Equipment Rental',
                    has_bill_photo: true,
                    status: 'APPROVED',
                    approved_by: 'Amit Verma',
                },
                {
                    id: 'dexp-02',
                    voucher_no: 'EXP-2026-010',
                    date: '2026-10-12',
                    project_code: 'R9-2026-015',
                    category_name: 'Debris Removal',
                    amount: 25000,
                    vendor_or_payee: 'City Waste Management Services',
                    has_bill_photo: true,
                    status: 'APPROVED',
                    approved_by: 'Amit Verma',
                },
            ],
        })
    }

    if (path === '/finance/expense-categories') {
        return NextResponse.json({ items: EXPENSE_CATEGORIES })
    }

    if (path === '/finance/petty-cash/funds') {
        return NextResponse.json({ items: state.pettyCash.funds })
    }

    if (path === '/finance/petty-cash/vouchers') {
        return NextResponse.json({ items: state.pettyCash.vouchers })
    }

    // 10. Admin & Masters
    if (path === '/masters') {
        return NextResponse.json({
            masters: [
                { key: 'items', title: 'Items Catalog', group: 'Materials', columns: ['item_code', 'name', 'category', 'base_uom', 'standard_cost_rate'] },
                { key: 'clients', title: 'Clients', group: 'Parties', columns: ['code', 'legal_name', 'trade_name', 'gstin'] },
                { key: 'vendors', title: 'Vendors', group: 'Parties', columns: ['code', 'legal_name', 'supply_categories', 'gstin'] },
                { key: 'subcontractors', title: 'Subcontractors', group: 'Parties', columns: ['code', 'legal_name', 'trade', 'pan'] },
                { key: 'uoms', title: 'Units of Measure', group: 'General', columns: ['code', 'name', 'decimal_places'] },
                { key: 'cost_centres', title: 'Cost Centres', group: 'Finance', columns: ['code', 'name', 'cost_group'] },
                { key: 'trades', title: 'Labour Trades', group: 'Site Ops', columns: ['code', 'name', 'standard_daily_wage'] },
                { key: 'gst_rates', title: 'GST Tax Masters', group: 'Finance', columns: ['code', 'total_rate_pct'] },
                { key: 'tds_sections', title: 'TDS Sections', group: 'Finance', columns: ['section_code', 'description', 'rate_pct'] },
            ],
        })
    }

    if (path.startsWith('/masters/')) {
        const name = segments[1]
        const isOptions = segments[2] === 'options'
        let items: any[] = []
        if (name === 'items') items = ITEMS
        else if (name === 'clients') items = CLIENTS
        else if (name === 'vendors') items = VENDORS
        else if (name === 'subcontractors') items = SUBCONTRACTORS
        else if (name === 'uoms') items = UOMS
        else if (name === 'cost_centres') items = COST_CENTRES
        else if (name === 'trades') items = TRADES
        else if (name === 'gst_rates' || name === 'gst') items = GST_RATES
        else if (name === 'tds_sections' || name === 'tds') items = TDS_SECTIONS
        else if (name === 'expense_categories') items = EXPENSE_CATEGORIES

        if (isOptions) {
            return NextResponse.json({
                items: items.map(x => ({
                    value: x.id ?? x.code ?? x.item_code,
                    label: x.name ?? x.legal_name ?? x.code ?? x.description,
                })),
            })
        }
        return NextResponse.json({ master: name, title: name.toUpperCase(), items, total: items.length })
    }

    if (path === '/admin/users') {
        const items = Object.values(DEMO_USERS).map(u => ({
            id: u.id,
            full_name: u.name,
            phone: u.phone,
            email: u.email,
            ui_mode: u.ui_mode,
            is_active: true,
            branch: u.branch,
            role_codes: u.roles,
            user_roles: u.roles.map(r => ({ role: { code: r, name: r, requires_mfa: r === 'DIRECTOR' || r === 'ACCOUNTS' } })),
            user_site_assignments: u.sites.map(s => ({ site_id: s.id, site: s })),
        }))
        return NextResponse.json({ items, roles: ROLES, branches: BRANCHES, sites: [] })
    }

    if (path === '/admin/rules') {
        return NextResponse.json({
            items: [
                { id: 'rul-1', doc_type: 'PO', step_order: 1, min_amount: 0, max_amount: 25000, approver_role: 'PROJECT_MANAGER' },
                { id: 'rul-2', doc_type: 'PO', step_order: 1, min_amount: 25000, max_amount: 100000, approver_role: 'PROJECT_MANAGER' },
                { id: 'rul-3', doc_type: 'PO', step_order: 2, min_amount: 25000, max_amount: 100000, approver_role: 'PURCHASE_MGR' },
                { id: 'rul-4', doc_type: 'PO', step_order: 1, min_amount: 100000.01, max_amount: 500000, approver_role: 'PROJECT_HEAD' },
                { id: 'rul-5', doc_type: 'PO', step_order: 1, min_amount: 500000.01, max_amount: null, approver_role: 'DIRECTOR' },
                { id: 'rul-6', doc_type: 'EXTRA_WORK', step_order: 1, min_amount: 0, max_amount: null, approver_role: 'PROJECT_MANAGER' },
                { id: 'rul-7', doc_type: 'EXTRA_WORK', step_order: 2, min_amount: 0, max_amount: null, approver_role: 'COMMERCIAL' },
                { id: 'rul-8', doc_type: 'EXTRA_WORK', step_order: 3, min_amount: 0, max_amount: null, approver_role: 'DIRECTOR' },
            ],
        })
    }

    // 11. Workflows & Inbox
    if (path === '/workflows/inbox') {
        // Return inbox items matching user's roles
        const userRoles = user.roles
        const filtered = state.inbox.filter(i => userRoles.includes(i.approver_role) || userRoles.includes('DIRECTOR') || userRoles.includes('ADMIN'))
        return NextResponse.json({ items: filtered })
    }

    if (path.startsWith('/workflows/') && segments.length === 3) {
        const docType = segments[1]
        const docId = segments[2]
        const item = state.inbox.find(i => i.doc_type === docType && i.doc_id === docId)
        return NextResponse.json({
            instance: item ?? {
                id: 'wf-mock',
                status: 'APPROVED',
                current_step: 1,
            },
            history: [
                { step: 1, approver_role: 'PROJECT_MANAGER', approver_name: 'Amit Verma', action: 'APPROVED', timestamp: '2026-11-19T10:00:00Z', note: 'Verified against BOQ baseline' },
            ],
        })
    }

    // 12. Notifications & Exceptions
    if (path === '/notifications') {
        const unread = state.notifications.filter(n => !n.is_read).length
        return NextResponse.json({ items: state.notifications, unread })
    }

    if (path === '/exceptions') {
        return NextResponse.json({ items: state.exceptions })
    }

    if (path === '/directory/users') {
        return NextResponse.json({
            items: Object.values(DEMO_USERS).map(u => ({ id: u.id, full_name: u.name, roles: u.roles })),
        })
    }

    if (path === '/site-issues') {
        return NextResponse.json({
            items: [
                {
                    id: 'iss-1',
                    issue_code: 'ISS-015-02',
                    title: 'Tile delivery received with 2 damaged boxes',
                    severity: 'LOW',
                    status: 'RESOLVED',
                    created_at: '2026-10-16T12:00:00Z',
                    project: { project_code: 'R9-2026-015' },
                    site: { code: 'S-UDR-01', city: 'Udaipur' },
                    raised_by_user: { full_name: 'Ramesh Meghwal' },
                },
            ],
        })
    }

    return NextResponse.json({ error: `Demo route not found: ${path}`, code: 'NOT_FOUND' }, { status: 404 })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
    const segments = (await params).path ?? []
    const path = '/' + segments.join('/')
    const body = await parseJson(req)
    const user = getUser(req)

    // Auth Login
    if (path === '/auth/login') {
        const id = (body.identifier ?? '').toLowerCase()
        let matchedKey = 'rohit'
        for (const [key, u] of Object.entries(DEMO_USERS)) {
            if (id.includes(key) || id.includes(u.phone) || id.includes(u.email.toLowerCase()) || id.includes(u.name.toLowerCase().split(' ')[0])) {
                matchedKey = key
                break
            }
        }
        state.currentUserKey = matchedKey
        const res = NextResponse.json({ user: DEMO_USERS[matchedKey], token: 'demo-jwt-token-123' })
        res.cookies.set('r9_demo_user', matchedKey, { path: '/', maxAge: 60 * 60 * 24 * 7 })
        return res
    }

    // Switch demo user
    if (path === '/auth/switch-user') {
        const target = body.key && DEMO_USERS[body.key] ? body.key : 'rohit'
        state.currentUserKey = target
        const res = NextResponse.json({ user: DEMO_USERS[target], success: true })
        res.cookies.set('r9_demo_user', target, { path: '/', maxAge: 60 * 60 * 24 * 7 })
        return res
    }

    // Auth Logout
    if (path === '/auth/logout') {
        const res = NextResponse.json({ ok: true })
        res.cookies.delete('r9_demo_user')
        return res
    }

    // Notifications read
    if (path === '/notifications/read') {
        state.notifications.forEach(n => (n.is_read = true))
        return NextResponse.json({ ok: true })
    }

    // Workflow decisions (Approve / Reject)
    if (path.startsWith('/workflows/') && path.endsWith('/decide')) {
        const docType = segments[1]
        const docId = segments[2]
        const decision = body.decision ?? 'APPROVE'

        // Remove from inbox or mark approved
        const idx = state.inbox.findIndex(i => i.doc_type === docType && i.doc_id === docId)
        if (idx !== -1) {
            state.inbox[idx].status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
            state.inbox.splice(idx, 1)
        }

        // Also update related PO or variation
        if (docType === 'PO') {
            const po = state.purchaseOrders.find(p => p.id === docId)
            if (po) po.status = 'ISSUED'
        }
        if (docType === 'EXTRA_WORK') {
            const v = state.variations.find(x => x.id === docId)
            if (v) v.status = 'APPROVED'
        }

        return NextResponse.json({ success: true, decision, doc_type: docType, doc_id: docId })
    }

    // Create enquiry
    if (path === '/enquiries') {
        const newEnq = {
            id: `enq-${Date.now()}`,
            enquiry_no: `ENQ-JPR-2026-0${state.enquiries.length + 42}`,
            client_name: body.client_name ?? 'New Client',
            project_name: body.project_name ?? 'New Project Fitout',
            site_city: body.site_city ?? 'Jaipur',
            carpet_area_sqft: body.carpet_area_sqft ? Number(body.carpet_area_sqft) : 2500,
            expected_value: body.expected_value ? Number(body.expected_value) : 5000000,
            status: 'NEW',
            next_followup_date: body.next_followup_date ?? null,
            enquiry_date: new Date().toISOString().slice(0, 10),
            lead_source: body.lead_source ?? 'Direct Enquiry',
            sales_person: { full_name: user.name },
            project: null,
        }
        state.enquiries.unshift(newEnq)
        return NextResponse.json(newEnq)
    }

    // Update enquiry status
    if (path.startsWith('/enquiries/') && path.endsWith('/status')) {
        const id = segments[1]
        const enq = state.enquiries.find(e => e.id === id)
        if (enq) {
            enq.status = body.status
            if (body.next_followup_date) enq.next_followup_date = body.next_followup_date
        }
        return NextResponse.json({ success: true, enquiry: enq })
    }

    // Create quotation
    if (path.startsWith('/enquiries/') && path.endsWith('/quotations')) {
        return NextResponse.json({
            id: `quot-${Date.now()}`,
            quotation_no: `QUOT-JPR-2026-0${Math.floor(Math.random() * 900) + 100}`,
            grand_total: 5000000,
            status: 'DRAFT',
        })
    }

    // Create project
    if (path === '/projects') {
        const newProj: MockProject = {
            id: `prj-${Date.now()}`,
            project_code: `R9-2026-0${state.projects.length + 15}`,
            name: body.name ?? 'New Interior Fitout Project',
            client_id: body.client_id ?? 'cl-01',
            client: CLIENTS.find(c => c.id === body.client_id) ?? CLIENTS[0],
            branch_id: 'br-jpr-01',
            pm_user_id: body.pm_user_id ?? 'usr-amit-03',
            pm_user: { full_name: 'Amit Verma', phone: '9829000003' },
            status: 'ACTIVE',
            current_stage: 'MOBILISATION',
            schedule_status: 'ON_TIME',
            physical_progress_pct: 0,
            financial_progress_pct: 0,
            contract_value: Number(body.contract_value ?? 5000000),
            approved_variation_value: 0,
            total_contract: Number(body.contract_value ?? 5000000),
            baseline_estimated_cost: Number(body.contract_value ?? 5000000) * 0.75,
            revised_estimated_cost: Number(body.contract_value ?? 5000000) * 0.75,
            po_committed: 0,
            open_commitment: 0,
            pending_po_value: 0,
            site_stock_value: 0,
            actual: { MATERIAL_CONSUMED: 0, SITE_LABOUR: 0, SUBCONTRACTOR_BILL: 0, PETTY_CASH: 0, DIRECT_EXPENSE: 0 },
            actual_total: 0,
            eac: Number(body.contract_value ?? 5000000) * 0.75,
            projected_profit: Number(body.contract_value ?? 5000000) * 0.25,
            projected_margin_pct: 25.0,
            billed: 0,
            collected: 0,
            outstanding: 0,
            risk_reasons: [],
            at_risk: false,
            critical_issues: 0,
            target_start_date: new Date().toISOString().slice(0, 10),
            target_completion_date: '2027-04-30',
            sites: [{ id: `site-${Date.now()}`, code: 'S-NEW-01', name: 'Site 1', city: 'Jaipur' }],
            stages: STAGES.map(s => ({ id: `stg-${s.code}`, code: s.code, name: s.name, sort_order: s.sort_order, status: 'PENDING', progress_pct: 0 })),
        }
        state.projects.unshift(newProj)
        return NextResponse.json(newProj)
    }

    // Create PO
    if (path === '/procurement/purchase-orders') {
        const vendor = VENDORS.find(v => v.id === body.vendor_id) ?? VENDORS[0]
        const project = state.projects.find(p => p.id === body.project_id) ?? state.projects[0]
        const newPo = {
            id: `po-${Date.now()}`,
            po_no: `PO-JPR-2026-0${state.purchaseOrders.length + 51}`,
            po_date: new Date().toISOString().slice(0, 10),
            project_id: project.id,
            project_code: project.project_code,
            project_name: project.name,
            vendor_id: vendor.id,
            vendor,
            warehouse_id: 'wh-02',
            warehouse_code: 'WH-SITE-UDR-015',
            status: 'ISSUED',
            total_taxable: Number(body.total_taxable ?? 150000),
            tax_amount: Number(body.tax_amount ?? 27000),
            grand_total: Number(body.grand_total ?? 177000),
            grn_status: 'PENDING',
            invoice_status: 'PENDING_BILL',
            created_by: user.name,
            approved_by: 'Amit Verma',
            delivery_address: 'Site Address',
            lines: body.lines ?? [],
        }
        state.purchaseOrders.unshift(newPo)
        return NextResponse.json(newPo)
    }

    // Create Subcontractor Work Order
    if (path === '/subcontractors/work-orders') {
        const sub = SUBCONTRACTORS.find(s => s.id === body.subcontractor_id) ?? SUBCONTRACTORS[0]
        const project = state.projects.find(p => p.id === body.project_id) ?? state.projects[0]
        const swo = {
            id: `swo-${Date.now()}`,
            wo_no: `SWO-UDR-2026-00${state.subcontractors.length + 4}`,
            project_id: project.id,
            project_code: project.project_code,
            project_name: project.name,
            subcontractor_id: sub.id,
            subcontractor: sub,
            trade: sub.trade,
            description: body.description ?? 'Subcontract work item',
            contract_value: Number(body.contract_value ?? 200000),
            billed_to_date: 0,
            retention_held: 0,
            status: 'ACTIVE',
            created_date: new Date().toISOString().slice(0, 10),
        }
        state.subcontractors.unshift(swo)
        return NextResponse.json(swo)
    }

    // Create Petty cash expense
    if (path === '/finance/petty-cash/expenses') {
        const vch = {
            id: `vch-${Date.now()}`,
            voucher_no: `PCV-UDR-0${state.pettyCash.vouchers.length + 17}`,
            date: new Date().toISOString().slice(0, 10),
            category: body.category_name ?? 'Site Welfare (Tea, Water)',
            amount: Number(body.amount ?? 500),
            paid_to: body.paid_to ?? 'Vendor',
            purpose: body.purpose ?? 'Site expense',
            has_bill: true,
            status: 'APPROVED',
        }
        state.pettyCash.vouchers.unshift(vch)
        return NextResponse.json(vch)
    }

    // Resolve exception
    if (path.startsWith('/exceptions/') && path.endsWith('/resolve')) {
        const id = segments[1]
        const exc = state.exceptions.find(e => e.id === id)
        if (exc) exc.status = 'RESOLVED'
        return NextResponse.json({ success: true, exception: exc })
    }

    // File uploads
    if (path === '/uploads') {
        return NextResponse.json({
            url: '/icons/3d/reports.png',
            size_kb: 45,
        })
    }

    // Default POST fallback
    return NextResponse.json({ success: true, id: `rec-${Date.now()}`, ...body })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
    const segments = (await params).path ?? []
    const path = '/' + segments.join('/')
    const body = await parseJson(req)

    // Save BOQ lines
    if (path.startsWith('/boqs/') && path.endsWith('/lines')) {
        if (body.lines && Array.isArray(body.lines)) {
            state.boq.lines = body.lines
        }
        return NextResponse.json({ success: true, boq: state.boq })
    }

    // Update project
    if (path.startsWith('/projects/') && segments.length === 2) {
        const id = segments[1]
        const p = state.projects.find(x => x.id === id)
        if (p) Object.assign(p, body)
        return NextResponse.json({ success: true, project: p })
    }

    // Update enquiry
    if (path.startsWith('/enquiries/') && segments.length === 2) {
        const id = segments[1]
        const e = state.enquiries.find(x => x.id === id)
        if (e) Object.assign(e, body)
        return NextResponse.json({ success: true, enquiry: e })
    }

    return NextResponse.json({ success: true, ...body })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
    return NextResponse.json({ success: true })
}
