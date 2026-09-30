// Files under a library root, addressed by relative paths like "sets/<id>/cards.json".
// The desktop app uses the real folder (Tauri); `next dev` in a normal browser uses localStorage.
export interface Files {
  read(path: string): Promise<string | null>
  // Creates parent folders; replaces the file in one step so a crash can't leave it half-written
  write(path: string, text: string): Promise<void>
  readBytes(path: string): Promise<Uint8Array | null>
  writeBytes(path: string, bytes: Uint8Array): Promise<void>
  remove(path: string): Promise<void>
  removeDir(path: string): Promise<void>
  // Names of the folders / files directly inside `path`
  listDirs(path: string): Promise<string[]>
  listFiles(path: string): Promise<string[]>
}

export function tauriFiles(root: string): Files {
  const fs   = () => import('@tauri-apps/plugin-fs')
  const full = (path: string) => `${root.replace(/[\\/]+$/, '')}/${path}`
  const dir  = (path: string) => path.slice(0, path.lastIndexOf('/'))

  // Writes to a temp file first, then renames it over the real one
  async function replace(path: string, writeTemp: (tmp: string) => Promise<void>) {
    const { mkdir, rename } = await fs()
    if (path.includes('/')) await mkdir(full(dir(path)), { recursive: true })
    const tmp = full(`${path}.tmp`)
    await writeTemp(tmp)
    await rename(tmp, full(path))
  }

  async function list(path: string, want: 'dirs' | 'files') {
    try {
      const entries = await (await fs()).readDir(full(path))
      return entries.filter(e => (want === 'dirs' ? e.isDirectory : e.isFile)).map(e => e.name)
    } catch {
      return []
    }
  }

  return {
    async read(path) {
      try { return await (await fs()).readTextFile(full(path)) } catch { return null }
    },
    async write(path, text) {
      const { writeTextFile } = await fs()
      await replace(path, tmp => writeTextFile(tmp, text))
    },
    async readBytes(path) {
      try { return await (await fs()).readFile(full(path)) } catch { return null }
    },
    async writeBytes(path, bytes) {
      const { writeFile } = await fs()
      await replace(path, tmp => writeFile(tmp, bytes))
    },
    async remove(path) {
      try { await (await fs()).remove(full(path)) } catch {}
    },
    async removeDir(path) {
      try { await (await fs()).remove(full(path), { recursive: true }) } catch {}
    },
    listDirs: path => list(path, 'dirs'),
    listFiles: path => list(path, 'files'),
  }
}

// Development only: the same layout kept in localStorage (binary files as base64), so the desktop UI
// runs in a browser
export function memoryFiles(prefix = 'fc_lib/'): Files {
  const children = (path: string) => {
    const start = `${prefix}${path}/`
    return Object.keys(localStorage).filter(k => k.startsWith(start)).map(k => k.slice(start.length))
  }
  return {
    async read(path) {
      try { return localStorage.getItem(prefix + path) } catch { return null }
    },
    async write(path, text) {
      localStorage.setItem(prefix + path, text)
    },
    async readBytes(path) {
      const b64 = localStorage.getItem(prefix + path)
      if (b64 === null) return null
      const bin = atob(b64)
      return Uint8Array.from(bin, c => c.charCodeAt(0))
    },
    async writeBytes(path, bytes) {
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      localStorage.setItem(prefix + path, btoa(bin))
    },
    async remove(path) {
      localStorage.removeItem(prefix + path)
    },
    async removeDir(path) {
      for (const rel of children(path)) localStorage.removeItem(`${prefix}${path}/${rel}`)
    },
    async listDirs(path) {
      return [...new Set(children(path).filter(r => r.includes('/')).map(r => r.split('/')[0]))]
    },
    async listFiles(path) {
      return children(path).filter(r => !r.includes('/'))
    },
  }
}
