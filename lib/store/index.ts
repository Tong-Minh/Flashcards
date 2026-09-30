import { IS_DESKTOP } from '@/lib/platform'
import { supabaseStore } from './supabaseStore'
import { desktopStore } from './desktop'
import type { Store } from './types'

export type * from './types'
export { PartialInsertError } from './types'

// The data source for the user's own sets: Supabase on the web, a library folder on desktop
export const store: Store = IS_DESKTOP ? desktopStore : supabaseStore
