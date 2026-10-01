import { IS_DESKTOP } from './platform'

// Links to set and collection pages. The desktop app is a static export, which can't have a page
// per id, so there each route is built once for a placeholder id ("_") and the real ids travel in
// the query string (read back by useRouteIds). The web app keeps its normal URLs.
const desktop = (path: string, id: string, extra = '') => `${path}/?id=${id}${extra}`

export const paths = {
  set:        (id: string) => IS_DESKTOP ? desktop('/sets/_', id) : `/sets/${id}`,
  study:      (id: string, view = false) => IS_DESKTOP
    ? desktop('/sets/_/study', id, view ? '&mode=view' : '')
    : `/sets/${id}/study${view ? '?mode=view' : ''}`,
  createCard: (id: string) => IS_DESKTOP ? desktop('/sets/_/create', id) : `/sets/${id}/create`,
  importCards:(id: string) => IS_DESKTOP ? desktop('/sets/_/import', id) : `/sets/${id}/import`,
  editCard:   (id: string, cardId: string) => IS_DESKTOP
    ? desktop('/sets/_/edit/_', id, `&card=${cardId}`)
    : `/sets/${id}/edit/${cardId}`,
  collection: (id: string) => IS_DESKTOP ? desktop('/collections/_', id) : `/collections/${id}`,
  // One static page in both builds; the scope is in the query string
  stats:      (scope?: { set?: string; collection?: string }) =>
    scope?.set ? `/stats?set=${scope.set}` : scope?.collection ? `/stats?collection=${scope.collection}` : '/stats',
}
