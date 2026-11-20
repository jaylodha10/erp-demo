'use client'
import type { ReactNode } from 'react'
import { SessionProvider } from '@/lib/session'
import { Shell } from '@/components/Shell'

export default function ErpLayout({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <Shell>{children}</Shell>
        </SessionProvider>
    )
}
