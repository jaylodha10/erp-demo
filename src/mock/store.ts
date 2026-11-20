// In-memory demo data store preloaded with the WonderKids Udaipur test case and other projects.
// Supports all interactive mutations during a presentation and resets on reload or via demo controls.

export interface DemoUser {
    id: string
    name: string
    phone: string
    email: string
    role: string
    roles: string[]
    role_names: string[]
    ui_mode: 'WEB_FULL' | 'MOBILE_7_TILE'
    web_modules: string[]
    designation: string
    department: string
    branch: { id: string; code: string; name: string }
    scope: { global: boolean; project_ids: string[]; site_ids: string[] }
    sites: { id: string; code: string; name: string; city: string; project: { id: string; project_code: string; name: string } }[]
}

export const DEMO_USERS: Record<string, DemoUser> = {
    rohit: {
        id: 'usr-rohit-01',
        name: 'Rohit Sainik',
        phone: '9829000001',
        email: 'rohit@radius9.in',
        role: 'DIRECTOR',
        roles: ['DIRECTOR'],
        role_names: ['Director'],
        ui_mode: 'WEB_FULL',
        web_modules: ['dashboard', 'inbox', 'enquiries', 'boq', 'projects', 'variations', 'procurement', 'inventory', 'subcontractors', 'finance', 'petty_cash', 'admin'],
        designation: 'Managing Director',
        department: 'MANAGEMENT',
        branch: { id: 'br-jpr-01', code: 'JPR', name: 'Jaipur Head Office' },
        scope: { global: true, project_ids: [], site_ids: [] },
        sites: [],
    },
    vikram: {
        id: 'usr-vikram-02',
        name: 'Vikram Rathore',
        phone: '9829000002',
        email: 'vikram@radius9.in',
        role: 'PROJECT_HEAD',
        roles: ['PROJECT_HEAD'],
        role_names: ['Project Head'],
        ui_mode: 'WEB_FULL',
        web_modules: ['dashboard', 'inbox', 'projects', 'variations', 'procurement', 'inventory', 'subcontractors'],
        designation: 'VP - Operations & Projects',
        department: 'PROJECTS',
        branch: { id: 'br-jpr-01', code: 'JPR', name: 'Jaipur Head Office' },
        scope: { global: true, project_ids: [], site_ids: [] },
        sites: [],
    },
    amit: {
        id: 'usr-amit-03',
        name: 'Amit Verma',
        phone: '9829000003',
        email: 'amit@radius9.in',
        role: 'PROJECT_MANAGER',
        roles: ['PROJECT_MANAGER'],
        role_names: ['Sr. Project Manager'],
        ui_mode: 'WEB_FULL',
        web_modules: ['dashboard', 'inbox', 'projects', 'variations', 'inventory', 'subcontractors', 'petty_cash'],
        designation: 'Sr. Project Manager',
        department: 'PROJECTS',
        branch: { id: 'br-jpr-01', code: 'JPR', name: 'Jaipur Head Office' },
        scope: { global: false, project_ids: ['prj-udr-015', 'prj-del-016'], site_ids: ['site-udr-015', 'site-del-016'] },
        sites: [
            { id: 'site-udr-015', code: 'S-UDR-01', name: 'WonderKids Udaipur Mall Site', city: 'Udaipur', project: { id: 'prj-udr-015', project_code: 'R9-2026-015', name: 'WonderKids Toy Emporium, Udaipur' } },
        ],
    },
    priya: {
        id: 'usr-priya-04',
        name: 'Priya Nair',
        phone: '9829000004',
        email: 'priya@radius9.in',
        role: 'PURCHASE_MGR',
        roles: ['PURCHASE_MGR'],
        role_names: ['Purchase Manager'],
        ui_mode: 'WEB_FULL',
        web_modules: ['inbox', 'procurement', 'inventory', 'finance'],
        designation: 'Head of Procurement',
        department: 'PURCHASE',
        branch: { id: 'br-jpr-01', code: 'JPR', name: 'Jaipur Head Office' },
        scope: { global: true, project_ids: [], site_ids: [] },
        sites: [],
    },
    karan: {
        id: 'usr-karan-05',
        name: 'Karan Mehta',
        phone: '9829000005',
        email: 'karan@radius9.in',
        role: 'COMMERCIAL',
        roles: ['COMMERCIAL', 'ESTIMATION'],
        role_names: ['Commercial Lead', 'Estimation Lead'],
        ui_mode: 'WEB_FULL',
        web_modules: ['dashboard', 'inbox', 'masters', 'enquiries', 'boq', 'projects', 'variations', 'subcontractors', 'finance'],
        designation: 'Commercial & Estimation Head',
        department: 'COMMERCIAL',
        branch: { id: 'br-jpr-01', code: 'JPR', name: 'Jaipur Head Office' },
        scope: { global: true, project_ids: [], site_ids: [] },
        sites: [],
    },
    deepak: {
        id: 'usr-deepak-06',
        name: 'Deepak Agarwal',
        phone: '9829000006',
        email: 'deepak@radius9.in',
        role: 'ACCOUNTS',
        roles: ['ACCOUNTS'],
        role_names: ['Accounts & Finance Head'],
        ui_mode: 'WEB_FULL',
        web_modules: ['dashboard', 'inbox', 'masters', 'finance', 'petty_cash'],
        designation: 'Chief Financial Officer / Accounts Head',
        department: 'FINANCE',
        branch: { id: 'br-jpr-01', code: 'JPR', name: 'Jaipur Head Office' },
        scope: { global: true, project_ids: [], site_ids: [] },
        sites: [],
    },
    admin: {
        id: 'usr-admin-00',
        name: 'System Admin',
        phone: '9829000000',
        email: 'admin@radius9.in',
        role: 'ADMIN',
        roles: ['ADMIN'],
        role_names: ['Administrator'],
        ui_mode: 'WEB_FULL',
        web_modules: ['masters', 'admin', 'enquiries', 'projects', 'dashboard'],
        designation: 'System Administrator',
        department: 'MANAGEMENT',
        branch: { id: 'br-jpr-01', code: 'JPR', name: 'Jaipur Head Office' },
        scope: { global: true, project_ids: [], site_ids: [] },
        sites: [],
    },
}

