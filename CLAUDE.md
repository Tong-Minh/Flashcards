# Flashcards

Mobile-first flashcard PWA with FSRS spaced repetition. Next.js 15 (App Router) + React 19 + Tailwind 3 + Supabase.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build (also the type check; there are no tests or linter)

## Architecture

- **Client-only app.** Every page is `'use client'` and talks to Supabase directly via `lib/supabase/client.ts`. There are no API routes or server components doing data work, except link previews: `app/sets/[id]/layout.tsx` and `app/collections/[id]/layout.tsx` render Open Graph metadata and `opengraph-image.tsx` renders the preview image, via the `share_preview` RPC (callable logged out, public items only). Code for them is in `lib/sharePreview.ts` and `lib/shareImage.tsx`. Next.js blocks `react-dom/server` there, so the image builds icon SVGs from the vanilla `lucide` package. Access control is enforced entirely by Postgres RLS.
- **Auth:** `components/AuthGuard.tsx` wraps the app, exposes `useUser()`, and redirects to `/login`. DB triggers fill in `user_id` on insert for `sets`, `card_progress`, `study_sessions`, and `collections`.
- **Offline-first caching:** `lib/storage.ts` caches sets, cards (with progress), and sessions in localStorage. Pages render from the cache first, then refresh from Supabase. FSRS progress updates made offline are queued (`queueProgressUpdate`) and synced on the next study-page load.
- **FSRS:** `ts-fsrs` runs client-side in `app/sets/[id]/study/page.tsx`. Progress is upserted to `card_progress` on `(user_id, card_id)`. `status` is derived from FSRS state (`mastered` = Review with interval ≥ 21 days).
- **Rich content:** Card text is stored as a lightweight markup string (`**bold**`, `*italic*`, `***both***`, `` `code` ``, `[red]…[/red]`, `# headings`, `- ` / `1. ` list lines (one level), fenced code, `$math$`, a line that is only `$$math$$` = centered math block, backslash escapes for literal `\ * $ ` [ ] # - .`).
  - `lib/markup.ts` is the single source of truth: the inline tokenizer plus markup ⇄ Tiptap JSON conversion. Its line helpers (`matchListLine`, `isMathBlockLine`) are shared with the renderer. The serializer escapes paragraphs that would otherwise re-parse as a heading or list item.
  - `components/ContentRenderer.tsx` renders markup read-only (Prism + KaTeX).
  - `components/BlockEditor.tsx` is the WYSIWYG editor. It splits text around code fences into text blocks (Tiptap editors, extensions in `components/editor/`) and code cards. Users never see raw markup while editing. `singleLine` mode is used for multiple-choice options.
  - The editor emits changes only on real edits (`setContent(..., { emitUpdate: false })` on load), so opening a card never rewrites its stored text. Keep it that way: MC correctness is a string comparison between `answer` and `options[i]`.
  - Every code block in the editor is followed by a text block (possibly empty), so there's always somewhere to click below it. Backspace at the start of that text highlights the code block, and a second Backspace deletes it.
  - The AI prompt (`app/sets/[id]/import/page.tsx`) and `/import-format` document the markup. Update them when the format changes. The tab-format importer converts `\n` into newlines everywhere except inside `$…$` math.
  - A single newline touching a code fence is a separator, not a blank line. The editor stores it as `lead`/`trail` flags on text blocks, and the renderer strips it. Both must keep treating it that way, or gaps appear around code blocks.
- **Icons:** `lib/icons.ts` holds the curated lucide icon map (keys are stored in `sets.icon`/`collections.icon`, so never rename one), the color map, and `suggestIcon(name)`. `ItemIcon` renders the tile; `IconPicker` is the picker sheet. A null icon/color falls back to the set or collection default.
- **Import/export:** `lib/cardFormat.ts` holds both `parseCards` (import page) and `exportCards` (Export button on the set page), so the tab format round-trips. `[type]` and `[match]` prefixes mark typed and matching cards; an answer of exactly True/False makes a true/false card.
- **Card types:** `components/CardForm.tsx` is the shared create/edit form. In study, `components/StudyInteractions.tsx` has the typed input, true/false buttons, and matching board. `lib/answerCheck.ts` grades typed answers (ignores markup, case, accents, spacing, a leading article, and small typos; numbers must match exactly). Auto-checks are only shown to the user, never stored: FSRS and accuracy come solely from the rating button tapped.
- **Card display:** `components/CardPreview.tsx` has `FlipCard` (tap to flip, optional swipe-to-dismiss), used by the Cards-tab preview modal and study View mode. Its `card-enter` animation must only play on mount; re-applying it after a flip causes a double rotation. On flip, both `FlipCard` and the study card pin `minHeight` to the height before flipping, so a shorter back never shrinks the card (a longer one still grows it).
- **Sharing:** `ShareButton` (set and collection headers) makes a private item public after confirming, then opens the native share sheet or copies the link. `AuthGuard` stores the requested path in sessionStorage before redirecting to `/login`, and returns there after sign-in.
- **Organizing sets:** `components/SetOrganizer.tsx` (home and collection pages). Long-press or Select enters selection mode (bulk Move / Public-Private / Delete, Undo toast). Drag uses dnd-kit: mouse drags from anywhere on a card, touch only from the handle shown in selection mode, so a finger on a card still scrolls. Dropping on a collection card moves the set. Reordering writes `sets.position` via `reorder_sets`; `sortSets()` in `lib/sets.ts` mirrors the DB order.
- **Set page Cards tab:** search matches question/answer/options/pairs text, and `#12` (or a bare `12`) finds card number 12. Owners can long-press a card or tap Select to move cards to another set (progress comes along, `position` reset to null), reset their progress, or delete them. Import and Export share one dropdown.
- **Copying:** equations render with `data-latex` + `select-all`, and `components/CopyAsSource.tsx` (mounted in the root layout) rewrites a copied selection so equations become `$…$`. Editor math nodes copy as LaTeX via `renderText`. In the editor, only a code card's grip is draggable, so the code can be selected.
- **Home tabs:** My Sets (client-side search over cached sets plus an All / Collections / Sets filter; no tag chips, `#tag` in the search box matches tags by prefix, same in Discover), Discover (`components/DiscoverTab.tsx`, calls the `discover_sets` RPC), Friends.
- **View mode:** the set page's View button opens `/sets/[id]/study?mode=view`. It browses every card in set order.

## Data model (Supabase, `public` schema)

- `collections` — folders that group sets (`name`, `description`, `tags text[]`, `icon`, `color`, `is_public`, `user_id`). A public collection shows only its public sets to others. RLS returns other people's public collections too, so filter by `user_id` when listing your own.
- `sets` — `name`, `description`, `is_public`, `tags text[]`, `icon`, `color`, `position` (manual home-screen order; set in bulk by the `reorder_sets(ids)` RPC), `collection_id` (nullable, `on delete set null`)
- `flashcards` — `set_id`, `question`, `answer`, `type` (`open_ended` | `multiple_choice` | `fill_blank` | `typed` | `true_false` | `matching`), `options text[]` (MC choices; extra accepted answers for `typed`), `pairs jsonb` (`[{left, right}]`, matching only), `position`. Type labels and badges live in `lib/cardTypes.ts`.
- `card_progress` — per-user FSRS state per card
- `study_sessions` — one row per completed/exited study session (drives stats, history, leaderboard)
- `profiles`, `friend_requests` — social features; `get_friends_leaderboard()` and `fork_set()` RPCs. `fork_set` copies icon, color, tags, and `pairs`, so update it when adding set or card columns.
- `discover_sets(q, lim, off)` RPC — other users' public sets matching a name/description/tag search, with owner name and card count.

Schema changes go through Supabase migrations (the Supabase MCP server is configured in `.mcp.json`). Keep `lib/types.ts` in sync.

## Gotchas

- **PostgREST caps every response at 1000 rows.** Never `select` flashcards without paging. Use `fetchAllRows()` from `lib/fetchAll.ts`. For totals, use `count: 'exact', head: true` queries instead of downloading rows; `lib/sets.ts` does this for home-page stats.
- Sets are capped at `MAX_CARDS_PER_SET` (3000, in `lib/fetchAll.ts`). Enforce it anywhere cards are inserted.
- Card order is `position asc nulls last, created_at asc`. Newly created cards have `position = null`.
- "View" mode on the study page must never write `card_progress` or `study_sessions`.
- Unbreakable content widens the page on phones. Inline math is capped at `max-w-full` and scrolls inside the line; `body` has `overflow-wrap: break-word` for long words and `overflow-x-clip` as a last-resort guard (clip, not hidden, so `position: sticky` still works). Grid columns holding card content need `minmax(0,1fr)`, and flex items need `min-w-0`.
- Cards use CSS transform animations, which trap `position: fixed` descendants. Overlays opened from inside a card (code fullscreen, math popup) must `createPortal` to `document.body` and stop event propagation, because React events still bubble through portals to the card's flip handler.

## Conventions

- Tailwind only (its `content` includes `lib/` because `lib/icons.ts` defines color classes), with a `dark:` variant on every color. Palette: indigo primary, gray neutrals, rounded-xl/2xl cards.
- Layout is `max-w-lg mx-auto px-4 py-6` per page. Modals use a `fixed inset-0 bg-black/50` backdrop.
- Imports use the `@/` alias. Column-aligned `useState` declarations are the house style.
