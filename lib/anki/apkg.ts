// Reads an Anki package (.apkg / .colpkg) into plain data: note types, decks, notes, cards, and media.
// Handles every package format Anki has written:
// - collection.anki2 / collection.anki21: SQLite, note types and decks as JSON in the col table
// - collection.anki21b (Anki 2.1.50+): zstd-compressed SQLite with note types in their own tables
//   (settings as protobuf), a protobuf media list, and zstd-compressed media files
// Newer packages also include a stub collection.anki2 for old versions, so the newest file wins.

export interface AnkiModel {
  id: number
  name: string
  cloze: boolean
  fields: string[]
  templates: { name: string; qfmt: string; afmt: string }[]
  // The note type's stylesheet (used to find elements it hides)
  css: string
}

export interface AnkiNote { id: number; mid: number; fields: string[]; tags: string[] }
export interface AnkiCard { nid: number; did: number; ord: number }

export interface AnkiCollection {
  models: Map<number, AnkiModel>
  decks: Map<number, string>          // id → "Parent::Child"
  notes: Map<number, AnkiNote>
  cards: AnkiCard[]                   // in note order, then template/cloze order
  media: Map<string, () => Promise<Uint8Array>>
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]
const isZstd = (b: Uint8Array) => ZSTD_MAGIC.every((v, i) => b[i] === v)

async function unzstd(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isZstd(bytes)) return bytes
  const { decompress } = await import('fzstd')
  return decompress(bytes)
}

// ── Minimal protobuf reader (field number → values) ──────────────────────────
type ProtoValue = number | Uint8Array
function readProto(buf: Uint8Array): Map<number, ProtoValue[]> {
  const out = new Map<number, ProtoValue[]>()
  let i = 0
  const varint = () => {
    let result = 0, shift = 0, byte: number
    do { byte = buf[i++]; result += (byte & 0x7f) * 2 ** shift; shift += 7 } while (byte & 0x80)
    return result
  }
  while (i < buf.length) {
    const key = varint()
    const field = Math.floor(key / 8), wire = key & 7
    let value: ProtoValue
    if (wire === 0) value = varint()
    else if (wire === 2) { const len = varint(); value = buf.subarray(i, i + len); i += len }
    else if (wire === 1) { i += 8; continue }
    else if (wire === 5) { i += 4; continue }
    else break
    if (!out.has(field)) out.set(field, [])
    out.get(field)!.push(value)
  }
  return out
}
const protoString = (v: ProtoValue | undefined) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : '')

let sqlPromise: Promise<import('sql.js').SqlJsStatic> | null = null
function loadSql() {
  // The wasm file is served from public/, so importing works offline in the desktop app
  sqlPromise ??= import('sql.js').then(m => m.default({ locateFile: () => '/sql-wasm.wasm' }))
  return sqlPromise
}

export async function readApkg(file: Blob): Promise<AnkiCollection> {
  const { unzipSync } = await import('fflate')
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const dbName = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find(n => zip[n])
  if (!dbName) throw new Error('That file is not an Anki deck (.apkg)')

  const SQL = await loadSql()
  const db  = new SQL.Database(await unzstd(zip[dbName]))
  const rows = <T,>(sql: string): T[] => {
    const r = db.exec(sql)[0]
    return r ? r.values.map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])) as T) : []
  }
  const tables = new Set(rows<{ name: string }>("select name from sqlite_master where type = 'table'").map(r => r.name))

  const models = new Map<number, AnkiModel>()
  const decks  = new Map<number, string>()
  if (tables.has('notetypes')) {
    // Schema 18: note types, fields, templates and decks in their own tables
    for (const nt of rows<{ id: number; name: string; config: Uint8Array }>('select id, name, config from notetypes')) {
      const cfg = readProto(nt.config)
      models.set(nt.id, { id: nt.id, name: nt.name, cloze: cfg.get(1)?.[0] === 1, fields: [], templates: [], css: protoString(cfg.get(3)?.[0]) })
    }
    for (const f of rows<{ ntid: number; name: string }>('select ntid, name from fields order by ntid, ord')) models.get(f.ntid)?.fields.push(f.name)
    for (const t of rows<{ ntid: number; name: string; config: Uint8Array }>('select ntid, name, config from templates order by ntid, ord')) {
      const cfg = readProto(t.config)
      models.get(t.ntid)?.templates.push({ name: t.name, qfmt: protoString(cfg.get(1)?.[0]), afmt: protoString(cfg.get(2)?.[0]) })
    }
    for (const d of rows<{ id: number; name: string }>('select id, name from decks')) decks.set(d.id, d.name.replace(/\x1f/g, '::'))
  } else {
    const col = rows<{ models: string; decks: string }>('select models, decks from col')[0]
    for (const m of Object.values(JSON.parse(col.models || '{}')) as { id: number; name: string; type: number; css?: string; flds: { name: string; ord: number }[]; tmpls: { name: string; ord: number; qfmt: string; afmt: string }[] }[]) {
      models.set(Number(m.id), {
        id: Number(m.id), name: m.name, cloze: m.type === 1,
        fields: [...m.flds].sort((a, b) => a.ord - b.ord).map(f => f.name),
        templates: [...m.tmpls].sort((a, b) => a.ord - b.ord).map(t => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt })),
        css: m.css ?? '',
      })
    }
    for (const d of Object.values(JSON.parse(col.decks || '{}')) as { id: number; name: string }[]) decks.set(Number(d.id), d.name)
  }

  const notes = new Map<number, AnkiNote>()
  for (const n of rows<{ id: number; mid: number; flds: string; tags: string }>('select id, mid, flds, tags from notes')) {
    notes.set(n.id, { id: n.id, mid: n.mid, fields: n.flds.split('\x1f'), tags: n.tags.trim().split(/\s+/).filter(Boolean) })
  }
  const cards = rows<AnkiCard>('select nid, did, ord from cards order by nid, ord')
  db.close()

  // Media: zip entries are named 0, 1, 2…; a map gives each one's real file name
  const media = new Map<string, () => Promise<Uint8Array>>()
  const mediaFile = zip['media']
  if (mediaFile) {
    const bytes = await unzstd(mediaFile)
    let names: [string, string][]
    if (bytes[0] === 0x7b /* { */) {
      names = Object.entries(JSON.parse(new TextDecoder().decode(bytes)) as Record<string, string>).map(([k, v]) => [k, v])
    } else {
      names = (readProto(bytes).get(1) ?? []).map((entry, i) => [String(i), protoString(readProto(entry as Uint8Array).get(1)?.[0])])
    }
    for (const [key, name] of names) if (zip[key] && name) media.set(name, () => unzstd(zip[key]))
  }

  return { models, decks, notes, cards, media }
}