export const BRANCHES = [
    { id: 'br-jpr-01', code: 'JPR', name: 'Jaipur / Rajasthan Branch', state_code: '08', is_head_office: true, gstin: '08AAACR9999R1Z1', is_active: true },
    { id: 'br-del-02', code: 'DEL', name: 'Delhi NCR Branch', state_code: '07', is_head_office: false, gstin: '07AAACR9999R1Z4', is_active: true },
    { id: 'br-mum-03', code: 'MUM', name: 'Mumbai Branch', state_code: '27', is_head_office: false, gstin: '27AAACR9999R1Z7', is_active: true },
]

export const ROLES = [
    { id: 'r-dir', code: 'DIRECTOR', name: 'Director', requires_mfa: true },
    { id: 'r-head', code: 'PROJECT_HEAD', name: 'Project Head', requires_mfa: false },
    { id: 'r-pm', code: 'PROJECT_MANAGER', name: 'Project Manager', requires_mfa: false },
    { id: 'r-pur', code: 'PURCHASE_MGR', name: 'Purchase Manager', requires_mfa: false },
    { id: 'r-comm', code: 'COMMERCIAL', name: 'Commercial', requires_mfa: false },
    { id: 'r-est', code: 'ESTIMATION', name: 'Estimation', requires_mfa: false },
    { id: 'r-acc', code: 'ACCOUNTS', name: 'Accounts Head', requires_mfa: true },
    { id: 'r-adm', code: 'ADMIN', name: 'Administrator', requires_mfa: false },
    { id: 'r-site', code: 'SITE_SUPERVISOR', name: 'Site Supervisor', requires_mfa: false },
    { id: 'r-eng', code: 'SITE_ENGINEER', name: 'Site Engineer', requires_mfa: false },
    { id: 'r-str', code: 'STOREKEEPER', name: 'Storekeeper', requires_mfa: false },
]

