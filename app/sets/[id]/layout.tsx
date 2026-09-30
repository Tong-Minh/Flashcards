import type { Metadata } from 'next'
import { shareMetadata } from '@/lib/sharePreview'

// Server layout so shared links unfurl with the set's name, description, and preview image.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return shareMetadata('set', id)
}

export default function SetLayout({ children }: { children: React.ReactNode }) {
  return children
}
