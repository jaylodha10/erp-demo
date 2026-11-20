'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useSession } from '@/lib/session'
import { homeFor } from '@/lib/nav'
import { Loading } from '@/components/ui'

/** Sends each role to its own starting screen. */
export default function ErpHome() {
    const { user } = useSession()
    const router = useRouter()
    useEffect(() => { if (user) router.replace(homeFor(user.roles)) }, [user, router])
    return <Loading />
}