export const UOMS = [
    { id: 'uom-bag', code: 'BAG', name: 'Bag', decimal_places: 0 },
    { id: 'uom-kg', code: 'KG', name: 'Kilogram', decimal_places: 2 },
    { id: 'uom-mt', code: 'MT', name: 'Metric Tonne', decimal_places: 3 },
    { id: 'uom-sqft', code: 'SQFT', name: 'Square Foot', decimal_places: 2 },
    { id: 'uom-sqm', code: 'SQM', name: 'Square Metre', decimal_places: 2 },
    { id: 'uom-rft', code: 'RFT', name: 'Running Foot', decimal_places: 2 },
    { id: 'uom-nos', code: 'NOS', name: 'Numbers', decimal_places: 0 },
    { id: 'uom-ltr', code: 'LTR', name: 'Litre', decimal_places: 2 },
    { id: 'uom-ls', code: 'LS', name: 'Lump Sum', decimal_places: 0 },
    { id: 'uom-day', code: 'DAY', name: 'Day', decimal_places: 1 },
    { id: 'uom-cft', code: 'CFT', name: 'Cubic Foot', decimal_places: 2 },
    { id: 'uom-sheet', code: 'SHEET', name: 'Sheet', decimal_places: 0 },
    { id: 'uom-box', code: 'BOX', name: 'Box', decimal_places: 0 },
    { id: 'uom-roll', code: 'ROLL', name: 'Roll', decimal_places: 0 },
    { id: 'uom-kit', code: 'KIT', name: 'Kit', decimal_places: 0 },
    { id: 'uom-lot', code: 'LOT', name: 'Lot', decimal_places: 0 },
    { id: 'uom-coil', code: 'COIL', name: 'Coil', decimal_places: 0 },
    { id: 'uom-bucket', code: 'BUCKET', name: 'Bucket', decimal_places: 0 },
    { id: 'uom-drum', code: 'DRUM', name: 'Drum', decimal_places: 0 },
]

export const GST_RATES = [
    { id: 'gst-0', code: 'GST-0', total_rate_pct: 0, cgst_pct: 0, sgst_pct: 0, igst_pct: 0 },
    { id: 'gst-5', code: 'GST-5', total_rate_pct: 5, cgst_pct: 2.5, sgst_pct: 2.5, igst_pct: 5 },
    { id: 'gst-12', code: 'GST-12', total_rate_pct: 12, cgst_pct: 6, sgst_pct: 6, igst_pct: 12 },
    { id: 'gst-18', code: 'GST-18', total_rate_pct: 18, cgst_pct: 9, sgst_pct: 9, igst_pct: 18 },
    { id: 'gst-28', code: 'GST-28', total_rate_pct: 28, cgst_pct: 14, sgst_pct: 14, igst_pct: 28 },
]

export const TDS_SECTIONS = [
    { id: 'tds-194c-ind', section_code: '194C-IND', description: 'Contractors: individual / HUF', rate_pct: 1 },
    { id: 'tds-194c-co', section_code: '194C-CO', description: 'Contractors: company / firm', rate_pct: 2 },
    { id: 'tds-194j', section_code: '194J', description: 'Professional or technical fees', rate_pct: 10 },
    { id: 'tds-194q', section_code: '194Q', description: 'Purchase of goods above 50 lakh', rate_pct: 0.1 },
]

export const COST_CENTRES = [
    { id: 'cc-civil', code: 'CC-CIVIL', name: 'Civil and Masonry', cost_group: 'MATERIAL' },
    { id: 'cc-ceiling', code: 'CC-CEILING', name: 'False Ceiling', cost_group: 'MATERIAL' },
    { id: 'cc-mep', code: 'CC-MEP', name: 'MEP (Electrical, HVAC)', cost_group: 'MATERIAL' },
    { id: 'cc-floor', code: 'CC-FLOOR', name: 'Flooring', cost_group: 'MATERIAL' },
    { id: 'cc-carpentry', code: 'CC-CARPENTRY', name: 'Carpentry and Joinery', cost_group: 'MATERIAL' },
    { id: 'cc-paint', code: 'CC-PAINT', name: 'Painting and Finishing', cost_group: 'MATERIAL' },
    { id: 'cc-prelim', code: 'CC-PRELIM', name: 'Preliminaries and Mobilisation', cost_group: 'SITE_OVERHEAD' },
    { id: 'cc-overhead', code: 'CC-OVERHEAD', name: 'Site Overheads and Admin', cost_group: 'SITE_OVERHEAD' },
]

