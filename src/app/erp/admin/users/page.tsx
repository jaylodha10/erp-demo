'use client'
import { useId, useMemo, useState } from 'react'
import { api, useApi } from '@/lib/api'
import { useSession } from '@/lib/session'
import { fmtDateTime } from '@/lib/format'
import {
    Alert, Async, Button, Card, DataTable, Empty, Field, Icon, Input, Kpi, Modal, PageHeader, Select, useToast, type Column,
} from '@/components/ui'

/** WEB-02 Users, roles and site scope. */

interface RoleRow { id: string; code: string; name: string; requires_mfa: boolean; is_active: boolean }
interface Assignment { project_id: string; site_id: string; assignment_role: string; site: { code: string; name: string } }
interface UserRow {
    id: string; full_name: string; phone: string; email: string | null; ui_mode: 'WEB_FULL' | 'MOBILE_7_TILE'; is_active: boolean; mfa_enabled: boolean
    last_login_at: string | null; branch_id: string; branch: { code: string; name: string } | null
    role_codes: string[]; requires_mfa: boolean; user_roles: { role: { code: string; name: string; requires_mfa: boolean } }[]
    user_site_assignments: Assignment[]
}
interface SiteRow { id: string; code: string; name: string; project_id: string }
interface BranchRow { id: string; code: string; name: string }
interface UsersResponse { items: UserRow[]; roles: RoleRow[]; branches: BranchRow[]; sites: SiteRow[] }
interface ProjectLite { id: string; project_code: string; name: string }

/** Roles that see every project. Everyone else only sees the sites they are assigned to (mirrors rbac.ts). */
const GLOBAL_ROLES = ['ADMIN', 'DIRECTOR', 'PROJECT_HEAD', 'PURCHASE_MGR', 'COMMERCIAL', 'ESTIMATION', 'ACCOUNTS']
const ASSIGN_ROLES = ['SITE_SUPERVISOR', 'STOREKEEPER', 'SITE_ENGINEER', 'PROJECT_MANAGER', 'PROJECT_HEAD']
const UI_MODES = [{ id: 'WEB_FULL', label: 'Head-office web app' }, { id: 'MOBILE_7_TILE', label: 'Site mobile app (7 tiles)' }]
const isGlobal = (u: UserRow) => u.role_codes.some(r => GLOBAL_ROLES.includes(r))
const human = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')

