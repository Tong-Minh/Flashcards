// confirm() and alert() that work in the desktop app too. The Mac app's window (WebKit) may not show
// the browser's own dialogs (a missing confirm would read as "Cancel"), so the desktop app uses
// native ones from Tauri's dialog plugin, on Windows as well. Web-only code (sharing, friends) can
// keep calling confirm()/alert() directly.
import { inTauri } from '@/lib/platform'

export async function confirmAction(text: string): Promise<boolean> {
  if (!inTauri()) return window.confirm(text)
  const { ask } = await import('@tauri-apps/plugin-dialog')
  return ask(text, { title: 'Flashcards', kind: 'warning', okLabel: 'OK', cancelLabel: 'Cancel' })
}

export function notify(text: string): void {
  if (!inTauri()) { window.alert(text); return }
  import('@tauri-apps/plugin-dialog')
    .then(({ message }) => message(text, { title: 'Flashcards' }))
    .catch(() => {})
}