export const TRADES = [
    { id: 'tr-carp', code: 'CARPENTER', name: 'Carpenter', default_cost_centre_id: 'cc-carpentry', standard_daily_wage: 950 },
    { id: 'tr-elec', code: 'ELECTRICIAN', name: 'Electrician', default_cost_centre_id: 'cc-mep', standard_daily_wage: 900 },
    { id: 'tr-civ', code: 'CIVIL_MASON', name: 'Civil Mason', default_cost_centre_id: 'cc-civil', standard_daily_wage: 850 },
    { id: 'tr-pop', code: 'POP_GYPSUM', name: 'POP / Gypsum Ceiling', default_cost_centre_id: 'cc-ceiling', standard_daily_wage: 900 },
    { id: 'tr-pnt', code: 'PAINTER', name: 'Painter', default_cost_centre_id: 'cc-paint', standard_daily_wage: 800 },
    { id: 'tr-flr', code: 'FLOORING', name: 'Flooring Fitter', default_cost_centre_id: 'cc-floor', standard_daily_wage: 850 },
    { id: 'tr-plm', code: 'PLUMBER', name: 'Plumber', default_cost_centre_id: 'cc-mep', standard_daily_wage: 850 },
    { id: 'tr-hlp', code: 'HELPER', name: 'Helper', default_cost_centre_id: 'cc-overhead', standard_daily_wage: 600 },
    { id: 'tr-glz', code: 'GLAZIER', name: 'Glass and Glazier', default_cost_centre_id: 'cc-civil', standard_daily_wage: 900 },
    { id: 'tr-hvac', code: 'HVAC_TECH', name: 'HVAC Technician', default_cost_centre_id: 'cc-mep', standard_daily_wage: 1000 },
]