export default function UsersPage() {
    const { user: me } = useSession()
    const state = useApi<UsersResponse>('/admin/users')
    const projects = useApi<{ items: ProjectLite[] }>('/projects')
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState('')
    const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active')
    const [editing, setEditing] = useState<UserRow | 'new' | null>(null)
    const [scopeFor, setScopeFor] = useState<UserRow | null>(null)
    const [mfaFor, setMfaFor] = useState<UserRow | null>(null)

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (state.data?.items ?? []).filter(u =>
            (statusFilter === 'all' || (statusFilter === 'active') === u.is_active) &&
            (!roleFilter || u.role_codes.includes(roleFilter)) &&
            (!q || [u.full_name, u.phone, u.email ?? '', u.branch?.code ?? ''].some(s => s.toLowerCase().includes(q)))
        )
    }, [state.data, search, roleFilter, statusFilter])

    const all = state.data?.items ?? []
    const active = all.filter(u => u.is_active)
    const mfaGap = active.filter(u => u.requires_mfa && !u.mfa_enabled)
    const noScope = active.filter(u => !isGlobal(u) && u.user_site_assignments.length === 0)

    const columns: Column<UserRow>[] = [
        {
            key: 'full_name', header: 'User', render: u => (
                <div>
                    <div className="strong">{u.full_name}{me?.id === u.id ? <span className="badge info" style={{ marginLeft: 6 }}>You</span> : null}</div>
                    <div className="muted small">{u.phone}{u.email ? ` · ${u.email}` : ''}</div>
                </div>
            ),
        },
        {
            key: 'roles', header: 'Roles', render: u => (
                <div className="row" style={{ gap: 4 }}>
                    {u.user_roles.map(r => (
                        <span key={r.role.code} className={`badge ${r.role.requires_mfa ? 'purple' : ''}`} title={r.role.requires_mfa ? 'This role requires multi-factor sign-in' : undefined}>
                            {r.role.requires_mfa ? <Icon name="lock" /> : null}{r.role.name}{r.role.requires_mfa ? ' (MFA)' : ''}
                        </span>
                    ))}
                </div>
            ),
        },
        { key: 'branch', header: 'Branch', render: u => u.branch ? `${u.branch.code}` : '—' },
        { key: 'ui', header: 'App', render: u => <span className="small">{u.ui_mode === 'WEB_FULL' ? 'Web' : 'Mobile'}</span> },
        { key: 'mfa', header: 'MFA', render: u => <MfaBadge u={u} /> },
        {
            key: 'scope', header: 'Site scope', render: u => {
                if (isGlobal(u)) return <span className="muted small">All projects</span>
                const n = u.user_site_assignments.length
                return n ? (
                    <div className="small">
                        <strong>{n} site{n === 1 ? '' : 's'}</strong>
                        <div className="muted">{u.user_site_assignments.slice(0, 3).map(a => a.site.code).join(', ')}{n > 3 ? ` +${n - 3} more` : ''}</div>
                    </div>
                ) : <span className="badge warning"><Icon name="warning" />No sites assigned</span>
            },
        },
        { key: 'last', header: 'Last sign-in', render: u => <span className="small">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</span> },
        { key: 'active', header: 'Status', render: u => <span className={`badge ${u.is_active ? 'success' : ''}`}>{u.is_active ? 'Active' : 'Inactive'}</span> },
        {
            key: 'actions', header: 'Actions', align: 'right', render: u => (
                <div className="actions" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <Button size="sm" icon="edit" onClick={() => setEditing(u)} aria-label={`Edit ${u.full_name}`}>Edit</Button>
                    {!isGlobal(u) ? <Button size="sm" icon="location_on" onClick={() => setScopeFor(u)} aria-label={`Site scope for ${u.full_name}`}>Scope</Button> : null}
                    <Button size="sm" icon="key" onClick={() => setMfaFor(u)} aria-label={`MFA for ${u.full_name}`}>MFA</Button>
                </div>
            ),
        },
    ]

    return (
        <>
            <PageHeader
                title="Users and access"
                subtitle="Who can sign in, what they can do, and which sites they can see. Director and Accounts roles must use multi-factor sign-in."
                actions={<Button variant="primary" icon="person_add" onClick={() => setEditing('new')}>Add user</Button>}
            />
            <Async state={state}>
                {d => (
                    <>
                        <div className="kpi-grid">
                            <Kpi label="Active users" value={active.length} sub={`${all.length - active.length} inactive`} />
                            <Kpi label="MFA required, not enrolled" value={mfaGap.length} tone={mfaGap.length ? 'bad' : 'good'} sub={mfaGap.length ? mfaGap.map(u => u.full_name).join(', ') : 'Everyone who needs MFA has it'} />
                            <Kpi label="Site staff without sites" value={noScope.length} tone={noScope.length ? 'warn' : 'good'} sub={noScope.length ? noScope.map(u => u.full_name).join(', ') : 'All scoped users have sites'} />
                        </div>
                        <Card>
                            <div className="row" style={{ marginBottom: 12 }}>
                                <div style={{ flex: '1 1 220px', maxWidth: 340 }}>
                                    <Input type="search" aria-label="Search users" placeholder="Search name, phone, email, branch..." value={search} onChange={e => setSearch(e.target.value)} />
                                </div>
                                <div style={{ width: 200 }}>
                                    <Select aria-label="Filter by role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                                        <option value="">All roles</option>
                                        {d.roles.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                                    </Select>
                                </div>
                                <div style={{ width: 150 }}>
                                    <Select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>
                                        <option value="active">Active only</option>
                                        <option value="inactive">Inactive only</option>
                                        <option value="all">All users</option>
                                    </Select>
                                </div>
                                <span className="spacer" />
                                <span className="muted small">{rows.length} of {all.length} users</span>
                            </div>
                            <DataTable columns={columns} rows={rows} empty={<Empty title="No users match" icon="group">Change the filters or add a new user.</Empty>} />
                        </Card>
                    </>
                )}
            </Async>

            {editing && state.data ? (
                <UserForm
                    key={editing === 'new' ? 'new' : editing.id}
                    user={editing === 'new' ? null : editing}
                    data={state.data}
                    selfId={me?.id}
                    myBranch={me?.branch.id}
                    onClose={() => setEditing(null)}
                    onSaved={async created => {
                        setEditing(null)
                        await state.reload()
                        if (created) {
                            const fresh = (await api.get<UsersResponse>('/admin/users')).items.find(u => u.id === created)
                            if (fresh?.requires_mfa) setMfaFor(fresh)
                        }
                    }}
                />
            ) : null}
            {scopeFor && state.data ? (
                <ScopeDialog key={scopeFor.id} user={scopeFor} sites={state.data.sites} projects={projects.data?.items ?? []} onClose={() => setScopeFor(null)} onSaved={async () => { setScopeFor(null); await state.reload() }} />
            ) : null}
            {mfaFor ? <MfaDialog key={mfaFor.id} user={mfaFor} onClose={() => { setMfaFor(null); void state.reload() }} /> : null}
        </>
    )
}

