# Flashcards

A flashcard app with spaced repetition (FSRS), rich cards (formatting, code, math), and several
question types: open-ended, multiple choice, fill in the blank, type the answer, true/false, and
matching.

It comes in two versions built from the same code:

- **Web app:** sign in with Google and your sets sync across devices. It also has friends, a
  Discover page of public sets, and share links. It installs as an app on phones (Add to Home Screen).
- **Desktop app (Windows):** no account. Your cards are files in a folder on your PC, it works
  offline, and there's no practical limit on set size. Cards can include images (paste, drag, or /image).
  It updates itself from GitHub Releases.

Both can **import Anki decks** (`.apkg` or a text export) from the **+ New** menu: decks become sets,
clozes become fill-in-the-blank cards, and math, code, and formatting carry over. Every card starts as new, and
images come along in the desktop app.

## Getting the desktop app

Download `Flashcards_x.y.z_x64-setup.exe` from the
[latest release](https://github.com/Tong-Minh/Flashcards/releases/latest) and run it. Windows may
say "Windows protected your PC": choose **More info → Run anyway** (the installer isn't code-signed).

On first launch, choose a folder for your library. Putting it inside OneDrive or Dropbox gets you
automatic backups. To bring your sets over from the web app, use the download button at the bottom
of the web app's sidebar, then the import button in the desktop app's sidebar.

## Library folder layout

```
library.json              collections
sets/<id>/set.json        the set
sets/<id>/cards.json      its cards
sets/<id>/progress.json   study progress per card
sets/<id>/sessions.json   completed study sessions
```

The files are plain JSON, so you can read them, back them up, or edit them by hand.

## Development

Requirements: Node 20+. The web app also needs a Supabase project (`.env.local` with
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).

| Command | What it does |
|---|---|
| `npm run dev` | Web app at http://localhost:3000 |
| `npm run build` | Web production build (also the type check) |
| `npm run dev:desktop` | Desktop version in the browser, with a browser-storage library (no login) |
| `npm run build:desktop` | Desktop static export to `out/` |
| `npm run desktop:dev` / `desktop:build` | The real desktop app (needs [Rust](https://rustup.rs) and the MSVC build tools) |

Without Rust installed, GitHub Actions builds the desktop app: pushing a branch other than `main`
runs a test build (the installer is attached to the run), and pushing a `v*` tag publishes a release.

### Releasing a desktop update

```
npm version patch        # bumps package.json and creates the tag
git push --follow-tags
```

Also bump `version` in `src-tauri/Cargo.toml` to match. The release workflow signs the update with
the `TAURI_SIGNING_PRIVATE_KEY` repository secret. Keep a backup of that key: installed apps only
accept updates signed with it.

See [CLAUDE.md](CLAUDE.md) for the architecture.
