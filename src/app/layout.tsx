import type { Metadata, Viewport } from 'next'
import NextTopLoader from 'nextjs-toploader'
import './globals.css'

export const metadata: Metadata = {
    title: 'Radius 9 ERP - Interactive Prototype',
    description: 'Project-centric ERP for civil and interior contracting (Interactive Frontend Demo)',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#0f172a',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <head>
                {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <NextTopLoader color="#2563eb" showSpinner={false} />
                {children}
            </body>
        </html>
    )
}