export const ITEMS = [
    { id: 'itm-01', item_code: 'ITM-CIV-01', name: 'UltraTech PPC Cement (50 kg bag)', category: 'CIVIL', base_uom: 'KG', purchase_uom: 'BAG', factor: 50, hsn_code: '2523', gst_rate: 28, standard_cost_rate: 390 },
    { id: 'itm-02', item_code: 'ITM-CIV-02', name: 'River Sand / M-Sand', category: 'CIVIL', base_uom: 'CFT', purchase_uom: 'CFT', factor: 1, hsn_code: '2505', gst_rate: 5, standard_cost_rate: 65 },
    { id: 'itm-03', item_code: 'ITM-CIV-03', name: 'Magicrete AAC Block 600x200x150', category: 'CIVIL', base_uom: 'NOS', purchase_uom: 'NOS', factor: 1, hsn_code: '6810', gst_rate: 12, standard_cost_rate: 75 },
    { id: 'itm-04', item_code: 'ITM-FLR-01', name: 'Kajaria 800x800 Double Charge Vitrified Tile (Ivory)', category: 'FLOORING', base_uom: 'SQFT', purchase_uom: 'BOX', factor: 13.78, hsn_code: '6907', gst_rate: 18, standard_cost_rate: 1150 },
    { id: 'itm-05', item_code: 'ITM-FLR-02', name: 'MYK Laticrete 315 Tile Adhesive and Epoxy Grout', category: 'FLOORING', base_uom: 'BAG', purchase_uom: 'BAG', factor: 1, hsn_code: '3214', gst_rate: 18, standard_cost_rate: 620 },
    { id: 'itm-06', item_code: 'ITM-FLR-03', name: 'WonderFloor 6mm Kid-Safe Cushioned Vinyl Roll', category: 'FLOORING', base_uom: 'SQFT', purchase_uom: 'ROLL', factor: 160, hsn_code: '3918', gst_rate: 18, standard_cost_rate: 28000 },
    { id: 'itm-07', item_code: 'ITM-CEL-01', name: 'Saint-Gobain Gyproc 12.5mm Gypsum Board (6x4 ft)', category: 'CEILING', base_uom: 'SHEET', purchase_uom: 'SHEET', factor: 1, hsn_code: '6809', gst_rate: 18, standard_cost_rate: 480 },
    { id: 'itm-08', item_code: 'ITM-CEL-02', name: 'GI Ceiling Channels 0.55mm (12 ft)', category: 'CEILING', base_uom: 'NOS', purchase_uom: 'NOS', factor: 1, hsn_code: '7216', gst_rate: 18, standard_cost_rate: 210 },
    { id: 'itm-09', item_code: 'ITM-CEL-03', name: 'Gyproc Jointing Compound, Screws and Fibre Tape', category: 'CEILING', base_uom: 'KIT', purchase_uom: 'KIT', factor: 1, hsn_code: '6809', gst_rate: 18, standard_cost_rate: 2800 },
    { id: 'itm-10', item_code: 'ITM-CAR-01', name: 'CenturyPly Sainik 710 18mm BWP Plywood (8x4 ft)', category: 'CARPENTRY', base_uom: 'SHEET', purchase_uom: 'SHEET', factor: 1, hsn_code: '4412', gst_rate: 18, standard_cost_rate: 2450 },
    { id: 'itm-11', item_code: 'ITM-CAR-02', name: 'CenturyPly 12mm and 6mm Plywood (drawer bottoms)', category: 'CARPENTRY', base_uom: 'SHEET', purchase_uom: 'SHEET', factor: 1, hsn_code: '4412', gst_rate: 18, standard_cost_rate: 1550 },
    { id: 'itm-12', item_code: 'ITM-CAR-03', name: 'Greenlam / Merino 1.0mm Pastel Laminates', category: 'CARPENTRY', base_uom: 'SHEET', purchase_uom: 'SHEET', factor: 1, hsn_code: '4412', gst_rate: 18, standard_cost_rate: 1250 },
    { id: 'itm-13', item_code: 'ITM-CAR-04', name: 'Fevicol SH Synthetic Resin Adhesive', category: 'CARPENTRY', base_uom: 'KG', purchase_uom: 'DRUM', factor: 50, hsn_code: '3506', gst_rate: 18, standard_cost_rate: 11500 },
    { id: 'itm-14', item_code: 'ITM-CAR-05', name: 'Hettich Soft-Close Channels, Hinges, Locks', category: 'CARPENTRY', base_uom: 'LOT', purchase_uom: 'LOT', factor: 1, hsn_code: '8302', gst_rate: 18, standard_cost_rate: 68000 },
    { id: 'itm-15', item_code: 'ITM-MEP-01', name: 'Havells FRLS Copper Wire (1.5/2.5/4.0 sqmm)', category: 'MEP', base_uom: 'COIL', purchase_uom: 'COIL', factor: 1, hsn_code: '8544', gst_rate: 18, standard_cost_rate: 2400 },
    { id: 'itm-16', item_code: 'ITM-MEP-02', name: 'Philips 24W High-CRI COB Track Light (2m track)', category: 'MEP', base_uom: 'NOS', purchase_uom: 'NOS', factor: 1, hsn_code: '9405', gst_rate: 18, standard_cost_rate: 1650 },
    { id: 'itm-17', item_code: 'ITM-MEP-03', name: 'Philips 15W LED Panels, RGB Shelf Strips', category: 'MEP', base_uom: 'LOT', purchase_uom: 'LOT', factor: 1, hsn_code: '9405', gst_rate: 18, standard_cost_rate: 64000 },
    { id: 'itm-18', item_code: 'ITM-MEP-04', name: 'Daikin 3.0 TR 4-Way Cassette AC with Copper Kit', category: 'MEP', base_uom: 'NOS', purchase_uom: 'NOS', factor: 1, hsn_code: '8415', gst_rate: 28, standard_cost_rate: 115000 },
    { id: 'itm-19', item_code: 'ITM-PNT-01', name: 'JK Wall Putty (40 kg) and Primer', category: 'PAINT', base_uom: 'BAG', purchase_uom: 'BAG', factor: 1, hsn_code: '3209', gst_rate: 18, standard_cost_rate: 880 },
    { id: 'itm-20', item_code: 'ITM-PNT-02', name: 'Asian Paints Royale Health Shield Emulsion (20 L)', category: 'PAINT', base_uom: 'LTR', purchase_uom: 'BUCKET', factor: 20, hsn_code: '3209', gst_rate: 18, standard_cost_rate: 9200 },
]

