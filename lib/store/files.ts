// Text files under a library root, addressed by relative paths like "sets/<id>/cards.json".
// The desktop app uses the real folder (Tauri); `next dev` in a normal browser uses localStorage.
export interface Files {
  read(path: string): Promise<string | null>
  // Creates parent folders; replaces the file in one step so a crash can't leave it half-written
  write(path: string, text: string): Promise<void>
  removeDir(path: string): Promise<void>
  // Names of the folders directly inside `path`
  listDirs(path: string): Promise<string[]>
}

export function tauriFiles(root: string): Files {
  const fs   = () => import('@tauri-apps/plugin-fs')
  const full = (path: string) => `${root.replace(/[\\/]+$/, '')}/${path}`
  const dir  = (path: string) => path.slice(0, path.lastIndexOf('/'))
  return {
    async read(path) {
      try { return await (await fs()).readTextFile(full(path)) } catch { return null }
    },
    async write(path, text) {
      const { mkdir, writeTextFile, rename } = await fs()
      if (path.includes('/')) await mkdir(full(dir(path)), { recursive: true })
      const tmp = full(`${path}.tmp`)
      await writeTextFile(tmp, text)
      await rename(tmp, full(path))
    },
    async removeDir(path) {
      try { await (await fs()).remove(full(path), { recursive: true }) } catch {}
    },
    async listDirs(path) {
      try {
        const entries = await (await fs()).readDir(full(path))
        return entries.filter(e => e.isDirectory).map(e => e.name)
      } catch {
        return []
      }
    },
  }
}

// Development only: the same layout kept in localStorage, so the desktop UI runs in a browser
export function memoryFiles(prefix = 'fc_lib/'): Files {
  return {
    async read(path) {
      try { return localStorage.getItem(prefix + path) } catch { return null }
    },
    async write(path, text) {
      localStorage.setItem(prefix + path, text)
    },
    async removeDir(path) {
      const start = `${prefix}${path}/`
      for (const key of Object.keys(localStorage)) if (key.startsWith(start)) localStorage.removeItem(key)
    },
    async listDirs(path) {
      const start = `${prefix}${path}/`
      const names = new Set<string>()
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(start)) names.add(key.slice(start.length).split('/')[0])
      }
      return [...names]
    },
  }
}
