import type { Metadata, Viewport } from 'next'
import { RegisterSW } from '@/components/RegisterSW'
import AuthGuard from '@/components/AuthGuard'
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
      <body className="bg-gray-50 dark:bg-gray-900 min-h-screen">
        <ThemeProvider>
          <RegisterSW />
          <AuthGuard>{children}</AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  )
}
