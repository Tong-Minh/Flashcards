'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { IS_DESKTOP } from './platform'

// The set/collection id (and card id on the edit page) of the current route. See lib/paths.ts:
// on desktop they're in the query string, on the web they're path segments.
export function useRouteIds(): { id: string; cardId: string } {
  // IS_DESKTOP is a build-time constant, so each build always calls the same hook
  if (IS_DESKTOP) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const query = useSearchParams()
    return { id: query.get('id') ?? '', cardId: query.get('card') ?? '' }
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const params = useParams<{ id: string; cardId?: string }>()
  return { id: params.id, cardId: params.cardId ?? '' }
}