export const CLIENTS = [
    {
        id: 'cl-01',
        code: 'CL-2026-018',
        legal_name: 'Mewar Retail Ventures Pvt. Ltd.',
        trade_name: 'WonderKids Toy Emporium',
        gstin: '08AABCM9921K1Z5',
        billing_address: 'Lake City Mall, Ashok Nagar, Udaipur, Rajasthan 313001',
        state_code: '08',
        payment_terms_days: 15,
        default_retention_pct: 5,
        primary_contact_name: 'Mr. Arvind Singhania',
        primary_contact_phone: '+91-98290-11223',
    },
    {
        id: 'cl-02',
        code: 'CL-2026-019',
        legal_name: 'Rajputana Hospitality Ltd',
        trade_name: 'Heritage Palace',
        gstin: '08AAACR8844P1Z3',
        billing_address: 'C-Scheme, Jaipur, Rajasthan 302001',
        state_code: '08',
        payment_terms_days: 30,
        default_retention_pct: 5,
        primary_contact_name: 'Col. Ranjit Rathore',
        primary_contact_phone: '+91-98291-55443',
    },
    {
        id: 'cl-03',
        code: 'CL-2026-020',
        legal_name: 'TechCorp India Solutions Pvt. Ltd.',
        trade_name: 'TechCorp Global',
        gstin: '07AABCT1234D1Z2',
        billing_address: 'DLF Cyber City, Tower B, Gurugram, Haryana 122002',
        state_code: '07',
        payment_terms_days: 30,
        default_retention_pct: 5,
        primary_contact_name: 'Ms. Shalini Gupta',
        primary_contact_phone: '+91-98110-88776',
    },
    {
        id: 'cl-04',
        code: 'CL-2026-021',
        legal_name: 'Luxe Retail Brands India Ltd',
        trade_name: 'Luxe Retail Flagship',
        gstin: '27AABCL9876M1Z8',
        billing_address: 'Bandra Kurla Complex, Mumbai, Maharashtra 400051',
        state_code: '27',
        payment_terms_days: 20,
        default_retention_pct: 5,
        primary_contact_name: 'Mr. Siddharth Merchant',
        primary_contact_phone: '+91-98200-33445',
    },
]

export const VENDORS = [
    { id: 'v-01', code: 'V-UDR-001', legal_name: 'Mewar Building Material Suppliers (Udaipur Local)', supply_categories: ['Civil', 'Cement', 'Sand'], gstin: '08MEWAR1111A1Z1', payment_terms_days: 30, rating: 4.8 },
    { id: 'v-02', code: 'V-UDR-002', legal_name: 'Udaipur Cement and Hardware Mart', supply_categories: ['Civil', 'Hardware', 'Fasteners'], gstin: '08UDCEM2222B1Z2', payment_terms_days: 30, rating: 4.5 },
    { id: 'v-03', code: 'V-JPR-003', legal_name: 'Shree Gypsum and Tile Distributors', supply_categories: ['Ceiling', 'Flooring', 'Tiles'], gstin: '08SHRGY3333C1Z3', payment_terms_days: 30, rating: 4.7 },
    { id: 'v-04', code: 'V-JPR-004', legal_name: 'Rajasthan Timber and Laminate House', supply_categories: ['Carpentry', 'Plywood', 'Laminates'], gstin: '08RAJTI4444D1Z4', payment_terms_days: 30, rating: 4.9 },
    { id: 'v-05', code: 'V-JPR-005', legal_name: 'CoolAir and BrightLight MEP Solutions', supply_categories: ['MEP', 'HVAC', 'Lighting'], gstin: '08COOLA5555E1Z5', payment_terms_days: 30, rating: 4.6 },
]

export const SUBCONTRACTORS = [
    { id: 'sc-01', code: 'SC-001', legal_name: 'Mewar Glass and Glazing Works', trade: 'GLAZIER', trade_name: 'Glass and Glazier', tds_section: '194C-CO', pan: 'AABFM1234G', gstin: '08AABFM1234G1Z6', default_retention_pct: 5 },
    { id: 'sc-02', code: 'SC-002', legal_name: 'LakeCity HVAC and Ducting', trade: 'HVAC_TECH', trade_name: 'HVAC Technician', tds_section: '194C-IND', pan: 'BCDPL5678H', gstin: '08BCDPL5678H1Z7', default_retention_pct: 5 },
    { id: 'sc-03', code: 'SC-003', legal_name: 'Royal Finishing and PU Painters', trade: 'PAINTER', trade_name: 'Painter', tds_section: '194C-IND', pan: 'CDEPR9012J', gstin: '08CDEPR9012J1Z8', default_retention_pct: 5 },
]

export const EXPENSE_CATEGORIES = [
    { id: 'exp-01', code: 'UNLOADING', name: 'Unloading and Shifting Labour', bill_photo_threshold: 500, max_single_voucher_limit: 10000 },
    { id: 'exp-02', code: 'LOCAL_TRANSPORT', name: 'Local Transport / Auto / Tempo', bill_photo_threshold: 500, max_single_voucher_limit: 10000 },
    { id: 'exp-03', code: 'SITE_WELFARE', name: 'Site Welfare (Tea, Water)', bill_photo_threshold: 500, max_single_voucher_limit: 5000 },
    { id: 'exp-04', code: 'URGENT_HARDWARE', name: 'Urgent Hardware / Consumables', bill_photo_threshold: 500, max_single_voucher_limit: 10000 },
    { id: 'exp-05', code: 'DEBRIS', name: 'Debris Removal', bill_photo_threshold: 500, max_single_voucher_limit: 10000 },
    { id: 'exp-06', code: 'SITE_ELECTRICITY', name: 'Site Electricity', bill_photo_threshold: 500, max_single_voucher_limit: 10000 },
    { id: 'exp-07', code: 'CRANE_HIRE', name: 'Crane / Boom Lift Hire', bill_photo_threshold: 500, max_single_voucher_limit: 100000 },
    { id: 'exp-08', code: 'TRAVEL', name: 'Travel and Lodging', bill_photo_threshold: 500, max_single_voucher_limit: 50000 },
]

