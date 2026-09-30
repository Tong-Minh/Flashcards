// Which app this build is: the web app (Supabase, accounts) or the desktop app (Tauri, a library
// folder on disk, no accounts). Set at build time, so the unused branch is dropped from the bundle.
export const IS_DESKTOP = process.env.NEXT_PUBLIC_TARGET === 'desktop'

// Running inside the Tauri window (not `next dev` in a normal browser)
export const inTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
