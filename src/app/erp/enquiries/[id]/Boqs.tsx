'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { pct } from '@/lib/format'
import { Button, Card, DataTable, Empty, Money, StatusBadge, useAction } from '@/components/ui'
import type { BoqVersion, Enquiry } from './types'

/** The BOQ versions of an enquiry: create, open the builder, copy a previous version. */
export function BoqSection({ enquiry }: { enquiry: Enquiry }) {
    const router = useRouter()
    const { can } = useSession()
    const { run, busy } = useAction()
    const closed = enquiry.status === 'WON' || enquiry.status === 'LOST'
    const canWrite = can('ESTIMATION', 'COMMERCIAL', 'DIRECTOR') && !closed
    const versions = enquiry.boq_headers

    async function create(copyFrom?: string) {
        const boq = await run(() => api.post<{ id: string }>('/boqs', { enquiry_id: enquiry.id, ...(copyFrom ? { copy_from_boq_id: copyFrom } : {}) }), 'BOQ draft created')
        if (boq) router.push(`/erp/boq/${boq.id}`)
    }

    return (
        <Card
            title="Bill of quantities"
            sub="Each version is a separate BOQ. Lock a version as the baseline before quoting from it."
            actions={canWrite ? (
                <Button variant="primary" icon="add" loading={busy} onClick={() => create()}>
                    {versions.length ? 'New version (copy of latest)' : 'Create BOQ'}
                </Button>
            ) : null}
        >
            <DataTable<BoqVersion>
                rows={versions}
                empty={<Empty title="No BOQ yet" icon="table_chart">{canWrite ? 'Create the first BOQ to price this enquiry.' : 'The estimation team has not started a BOQ.'}</Empty>}
                columns={[
                    { key: 'boq_no', header: 'BOQ', render: b => <Link href={`/erp/boq/${b.id}`} className="strong" style={{ whiteSpace: 'nowrap' }}>{b.boq_no}</Link> },
                    { key: 'version_no', header: 'Version', render: b => `v${b.version_no}` },
                    { key: 'status', header: 'Status', render: b => <StatusBadge status={b.status} /> },
                    { key: 'est_total_cost', header: 'Est. cost', align: 'right', render: b => <Money value={b.est_total_cost} /> },
                    { key: 'sell_total', header: 'Selling total', align: 'right', render: b => <Money value={b.sell_total} /> },
                    { key: 'gross_margin_pct', header: 'Margin', align: 'right', render: b => pct(b.gross_margin_pct) },
                    {
                        key: 'actions', header: '', align: 'right', render: b => (
                            <div className="actions" style={{ justifyContent: 'flex-end' }}>
                                <Link href={`/erp/boq/${b.id}`} className="btn btn-sm">{b.status === 'DRAFT' && can('ESTIMATION', 'COMMERCIAL', 'DIRECTOR') ? 'Open builder' : 'View'}</Link>
                                {canWrite ? <Button size="sm" disabled={busy} onClick={() => create(b.id)}>Copy as new version</Button> : null}
                            </div>
                        ),
                    },
                ]}
            />
        </Card>
    )
}
