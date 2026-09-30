export const MAX_CARDS_PER_SET = 3000

// PostgREST caps each response at 1000 rows, so large result sets must be paged.
const PAGE = 1000

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>

// `build` must return a fresh, ordered query each call so .range() can be applied.
export async function fetchAllRows<T>(
  build: () => { range: (from: number, to: number) => PageResult<T> },
  max = Infinity,
): Promise<T[]> {
  const rows: T[] = []
  // Advance by rows actually received and stop only on an empty page, so this still works
  // if the project's max-rows setting is lower than PAGE.
  while (rows.length < max) {
    const from = rows.length
    const { data, error } = await build().range(from, Math.min(from + PAGE, max) - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
  }
  return rows
}
