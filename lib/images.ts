// Prepares an image for a card: scaled down to at most MAX_SIDE px and re-encoded as WebP (PNG in the
// Mac app), which keeps screenshots around 50–200 KB. GIFs (possibly animated) and SVGs are kept as they are, and so is any
// image the re-encode wouldn't shrink.

const MAX_SIDE = 1600
const QUALITY  = 0.85

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
}

export function extFor(type: string, name = ''): string {
  return EXT_BY_TYPE[type] ?? name.split('.').pop()?.toLowerCase() ?? 'png'
}

export async function prepareImage(blob: Blob, name = ''): Promise<{ bytes: Uint8Array; ext: string }> {
  const original = { bytes: new Uint8Array(await blob.arrayBuffer()), ext: extFor(blob.type, name) }
  if (original.ext === 'gif' || original.ext === 'svg') return original
  try {
    const bitmap = await createImageBitmap(blob)
    const scale  = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width  = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    // Safari (the Mac app) can't encode WebP and quietly returns a PNG, so name the file by what came back
    const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', QUALITY))
    if (!out || (scale === 1 && out.size >= blob.size)) return original
    return { bytes: new Uint8Array(await out.arrayBuffer()), ext: extFor(out.type) }
  } catch {
    // Not decodable here (e.g. an unusual format): keep it as is
    return original
  }
}

// The first image file in a paste or drop, if any
export function imageFileFrom(data: DataTransfer | null | undefined): File | null {
  for (const file of Array.from(data?.files ?? [])) if (file.type.startsWith('image/')) return file
  return null
}

const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'webm', 'flac']

export const isAudioFile = (file: File) =>
  file.type.startsWith('audio/') || AUDIO_EXTS.includes(file.name.split('.').pop()?.toLowerCase() ?? '')

// An audio file's extension, for saving it (kept as it is: audio isn't re-encoded)
export function audioExt(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (AUDIO_EXTS.includes(fromName)) return fromName
  return ({ 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/flac': 'flac' } as Record<string, string>)[file.type] ?? 'mp3'
}

// The first image or audio file in a paste or drop, if any
export function mediaFileFrom(data: DataTransfer | null | undefined): File | null {
  for (const file of Array.from(data?.files ?? [])) if (file.type.startsWith('image/') || isAudioFile(file)) return file
  return null
}
