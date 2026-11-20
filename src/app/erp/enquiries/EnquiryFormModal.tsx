'use client'
import { useState } from 'react'
import { api } from '@/lib/api'
import { ApiSelect, Alert, Button, Field, Input, MasterSelect, Modal, NumberInput, Textarea } from '@/components/ui'

export interface EnquiryRecord {
    id: string
    enquiry_no: string
    client_id: string | null
    client_name: string
    contact_name: string | null
    contact_phone: string | null
    project_name: string
    site_city: string | null
    site_address: string | null
    project_type_id: string | null
    carpet_area_sqft: number | null
    expected_value: number
    lead_source: string | null
    next_followup_date: string | null
    notes: string | null
}

const LEAD_SOURCES = ['Mall Management Referral', 'Architect referral', 'Existing client', 'Website', 'Walk-in', 'Social media', 'Exhibition']

interface Props {
    open: boolean
    onClose: () => void
    /** When given, the form edits this enquiry instead of creating a new one. */
    initial?: EnquiryRecord
    onSaved: (saved: { id: string }) => void
}

/** Create or edit an enquiry. The inner form mounts only while open so its fields start fresh each time. */
export function EnquiryFormModal({ open, onClose, initial, onSaved }: Props) {
    if (!open) return null
    return <EnquiryForm onClose={onClose} initial={initial} onSaved={onSaved} />
}

function EnquiryForm({ onClose, initial, onSaved }: Omit<Props, 'open'>) {
    const [clientId, setClientId] = useState(initial?.client_id ?? '')
    const [clientName, setClientName] = useState(initial?.client_name ?? '')
    const [contactName, setContactName] = useState(initial?.contact_name ?? '')
    const [contactPhone, setContactPhone] = useState(initial?.contact_phone ?? '')
    const [projectName, setProjectName] = useState(initial?.project_name ?? '')
    const [city, setCity] = useState(initial?.site_city ?? '')
    const [address, setAddress] = useState(initial?.site_address ?? '')
    const [typeId, setTypeId] = useState(initial?.project_type_id ?? '')
    const [area, setArea] = useState<number | ''>(initial?.carpet_area_sqft ?? '')
    const [value, setValue] = useState<number | ''>(initial?.expected_value ?? '')
    const [source, setSource] = useState(initial?.lead_source ?? '')
    const [followup, setFollowup] = useState(initial?.next_followup_date?.slice(0, 10) ?? '')
    const [notes, setNotes] = useState(initial?.notes ?? '')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [touched, setTouched] = useState(false)

    const nameErr = touched && !clientName.trim() ? 'Enter the client name' : undefined
    const projErr = touched && !projectName.trim() ? 'Enter the project name' : undefined

    async function submit() {
        setTouched(true)
        if (!clientName.trim() || !projectName.trim()) return
        setBusy(true); setError(null)
        const payload = {
            client_name: clientName.trim(),
            client_id: clientId || null,
            contact_name: contactName.trim() || null,
            contact_phone: contactPhone.trim() || null,
            project_name: projectName.trim(),
            site_city: city.trim() || null,
            site_address: address.trim() || null,
            project_type_id: typeId || null,
            carpet_area_sqft: area === '' ? null : area,
            expected_value: value === '' ? 0 : value,
            lead_source: source.trim() || null,
            next_followup_date: followup || null,
            notes: notes.trim() || null,
        }
        try {
            const saved = initial ? await api.put<{ id: string }>(`/enquiries/${initial.id}`, payload) : await api.post<{ id: string }>('/enquiries', payload)
            onSaved(saved)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the enquiry')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal open title={initial ? `Edit enquiry ${initial.enquiry_no}` : 'New enquiry'} onClose={onClose} wide footer={
            <>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="primary" loading={busy} onClick={submit}>{initial ? 'Save changes' : 'Create enquiry'}</Button>
            </>
        }>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div className="form-grid">
                <Field label="Existing client (optional)" hint="Pick a client already in the master, or type a new name in the next field.">
                    <ApiSelect<{ id: string; legal_name: string }> path="/masters/clients?limit=200" value={clientId} label={c => c.legal_name} placeholder="New client"
                        onChange={(id, row) => { setClientId(id); if (row) setClientName(row.legal_name) }} />
                </Field>
                <Field label="Client name *" error={nameErr}>
                    <Input value={clientName} onChange={e => { setClientName(e.target.value); setClientId('') }} maxLength={200} />
                </Field>
                <Field label="Contact person">
                    <Input value={contactName} onChange={e => setContactName(e.target.value)} maxLength={150} />
                </Field>
                <Field label="Contact phone">
                    <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} inputMode="tel" maxLength={20} />
                </Field>
                <Field label="Project name *" error={projErr} className="full">
                    <Input value={projectName} onChange={e => setProjectName(e.target.value)} maxLength={200} />
                </Field>
                <Field label="City">
                    <Input value={city} onChange={e => setCity(e.target.value)} maxLength={80} />
                </Field>
                <Field label="Project type">
                    <MasterSelect master="project-types" value={typeId} onChange={setTypeId} placeholder="Not set" />
                </Field>
                <Field label="Site address" className="full">
                    <Input value={address} onChange={e => setAddress(e.target.value)} />
                </Field>
                <Field label="Carpet area (sqft)">
                    <NumberInput value={area} onChange={setArea} min={0} step="any" />
                </Field>
                <Field label="Expected value (₹, excl. GST)">
                    <NumberInput value={value} onChange={setValue} min={0} step="any" />
                </Field>
                <Field label="Lead source">
                    <Input value={source} onChange={e => setSource(e.target.value)} list="enquiry-lead-sources" maxLength={100} />
                    <datalist id="enquiry-lead-sources">{LEAD_SOURCES.map(s => <option key={s} value={s} />)}</datalist>
                </Field>
                <Field label="Next follow-up date">
                    <Input type="date" value={followup} onChange={e => setFollowup(e.target.value)} />
                </Field>
                <Field label="Notes" className="full">
                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
                </Field>
            </div>
        </Modal>
    )
}
