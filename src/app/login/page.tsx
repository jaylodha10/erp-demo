'use client'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { request, ApiClientError } from '@/lib/api'
import { homeFor } from '@/lib/nav'

const QUICK_PERSONAS = [
    { key: 'rohit', name: 'Rohit Sainik', role: 'Director / CEO', color: '#2563eb', desc: 'Full executive oversight, P&L, approval matrices' },
    { key: 'vikram', name: 'Vikram Rathore', role: 'Project Head', color: '#0d9488', desc: 'Multi-project operations, large PO sign-offs' },
    { key: 'amit', name: 'Amit Verma', role: 'Sr. Project Manager', color: '#7c3aed', desc: 'Site execution, variations, petty cash, PM inbox' },
    { key: 'priya', name: 'Priya Nair', role: 'Purchase Manager', color: '#ea580c', desc: 'Material indents, RFQ comparative, PO issuance' },
    { key: 'karan', name: 'Karan Mehta', role: 'Commercial & Estimation', color: '#d97706', desc: 'Enquiries, BOQ building, quotations, extra work' },
    { key: 'deepak', name: 'Deepak Agarwal', role: 'Accounts & Finance', color: '#16a34a', desc: '3-way invoice match, client billing, payments' },
    { key: 'admin', name: 'System Admin', role: 'Administrator', color: '#475569', desc: 'Master data, users, approval rules' },
]

function LoginForm() {
    const params = useSearchParams()
    const [identifier, setIdentifier] = useState('rohit@radius9.in')
    const [password, setPassword] = useState('Radius9@123')
    const [code, setCode] = useState('')
    const [needsCode, setNeedsCode] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    async function loginAs(userKey: string) {
        setBusy(true)
        setError(null)
        try {
            const r = await request<{ user: { roles: string[] } }>('POST', '/auth/login', { identifier: userKey, password: 'any' })
            const next = params.get('next')
            window.location.href = next && next.startsWith('/erp') ? next : homeFor(r.user.roles)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not sign in')
        } finally {
            setBusy(false)
        }
    }

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
            const r = await request<{ user: { roles: string[] } }>('POST', '/auth/login', { identifier, password, ...(needsCode ? { mfa_code: code } : {}) })
            const next = params.get('next')
            window.location.href = next && next.startsWith('/erp') ? next : homeFor(r.user.roles)
        } catch (err) {
            if (err instanceof ApiClientError && err.code === 'MFA_REQUIRED') {
                setNeedsCode(true)
                setError(null)
            } else {
                setError(err instanceof Error ? err.message : 'Could not sign in')
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="login-card" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <h1 style={{ fontSize: 22, fontWeight: 800 }}>Sign in</h1>
                <span className="tag" style={{ background: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>Interactive Demo</span>
            </div>
            <p className="muted small" style={{ marginBottom: 16 }}>Select a persona below to demo immediate role-based workflows, or enter credentials.</p>
            
            {error ? <div className="alert danger" role="alert">{error}</div> : null}

            {/* Quick 1-Click Persona Login */}
            <div style={{ marginBottom: 20 }}>
                <div className="small muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    1-Click Demo Personas
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {QUICK_PERSONAS.map(p => (
                        <button
                            key={p.key}
                            type="button"
                            className="card"
                            style={{
                                margin: 0,
                                padding: '8px 10px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                border: '1px solid #cbd5e1',
                                background: '#fff',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 2,
                                borderRadius: 10,
                                transition: 'all 0.15s ease',
                            }}
                            onClick={() => void loginAs(p.key)}
                            disabled={busy}
                        >
                            <div style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a' }}>{p.name}</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: p.color }}>{p.role}</div>
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ position: 'relative', textAlign: 'center', margin: '16px 0' }}>
                <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0' }} />
                <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '0 8px', fontSize: 11, color: '#94a3b8' }}>
                    or enter manually
                </span>
            </div>

            <form onSubmit={submit}>
                <div className="field">
                    <label htmlFor="identifier">Phone or email</label>
                    <input id="identifier" className="input" autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} disabled={needsCode} autoFocus required />
                </div>
                <div className="field">
                    <label htmlFor="password">Password</label>
                    <input id="password" type="password" className="input" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} disabled={needsCode} required />
                </div>
                {needsCode ? (
                    <div className="field">
                        <label htmlFor="code">Verification code</label>
                        <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required />
                        <div className="hint">Demo MFA code: enter 000000</div>
                    </div>
                ) : null}
                <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 10, marginTop: 4 }} disabled={busy || !identifier || !password || (needsCode && code.length !== 6)}>
                    {busy ? 'Signing in...' : needsCode ? 'Verify and sign in' : 'Sign in'}
                </button>
            </form>
        </div>
    )
}

export default function LoginPage() {
    return (
        <div className="login-wrap">
            <div className="login-art">
                <div className="row">
                    <div className="brand-logo">R9</div>
                    <strong style={{ fontSize: 18 }}>Radius 9 ERP</strong>
                </div>
                <div>
                    <span className="tag" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', marginBottom: 16, display: 'inline-block' }}>
                        Frontend Prototype Demo
                    </span>
                    <h2 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginBottom: 14 }}>
                        Every rupee tied to a project.
                    </h2>
                    <p style={{ color: '#cbd5e1', maxWidth: 440, lineHeight: 1.6, fontSize: 14 }}>
                        Experience the complete end-to-end workflow: enquiry to BOQ, procurement to site stock, labour, subcontractors, petty cash, and client billing with live profitability.
                    </p>
                </div>
                <small style={{ color: '#94a3b8' }}>Radius 9 Innovations Pvt. Ltd. • Interactive Demo</small>
            </div>
            <div className="login-panel">
                <Suspense fallback={null}><LoginForm /></Suspense>
            </div>
        </div>
    )
}