function MfaBadge({ u }: { u: UserRow }) {
    if (u.requires_mfa && !u.mfa_enabled) return <span className="badge danger"><Icon name="error" />Required, not set up</span>
    if (u.mfa_enabled) return <span className="badge success"><Icon name="verified_user" />{u.requires_mfa ? 'On (required)' : 'On'}</span>
    return <span className="muted small">Not required</span>
}

// ---------------------------------------------------------------------------------------------- create / edit
function UserForm({ user, data, selfId, myBranch, onClose, onSaved }: { user: UserRow | null; data: UsersResponse; selfId?: string; myBranch?: string; onClose: () => void; onSaved: (createdId?: string) => Promise<void> }) {
    const formId = useId()
    const toast = useToast()
    const [f, setF] = useState({
        full_name: user?.full_name ?? '', phone: user?.phone ?? '', email: user?.email ?? '', password: '',
        branch_id: user?.branch_id ?? myBranch ?? data.branches[0]?.id ?? '', ui_mode: user?.ui_mode ?? 'WEB_FULL',
        role_codes: user?.role_codes ?? [] as string[], is_active: user?.is_active ?? true,
    })
    const [errors, setErrors] = useState<Record<string, string>>({})
    const [serverError, setServerError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const roleList = data.roles.filter(r => r.is_active || f.role_codes.includes(r.code))
    const mfaRoles = roleList.filter(r => f.role_codes.includes(r.code) && r.requires_mfa)
    const isSelf = !!user && user.id === selfId
    const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF(s => ({ ...s, [k]: v })); setErrors(e => ({ ...e, [k]: '' })) }

    async function submit(ev: React.FormEvent) {
        ev.preventDefault()
        const e: Record<string, string> = {}
        if (f.full_name.trim().length < 2) e.full_name = 'Enter the full name'
        if (!/^\d{10,15}$/.test(f.phone)) e.phone = 'Phone must be 10 to 15 digits, numbers only'
        if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address, or leave it blank'
        if (!user && f.password.length < 8) e.password = 'Set an initial password of at least 8 characters'
        if (user && f.password && f.password.length < 8) e.password = 'Use at least 8 characters, or leave blank to keep the current password'
        if (!f.branch_id) e.branch_id = 'Choose a branch'
        if (!f.role_codes.length) e.role_codes = 'Give the user at least one role'
        setErrors(e)
        setServerError(null)
        if (Object.keys(e).length) return
        const body: Record<string, unknown> = {
            full_name: f.full_name.trim(), phone: f.phone, email: f.email.trim(), branch_id: f.branch_id, ui_mode: f.ui_mode, role_codes: f.role_codes,
        }
        if (f.password) body.password = f.password
        if (user) body.is_active = f.is_active
        setBusy(true)
        try {
            if (user) {
                await api.put(`/admin/users/${user.id}`, body)
                toast.success('User updated')
                await onSaved()
            } else {
                const r = await api.post<{ id: string }>('/admin/users', body)
                toast.success('User created')
                await onSaved(r.id)
            }
        } catch (x) {
            setServerError(x instanceof Error ? x.message : 'Could not save this user')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal open wide title={user ? `Edit ${user.full_name}` : 'Add user'} onClose={onClose} footer={<>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" form={formId} loading={busy}>{user ? 'Save changes' : 'Create user'}</Button>
        </>}>
            <form id={formId} onSubmit={e => void submit(e)} noValidate>
                {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
                <div className="form-grid">
                    <Field label="Full name *" error={errors.full_name}><Input value={f.full_name} onChange={e => set('full_name', e.target.value)} autoFocus /></Field>
                    <Field label="Phone (sign-in ID) *" hint="10 to 15 digits" error={errors.phone}><Input inputMode="numeric" value={f.phone} onChange={e => set('phone', e.target.value.trim())} /></Field>
                    <Field label="Email" error={errors.email}><Input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></Field>
                    <Field label={user ? 'New password' : 'Initial password *'} hint={user ? 'Leave blank to keep the current password' : 'At least 8 characters. The user should change it after first sign-in.'} error={errors.password}>
                        <Input type="password" autoComplete="new-password" value={f.password} onChange={e => set('password', e.target.value)} />
                    </Field>
                    <Field label="Branch *" error={errors.branch_id}>
                        <Select value={f.branch_id} onChange={e => set('branch_id', e.target.value)}>
                            <option value="">Select branch...</option>
                            {data.branches.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="App they use *" hint="Site staff normally use the mobile app">
                        <Select value={f.ui_mode} onChange={e => set('ui_mode', e.target.value as typeof f.ui_mode)}>
                            {UI_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </Select>
                    </Field>
                    <div className="full field">
                        <span id="roles-label" style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Roles *</span>
                        <div role="group" aria-labelledby="roles-label" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 }}>
                            {roleList.map(r => (
                                <label key={r.code} className="checkbox" style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '7px 10px', background: f.role_codes.includes(r.code) ? 'var(--primary-light)' : undefined }}>
                                    <input type="checkbox" checked={f.role_codes.includes(r.code)} onChange={e => set('role_codes', e.target.checked ? [...f.role_codes, r.code] : f.role_codes.filter(c => c !== r.code))} />
                                    <span>{r.name}{r.requires_mfa ? <span className="badge purple" style={{ marginLeft: 6 }}><Icon name="lock" />MFA</span> : null}</span>
                                </label>
                            ))}
                        </div>
                        {errors.role_codes ? <div className="err">{errors.role_codes}</div> : null}
                    </div>
                    {mfaRoles.length ? (
                        <div className="full">
                            <Alert tone="warn">
                                {mfaRoles.map(r => r.name).join(' and ')} {mfaRoles.length > 1 ? 'require' : 'requires'} multi-factor sign-in. {user?.mfa_enabled ? 'MFA is already set up for this user.' : 'This user cannot sign in until MFA is set up. You can generate the setup key right after saving.'}
                            </Alert>
                        </div>
                    ) : null}
                    {user ? (
                        <div className="full">
                            <label className="checkbox">
                                <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} />
                                Active (can sign in)
                            </label>
                            {isSelf && !f.is_active ? <div className="err" style={{ marginTop: 6 }}>You are editing your own account. Deactivating it will lock you out.</div> : null}
                        </div>
                    ) : null}
                </div>
            </form>
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- site scope
function ScopeDialog({ user, sites, projects, onClose, onSaved }: { user: UserRow; sites: SiteRow[]; projects: ProjectLite[]; onClose: () => void; onSaved: () => Promise<void> }) {
    const defaultRole = user.role_codes.find(r => ASSIGN_ROLES.includes(r)) ?? 'SITE_SUPERVISOR'
    const known = useMemo(() => new Set(sites.map(s => s.id)), [sites])
    const [picked, setPicked] = useState<Record<string, string>>(() => Object.fromEntries(user.user_site_assignments.filter(a => known.has(a.site_id)).map(a => [a.site_id, a.assignment_role])))
    const orphan = user.user_site_assignments.filter(a => !known.has(a.site_id))
    const [dropOrphans, setDropOrphans] = useState<string[]>([])
    const [filter, setFilter] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const toast = useToast()

    const groups = useMemo(() => {
        const byProject = new Map<string, SiteRow[]>()
        for (const s of sites) byProject.set(s.project_id, [...(byProject.get(s.project_id) ?? []), s])
        const q = filter.trim().toLowerCase()
        return [...byProject.entries()].map(([pid, list]) => {
            const p = projects.find(x => x.id === pid)
            return { pid, label: p ? `${p.project_code} · ${p.name}` : `Project ${pid.slice(0, 8)}`, sites: list }
        }).filter(g => !q || g.label.toLowerCase().includes(q) || g.sites.some(s => `${s.code} ${s.name}`.toLowerCase().includes(q)))
            .sort((a, b) => a.label.localeCompare(b.label))
    }, [sites, projects, filter])

    const count = Object.keys(picked).length
    const projectCount = new Set(sites.filter(s => picked[s.id]).map(s => s.project_id)).size
    const toggle = (id: string, on: boolean) => setPicked(p => { const n = { ...p }; if (on) n[id] = defaultRole; else delete n[id]; return n })

    async function save() {
        setBusy(true); setErr(null)
        try {
            const assignments = [
                ...Object.entries(picked).map(([site_id, assignment_role]) => ({ site_id, assignment_role })),
                ...orphan.filter(o => !dropOrphans.includes(o.site_id)).map(o => ({ site_id: o.site_id, assignment_role: o.assignment_role })),
            ]
            await api.put(`/admin/users/${user.id}/site-assignments`, { assignments })
            toast.success('Site scope updated')
            await onSaved()
        } catch (x) {
            setErr(x instanceof Error ? x.message : 'Could not save the site scope')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal open wide title={`Site scope for ${user.full_name}`} onClose={onClose} footer={<>
            <span className="muted small" style={{ marginRight: 'auto' }}>{count} site{count === 1 ? '' : 's'} in {projectCount} project{projectCount === 1 ? '' : 's'}</span>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>Save scope</Button>
        </>}>
            {err ? <Alert tone="danger">{err}</Alert> : null}
            <p className="muted small" style={{ marginTop: 0 }}>This user only sees projects and sites ticked below. Saving replaces their previous scope.</p>
            {count === 0 ? <Alert tone="warn">With no sites ticked this user will see no projects at all.</Alert> : null}
            <div style={{ marginBottom: 12, maxWidth: 340 }}>
                <Input type="search" aria-label="Filter projects and sites" placeholder="Filter projects or sites..." value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
            {groups.length === 0 ? <Empty title="No projects match" icon="apartment" /> : groups.map(g => {
                const allOn = g.sites.every(s => picked[s.id])
                return (
                    <fieldset key={g.pid} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', margin: '0 0 10px', minWidth: 0 }}>
                        <legend style={{ fontWeight: 700, fontSize: 13, padding: '0 6px' }}>{g.label}</legend>
                        <div className="row" style={{ marginBottom: 6 }}>
                            <Button size="sm" variant="ghost" onClick={() => setPicked(p => { const n = { ...p }; for (const s of g.sites) { if (allOn) delete n[s.id]; else n[s.id] ??= defaultRole } return n })}>{allOn ? 'Clear all' : 'Select all sites'}</Button>
                        </div>
                        {g.sites.map(s => (
                            <div key={s.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
                                <label className="checkbox">
                                    <input type="checkbox" checked={!!picked[s.id]} onChange={e => toggle(s.id, e.target.checked)} />
                                    <span><strong>{s.code}</strong> <span className="muted">{s.name}</span></span>
                                </label>
                                {picked[s.id] ? (
                                    <div style={{ width: 190 }}>
                                        <Select aria-label={`Role at ${s.code}`} value={picked[s.id]} onChange={e => setPicked(p => ({ ...p, [s.id]: e.target.value }))}>
                                            {[...new Set([...ASSIGN_ROLES, picked[s.id]])].map(r => <option key={r} value={r}>{human(r)}</option>)}
                                        </Select>
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </fieldset>
                )
            })}
            {orphan.length ? (
                <Card title="Other assignments" sub="These sites are no longer in the active list. Tick to remove.">
                    {orphan.map(o => (
                        <label key={o.site_id} className="checkbox" style={{ display: 'flex', padding: '3px 0' }}>
                            <input type="checkbox" checked={dropOrphans.includes(o.site_id)} onChange={e => setDropOrphans(l => e.target.checked ? [...l, o.site_id] : l.filter(x => x !== o.site_id))} />
                            {o.site.code} · {o.site.name} ({human(o.assignment_role)})
                        </label>
                    ))}
                </Card>
            ) : null}
        </Modal>
    )
}

// ---------------------------------------------------------------------------------------------- MFA enrolment
function MfaDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
    const [result, setResult] = useState<{ secret: string; otpauth_url: string } | null>(null)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [copied, setCopied] = useState<string | null>(null)
    const toast = useToast()

    async function generate() {
        setBusy(true); setErr(null)
        try {
            setResult(await api.post(`/admin/users/${user.id}/mfa`))
            toast.success('MFA key generated')
        } catch (x) {
            setErr(x instanceof Error ? x.message : 'Could not generate the MFA key')
        } finally {
            setBusy(false)
        }
    }
    async function copy(label: string, text: string) {
        try { await navigator.clipboard.writeText(text); setCopied(label) } catch { setCopied(null); toast.error('Copy failed. Select the text and copy it by hand.') }
    }

    return (
        <Modal open title={`Multi-factor sign-in for ${user.full_name}`} onClose={onClose} footer={
            result ? <Button variant="primary" onClick={onClose}>I have saved it, close</Button> : <>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" icon="key" loading={busy} onClick={() => void generate()}>{user.mfa_enabled ? 'Replace key' : 'Generate key'}</Button>
            </>
        }>
            {err ? <Alert tone="danger">{err}</Alert> : null}
            {!result ? (
                <>
                    <p style={{ marginTop: 0 }}>
                        {user.requires_mfa ? 'This user holds a role that requires MFA, so they cannot sign in without it.' : 'This user does not need MFA for their roles, but you can still set it up.'}
                    </p>
                    {user.mfa_enabled ? <Alert tone="warn">MFA is already on. Generating a new key switches it on immediately and the user&apos;s current authenticator entry stops working.</Alert> : <Alert tone="info">You will get a setup key to enter in an authenticator app (Google Authenticator, Microsoft Authenticator, Authy). It is shown once.</Alert>}
                </>
            ) : (
                <>
                    <Alert tone="warn"><strong>Shown once.</strong> Give this to {user.full_name} through a safe channel now. Once you close this window it cannot be shown again. Generating another key will replace it.</Alert>
                    <Field label="Setup key (type this into the authenticator app)" hint="Account type: time-based, 6 digits, 30 seconds">
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                            <div className="mono" tabIndex={0} style={{ flex: 1, minWidth: 0, fontSize: 16, letterSpacing: 2, fontWeight: 700, border: '1px solid #cbd5e1', borderRadius: 9, padding: '8px 10px', wordBreak: 'break-word', userSelect: 'all', background: '#f8fafc' }}>{result.secret.replace(/(.{4})/g, '$1 ').trim()}</div>
                            <Button icon={copied === 'secret' ? 'check' : 'content_copy'} onClick={() => void copy('secret', result.secret)}>{copied === 'secret' ? 'Copied' : 'Copy'}</Button>
                        </div>
                    </Field>
                    <Field label="Setup link (for apps that open otpauth links)">
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                            <Input readOnly className="mono" style={{ fontSize: 12 }} value={result.otpauth_url} onFocus={e => e.currentTarget.select()} />
                            <Button icon={copied === 'url' ? 'check' : 'content_copy'} onClick={() => void copy('url', result.otpauth_url)}>{copied === 'url' ? 'Copied' : 'Copy'}</Button>
                        </div>
                    </Field>
                </>
            )}
        </Modal>
    )
}
