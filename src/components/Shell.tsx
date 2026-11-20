'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { useSession } from '@/lib/session'
import { navFor } from '@/lib/nav'
import { api, useApi } from '@/lib/api'
import { fmtDateTime } from '@/lib/format'
import { Button, Empty, Icon, Loading, Modal, ToastProvider } from '@/components/ui'

interface Note { id: string; title: string; body: string | null; link: string | null; severity: string; is_read: boolean; created_at: string }

function Bell() {
    const router = useRouter()
    const notes = useApi<{ items: Note[]; unread: number }>('/notifications')
    const [open, setOpen] = useState(false)
    useEffect(() => {
        const t = setInterval(() => void notes.reload(), 60000)
        return () => clearInterval(t)
    }, [notes])
    const unread = notes.data?.unread ?? 0
    return (
        <>
            <button className="btn btn-sm" onClick={() => setOpen(true)} aria-label={`Notifications, ${unread} unread`}>
                <Icon name="notifications" />{unread > 0 ? <span className="nav-badge" style={{ marginLeft: 2 }}>{unread}</span> : null}
            </button>
            <Modal open={open} title="Notifications" onClose={() => setOpen(false)} footer={
                <Button onClick={async () => { await api.post('/notifications/read', {}); await notes.reload() }} disabled={!unread}>Mark all as read</Button>
            }>
                {!notes.data?.items.length ? <Empty title="You are all caught up" icon="notifications_off" /> : (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {notes.data.items.map(n => (
                            <div key={n.id} className="card" style={{ margin: 0, padding: 12, cursor: n.link ? 'pointer' : 'default', opacity: n.is_read ? 0.65 : 1 }}
                                onClick={() => { if (n.link) { setOpen(false); router.push(n.link) } }}>
                                <div className="strong">{n.title}</div>
                                {n.body ? <div className="small muted">{n.body}</div> : null}
                                <div className="small muted">{fmtDateTime(n.created_at)}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </>
    )
}

const PERSONAS = [
    { key: 'rohit', label: 'Rohit Sainik (Director / CEO)' },
    { key: 'vikram', label: 'Vikram Rathore (Project Head)' },
    { key: 'amit', label: 'Amit Verma (Project Manager)' },
    { key: 'priya', label: 'Priya Nair (Purchase Manager)' },
    { key: 'karan', label: 'Karan Mehta (Commercial & Estimation)' },
    { key: 'deepak', label: 'Deepak Agarwal (Accounts & Finance)' },
    { key: 'admin', label: 'System Admin' },
]

function Frame({ children }: { children: ReactNode }) {
    const { user, loading, logout, switchUser } = useSession()
    const pathname = usePathname()
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const roles = user?.roles ?? []
    const inbox = useApi<{ items: unknown[] }>(user && roles.some(r => ['PROJECT_MANAGER', 'PURCHASE_MGR', 'PROJECT_HEAD', 'ACCOUNTS', 'DIRECTOR', 'COMMERCIAL'].includes(r)) ? '/workflows/inbox' : null)

    useEffect(() => {
        if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    }, [loading, user, router, pathname])

    if (loading || !user) return <Loading label="Loading demo workspace..." />
    const groups = navFor(roles)

    // Current selected persona key
    const currentKey = Object.entries({
        rohit: 'Rohit',
        vikram: 'Vikram',
        amit: 'Amit',
        priya: 'Priya',
        karan: 'Karan',
        deepak: 'Deepak',
        admin: 'Admin',
    }).find(([_, name]) => user.name.includes(name))?.[0] ?? 'rohit'

    return (
        <div className="shell">
            <aside className={`sidebar ${open ? 'open' : ''}`}>
                <div className="brand">
                    <div className="brand-logo">R9</div>
                    <div>
                        <strong>Radius 9 ERP</strong>
                        <small style={{ color: '#38bdf8' }}>Interactive Prototype</small>
                    </div>
                </div>
                <nav aria-label="Main">
                    {groups.map(g => (
                        <div className="nav-group" key={g.label}>
                            <div className="nav-label">{g.label}</div>
                            {g.items.map(i => {
                                const active = pathname === i.href || pathname.startsWith(i.href + '/')
                                const count = i.href === '/erp/inbox' ? inbox.data?.items.length ?? 0 : 0
                                return (
                                    <Link key={i.href} href={i.href} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)}>
                                        <Icon name={i.icon} />{i.label}{count > 0 ? <span className="nav-badge">{count}</span> : null}
                                    </Link>
                                )
                            })}
                        </div>
                    ))}
                </nav>
                <div className="sidebar-footer">
                    <div className="strong" style={{ color: '#e2e8f0' }}>{user.name}</div>
                    <div>{user.role_names.join(', ')}</div>
                </div>
            </aside>
            <div className="main">
                <header className="topbar">
                    <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                        <button className="btn btn-sm menu-btn" onClick={() => setOpen(o => !o)} aria-label="Menu"><Icon name="menu" /></button>
                        <span className="tag" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 4, verticalAlign: 'middle' }}>preview</span> Prototype Demo
                        </span>
                        <span className="tag">Branch {user.branch.code}</span>
                        {!user.scope.global ? <span className="tag">{user.scope.project_ids.length} assigned project(s)</span> : null}
                        
                        {/* Interactive Persona Switcher for Quick Demo Role Changing */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                            <span className="small muted" style={{ fontWeight: 600 }}>Persona:</span>
                            <select
                                className="select cell-input"
                                style={{ width: 'auto', padding: '4px 8px', fontSize: 12, height: 28, background: '#f8fafc', fontWeight: 600 }}
                                value={currentKey}
                                onChange={e => void switchUser(e.target.value)}
                            >
                                {PERSONAS.map(p => (
                                    <option key={p.key} value={p.key}>{p.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="user">
                        <Bell />
                        <Button size="sm" icon="logout" onClick={() => void logout()}>Sign out</Button>
                    </div>
                </header>
                <main className="content">
                    {groups.length ? children : (
                        <Empty title="No head-office screens for this account" icon="smartphone">
                            <p>Site accounts use the supervisor mobile app, which is not part of this release yet.</p>
                        </Empty>
                    )}
                </main>
            </div>
        </div>
    )
}

export function Shell({ children }: { children: ReactNode }) {
    return <ToastProvider><Frame>{children}</Frame></ToastProvider>
}
