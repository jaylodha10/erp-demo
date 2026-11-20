/** Head-office navigation. `roles` mirrors the API's role checks so a user only sees screens they can use. */
export interface NavItem { href: string; label: string; icon: string; roles: string[]; screen: string }
export interface NavGroup { label: string; items: NavItem[] }

const HO = ['ADMIN', 'DIRECTOR', 'PROJECT_HEAD', 'PROJECT_MANAGER', 'PURCHASE_MGR', 'COMMERCIAL', 'ESTIMATION', 'ACCOUNTS']
const APPROVERS = ['PROJECT_MANAGER', 'PURCHASE_MGR', 'PROJECT_HEAD', 'ACCOUNTS', 'DIRECTOR', 'COMMERCIAL']
const SALES = ['COMMERCIAL', 'ESTIMATION', 'DIRECTOR', 'PROJECT_HEAD']
const PROJECT = ['DIRECTOR', 'PROJECT_HEAD', 'PROJECT_MANAGER', 'COMMERCIAL', 'ESTIMATION', 'ACCOUNTS']
const BUY = ['PURCHASE_MGR', 'PROJECT_MANAGER', 'PROJECT_HEAD', 'DIRECTOR', 'STOREKEEPER']
const FIN_READ = ['ACCOUNTS', 'DIRECTOR', 'COMMERCIAL', 'PROJECT_HEAD', 'PROJECT_MANAGER', 'PURCHASE_MGR']

export const NAV: NavGroup[] = [
    {
        label: 'Overview',
        items: [
            { href: '/erp/dashboard', label: 'Dashboard', icon: 'monitoring', roles: ['DIRECTOR', 'PROJECT_HEAD', 'PROJECT_MANAGER', 'COMMERCIAL', 'ACCOUNTS', 'ADMIN'], screen: 'WEB-19' },
            { href: '/erp/inbox', label: 'Approval inbox', icon: 'inbox', roles: APPROVERS, screen: 'WEB-18' },
            { href: '/erp/exceptions', label: 'Exceptions', icon: 'report', roles: [...PROJECT, 'PURCHASE_MGR', 'STOREKEEPER'], screen: 'WEB-10' },
        ],
    },
    {
        label: 'Sales and projects',
        items: [
            { href: '/erp/enquiries', label: 'Enquiries and BOQ', icon: 'request_quote', roles: SALES, screen: 'WEB-04' },
            { href: '/erp/projects', label: 'Projects', icon: 'apartment', roles: [...HO, 'SITE_SUPERVISOR'], screen: 'WEB-05/06' },
            { href: '/erp/variations', label: 'Extra work', icon: 'add_task', roles: ['PROJECT_MANAGER', 'COMMERCIAL', 'DIRECTOR', 'PROJECT_HEAD', 'ACCOUNTS'], screen: 'WEB-07' },
        ],
    },
    {
        label: 'Procurement and stock',
        items: [
            { href: '/erp/procurement/queue', label: 'Purchase queue', icon: 'shopping_cart', roles: BUY, screen: 'WEB-08' },
            { href: '/erp/procurement/orders', label: 'Purchase orders', icon: 'receipt_long', roles: BUY, screen: 'WEB-09' },
            { href: '/erp/inventory', label: 'Stock explorer', icon: 'warehouse', roles: BUY, screen: 'WEB-10' },
            { href: '/erp/subcontractors', label: 'Subcontractors', icon: 'engineering', roles: ['PROJECT_MANAGER', 'COMMERCIAL', 'DIRECTOR', 'PROJECT_HEAD', 'SITE_ENGINEER', 'ACCOUNTS'], screen: 'WEB-11' },
        ],
    },
    {
        label: 'Accounts and finance',
        items: [
            { href: '/erp/finance/purchase-invoices', label: 'Purchase invoices', icon: 'description', roles: FIN_READ, screen: 'WEB-12' },
            { href: '/erp/finance/sales-invoices', label: 'Client billing', icon: 'request_page', roles: FIN_READ, screen: 'WEB-13' },
            { href: '/erp/finance/receipts', label: 'Client receipts', icon: 'savings', roles: FIN_READ, screen: 'WEB-14' },
            { href: '/erp/finance/payments', label: 'Payments', icon: 'payments', roles: FIN_READ, screen: 'WEB-15' },
            { href: '/erp/finance/expenses', label: 'Direct expenses', icon: 'account_balance_wallet', roles: [...FIN_READ], screen: 'WEB-16' },
            { href: '/erp/finance/petty-cash', label: 'Petty cash', icon: 'wallet', roles: ['ACCOUNTS', 'PROJECT_MANAGER', 'PROJECT_HEAD', 'DIRECTOR'], screen: 'WEB-17' },
        ],
    },
    {
        label: 'Administration',
        items: [
            { href: '/erp/masters', label: 'Master data', icon: 'database', roles: ['ADMIN', 'COMMERCIAL', 'ACCOUNTS', 'DIRECTOR'], screen: 'WEB-01' },
            { href: '/erp/admin/users', label: 'Users and access', icon: 'manage_accounts', roles: ['ADMIN', 'DIRECTOR'], screen: 'WEB-02' },
            { href: '/erp/admin/rules', label: 'Approval matrix', icon: 'rule', roles: ['ADMIN', 'DIRECTOR'], screen: 'WEB-03' },
        ],
    },
]

export function navFor(roles: string[]): NavGroup[] {
    return NAV.map(g => ({ ...g, items: g.items.filter(i => i.roles.some(r => roles.includes(r))) })).filter(g => g.items.length)
}

/** Where a user lands after signing in. */
export function homeFor(roles: string[]): string {
    const first = navFor(roles)[0]?.items[0]
    if (roles.includes('DIRECTOR') || roles.includes('PROJECT_HEAD')) return '/erp/dashboard'
    if (roles.includes('PURCHASE_MGR')) return '/erp/procurement/queue'
    if (roles.includes('ACCOUNTS')) return '/erp/finance/purchase-invoices'
    if (roles.includes('COMMERCIAL') || roles.includes('ESTIMATION')) return '/erp/enquiries'
    if (roles.includes('PROJECT_MANAGER')) return '/erp/inbox'
    if (roles.includes('ADMIN')) return '/erp/admin/users'
    return first?.href ?? '/erp'
}
