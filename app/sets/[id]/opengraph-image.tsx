import { shareImage, OG_SIZE } from '@/lib/shareImage'

export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = 'Flashcard set preview'

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return shareImage('set', id)
}
