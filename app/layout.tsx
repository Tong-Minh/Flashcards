import type { Metadata, Viewport } from 'next'
import { RegisterSW } from '@/components/RegisterSW'
import { CopyAsSource } from '@/components/CopyAsSource'
import { StandaloneGestures } from '@/components/StandaloneGestures'
import AuthGuard from '@/components/AuthGuard'
import { AppShell } from '@/components/AppShell'
import { ThemeProvider } from '@/components/ThemeProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Flashcards',
  description: 'Study smarter with flashcards',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Flashcards',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#4f46e5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Prevent flash of unstyled content on dark mode */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();` }} />
      </head>
      {/* Long unbroken words (identifiers, URLs) wrap instead of widening the page. overflow-x-clip is a
          last-resort guard against sideways scrolling on phones; unlike overflow-hidden it keeps sticky working. */}
      <body className="bg-gray-50 dark:bg-gray-900 min-h-screen [overflow-wrap:break-word] overflow-x-clip">
        <ThemeProvider>
          <RegisterSW />
          <CopyAsSource />
          <StandaloneGestures />
          <AuthGuard><AppShell>{children}</AppShell></AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  )
}