export const WAREHOUSES = [
    { id: 'wh-01', code: 'WH-CENTRAL-JPR', name: 'Jaipur Central Store', warehouse_type: 'CENTRAL', branch_id: 'br-jpr-01', storekeeper: 'Mahesh Kumawat' },
    { id: 'wh-02', code: 'WH-SITE-UDR-015', name: 'WonderKids Site Warehouse (Udaipur)', warehouse_type: 'SITE', project_id: 'prj-udr-015', project_code: 'R9-2026-015', storekeeper: 'Ramesh Meghwal' },
    { id: 'wh-03', code: 'WH-SITE-DEL-016', name: 'CyberHub Site Warehouse (Gurugram)', warehouse_type: 'SITE', project_id: 'prj-del-016', project_code: 'R9-2026-016', storekeeper: 'Mahesh Kumawat' },
]

export const STAGES = [
    { code: 'MOBILISATION', name: 'Mobilisation and Site Setup', sort_order: 1 },
    { code: 'DEMOLITION_CIVIL', name: 'Demolition and Civil Masonry', sort_order: 2 },
    { code: 'MEP_FIRST_FIX', name: 'MEP First Fix (Conduits, Piping)', sort_order: 3 },
    { code: 'CEILING_FRAMING', name: 'Ceiling Framing and Panelling', sort_order: 4 },
    { code: 'FLOORING_TILING', name: 'Flooring and Wall Tiling', sort_order: 5 },
    { code: 'CARPENTRY_JOINERY', name: 'Carpentry, Partitions and Fixtures', sort_order: 6 },
    { code: 'PAINTING_FINISHING', name: 'Painting, Polish and Final Finishes', sort_order: 7 },
    { code: 'MEP_FINAL_FIX', name: 'MEP Final Fix (Fixtures, HVAC Commissioning)', sort_order: 8 },
    { code: 'SNAGGING_HANDOVER', name: 'Snagging, Testing and Handover', sort_order: 9 },
]

export const BOQ_TEMPLATES = [
    {
        id: 'tmpl-01',
        template_code: 'CEIL-GYP-FLAT',
        trade_id: 'tr-pop',
        trade_name: 'POP / Gypsum Ceiling',
        cost_centre_id: 'cc-ceiling',
        description: 'Gypsum 12.5mm false ceiling with GI channels (flat)',
        uom: 'SQFT',
        labour_norm_days: 0.02,
        default_cost_rate: 140,
        default_selling_rate: 190,
    },
    {
        id: 'tmpl-02',
        template_code: 'FLR-VIT-800',
        trade_id: 'tr-flr',
        trade_name: 'Flooring Fitter',
        cost_centre_id: 'cc-floor',
        description: '800x800 vitrified tile flooring with cement-sand bed',
        uom: 'SQFT',
        labour_norm_days: 0.03,
        default_cost_rate: 165,
        default_selling_rate: 220,
    },
    {
        id: 'tmpl-03',
        template_code: 'CIV-AAC-150',
        trade_id: 'tr-civ',
        trade_name: 'Civil Mason',
        cost_centre_id: 'cc-civil',
        description: '150mm AAC block partition with plaster',
        uom: 'SQFT',
        labour_norm_days: 0.04,
        default_cost_rate: 180,
        default_selling_rate: 240,
    },
    {
        id: 'tmpl-04',
        template_code: 'PNT-ROYALE',
        trade_id: 'tr-pnt',
        trade_name: 'Painter',
        cost_centre_id: 'cc-paint',
        description: 'Putty, primer and 2 coats Royale emulsion',
        uom: 'SQFT',
        labour_norm_days: 0.01,
        default_cost_rate: 35,
        default_selling_rate: 48,
    },
]
