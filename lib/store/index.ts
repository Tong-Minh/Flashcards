import { supabaseStore } from './supabaseStore'
import type { Store } from './types'

export type * from './types'
export { PartialInsertError } from './types'

// The data source for the user's own sets: Supabase on the web
export const store: Store = supabaseStore
