import type { Metadata } from 'next'
import { shareMetadata } from '@/lib/sharePreview'

// Server layout so shared links unfurl with the collection's name, description, and preview image.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return shareMetadata('collection', id)
}

export default function CollectionLayout({ children }: { children: React.ReactNode }) {
  return children
}
