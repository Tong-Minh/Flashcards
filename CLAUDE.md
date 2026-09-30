# Flashcards

Mobile-first flashcard PWA with FSRS spaced repetition. Next.js 15 (App Router) + React 19 + Tailwind 3 + Supabase.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (also the type check; there are no tests or linter)

## Architecture

- **Client-only app.** Every page is `'use client'` and talks to Supabase directly via `lib/supabase/client.ts`. There are no API routes or server components doing data work. Access control is enforced entirely by Postgres RLS.
- **Auth:** `components/AuthGuard.tsx` wraps the app, exposes `useUser()`, and redirects to `/login`. DB triggers fill in `user_id` on insert for `sets`, `card_progress`, `study_sessions`, and `collections`.
- **Offline-first caching:** `lib/storage.ts` caches sets, cards (with progress), and sessions in localStorage. Pages render from the cache first, then refresh from Supabase. FSRS progress updates made offline are queued (`queueProgressUpdate`) and synced on the next study-page load.
- **FSRS:** `ts-fsrs` runs client-side in `app/sets/[id]/study/page.tsx`. Progress is upserted to `card_progress` on `(user_id, card_id)`. `status` is derived from FSRS state (`mastered` = Review with interval ≥ 21 days).
- **Rich content:** Card text is stored as a lightweight markup string (`**bold**`, `*italic*`, `***both***`, `` `code` ``, `[red]…[/red]`, `# headings`, fenced code, `$math$`, `$$math$$`, backslash escapes for literal `\ * $ ` [ ] #`).
  - `lib/markup.ts` is the single source of truth: the inline tokenizer plus markup ⇄ Tiptap JSON conversion.
  - `components/ContentRenderer.tsx` renders markup read-only (Prism + KaTeX).
  - `components/BlockEditor.tsx` is the WYSIWYG editor. It splits text around code fences into text blocks (Tiptap editors, extensions in `components/editor/`) and code cards. Users never see raw markup while editing. `singleLine` mode is used for multiple-choice options.
  - The editor emits changes only on real edits (`setContent(..., { emitUpdate: false })` on load), so opening a card never rewrites its stored text. Keep it that way: MC correctness is a string comparison between `answer` and `options[i]`.
  - A single newline touching a code fence is a separator, not a blank line. The editor stores it as `lead`/`trail` flags on text blocks, and the renderer strips it. Both must keep treating it that way, or gaps appear around code blocks.
- **Card display:** `components/CardPreview.tsx` has `FlipCard` (tap to flip, optional swipe-to-dismiss), used by the Cards-tab preview modal and study View mode. Its `card-enter` animation must only play on mount; re-applying it after a flip causes a double rotation.
- **View mode:** the set page's View button opens `/sets/[id]/study?mode=view`. It browses every card in set order.

## Data model (Supabase, `public` schema)

- `collections` — folders that group sets (`name`, `description`, `tags text[]`, `user_id`)
- `sets` — `name`, `description`, `is_public`, `tags text[]`, `collection_id` (nullable, `on delete set null`)
- `flashcards` — `set_id`, `question`, `answer`, `type` (`open_ended` | `multiple_choice` | `fill_blank`), `options text[]`, `position`
- `card_progress` — per-user FSRS state per card
- `study_sessions` — one row per completed/exited study session (drives stats, history, leaderboard)
- `profiles`, `friend_requests` — social features; `get_friends_leaderboard()` and `fork_set()` RPCs

Schema changes go through Supabase migrations (the Supabase MCP server is configured in `.mcp.json`). Keep `lib/types.ts` in sync.

## Gotchas

- **PostgREST caps every response at 1000 rows.** Never `select` flashcards without paging. Use `fetchAllRows()` from `lib/fetchAll.ts`. For totals, use `count: 'exact', head: true` queries instead of downloading rows; `lib/sets.ts` does this for home-page stats.
- Sets are capped at `MAX_CARDS_PER_SET` (3000, in `lib/fetchAll.ts`). Enforce it anywhere cards are inserted.
- Card order is `position asc nulls last, created_at asc`. Newly created cards have `position = null`.
- "View" mode on the study page must never write `card_progress` or `study_sessions`.
- Cards use CSS transform animations, which trap `position: fixed` descendants. Overlays opened from inside a card (code fullscreen, math popup) must `createPortal` to `document.body` and stop event propagation, because React events still bubble through portals to the card's flip handler.

## Conventions

- Tailwind only, with a `dark:` variant on every color. Palette: indigo primary, gray neutrals, rounded-xl/2xl cards.
- Layout is `max-w-lg mx-auto px-4 py-6` per page. Modals use a `fixed inset-0 bg-black/50` backdrop.
- Imports use the `@/` alias. Column-aligned `useState` declarations are the house style.
