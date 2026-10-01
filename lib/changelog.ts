// The version history shown at /changelog (both apps). Add an entry with every release: the
// version is package.json's (bumped by `npm version`), newest first. Write for people using the
// app, not for developers.

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? ''

export interface Release {
  version: string
  date: string        // YYYY-MM-DD
  title: string
  changes: string[]
}

export const CHANGELOG: Release[] = [
  {
    version: '0.1.9',
    date: '2026-10-01',
    title: 'Import progress, more shortcuts',
    changes: [
      'Importing from Anki shows a progress bar with the percentage and how many cards are done, so a big deck no longer looks frozen.',
      'More ` shortcuts: press ` on the home page (new set, new collection, Anki import, search, stats, settings, storage, export and import) and on a collection (new set, add existing, search, stats, settings). On a set, ` then 9 searches its cards.',
      'Cloud version: delete your account from the ⋯ menu.',
    ],
  },
  {
    version: '0.1.8',
    date: '2026-10-01',
    title: 'Cleaner equations and answers',
    changes: [
      'Equations no longer show scrollbars. One too wide for the screen still scrolls with a swipe or trackpad.',
      'The answer side of a card is no longer shown all in bold while studying or viewing, so bold text in it stands out.',
      'Cloud version: an invite password typed on the front page only counts for the next sign-in.',
    ],
  },
  {
    version: '0.1.7',
    date: '2026-10-01',
    title: 'Tidier menus, source links, storage',
    changes: [
      'Sets and collections can have a source link (where you got them). It shows as a link icon by the title and while studying.',
      'Fewer buttons: settings, export and import, the library folder, storage, the theme and sign out are in one ⋯ menu. The sidebar’s button is now “+ New” (set, collection, or Import from Anki).',
      '“My Sets” is now Library, with Collections and My Sets labeled.',
      'Search inside a collection. Searching a set highlights the matches on each card.',
      'Each card has a ⋯ menu to edit or delete it.',
      'Someone else’s set: a copy button next to Share saves your own copy.',
      'Storage: see how much space each collection and set takes (and, in the desktop app, the app itself).',
      'Desktop: uninstall from the ⋯ menu, keeping or deleting your flashcards.',
      'A new front page explains the app, with downloads for Windows and Mac and how to bring your decks in.',
      'The cloud version is invite-only: new accounts enter the invite password once to join.',
    ],
  },
  {
    version: '0.1.6',
    date: '2026-10-01',
    title: 'Reversed cards, audio, image occlusion, and moving your library anywhere',
    changes: [
      'New option when making a card: “Also study it back to front”. You then also see the answer and recall the question, scheduled on its own; the two directions never come up on the same day. Reversed cards show “⇄ Both ways” in the card list.',
      'Desktop: image occlusion cards. Pick an image, drag boxes over the labels, and number them; each number is a card. Choose “hide all, guess one” or “hide one, guess one”.',
      'Desktop: cards can play sound clips. Drag an mp3, m4a, wav… into a card, or type /audio. Clips play when a card appears and the answer’s when you reveal it (turn this off in Study settings); press R to replay.',
      'Export and Import (bottom of the sidebar) now work in every direction: web ⇄ desktop, and between Windows and Mac. Pick all or some sets; the zip carries cards, progress, review history, stats and settings (and images and audio from the desktop app). Importing only adds what’s missing and keeps your newer progress, so importing again is safe.',
      'Anki imports bring in audio, image occlusion notes, and “Basic (and reversed card)” notes as one card studied both ways. Text imports: start a line with [reverse].',
      'The web app shows placeholders for images and audio, and leaves out of study the cards that need the desktop app (marked “Desktop only”).',
      'Stats counts each direction or box group as a card.',
      'Fixed: two people studying the same public set could not both save progress on its cards.',
    ],
  },
  {
    version: '0.1.5',
    date: '2026-10-01',
    title: 'Target retention and FSRS optimization',
    changes: [
      'Study settings (in the sidebar, and on the Stats page on phones): choose your target retention, how likely you should be to remember a card when it comes back. The default is 90%.',
      'Each set can have its own target retention in its settings, for example 95% before an exam.',
      'Optimize FSRS: fit the scheduler to your own review history with Anki’s optimizer, running on your device. You see how well the current and new parameters predict your past reviews before choosing.',
      'Stats suggests optimizing once you have enough new reviews.',
      'Choose when a new study day starts (4 AM by default).',
      'Mac: keyboard shortcuts keep working while you study (before, they stopped after one key until you clicked back in).',
      'Answers are no longer shown all in bold, so bold text in them stands out again.',
    ],
  },
  {
    version: '0.1.4',
    date: '2026-10-01',
    title: 'Undo, bury, suspend, and stats',
    changes: [
      'Space flips a card back and forth once you’ve seen the answer (also in View mode and card previews). You can rate from either side.',
      'Undo (Z or ⌘Z/Ctrl+Z), Bury (-) and Suspend (@) at the top of the study screen. Undo steps back through your last ratings.',
      'Buried cards come back the next day; suspended cards stay out of study until you unsuspend them from the set’s card list (Select, then Unsuspend).',
      'Every rating is now logged. The new Stats page shows today’s reviews, a forecast, a study calendar with streaks, reviews per day, true retention, answer buttons, and interval, stability, difficulty and retrievability charts, for all sets, a collection, or one set.',
      'A new study day starts at 4 AM, so late-night sessions count toward the same day.',
      'This version history.',
      'Desktop: Import library and Change library folder open pages that explain what they do.',
    ],
  },
  {
    version: '0.1.3',
    date: '2026-10-01',
    title: 'Mac app, and better imports',
    changes: [
      'The desktop app is now available for Mac (Apple Silicon and Intel).',
      'Anki math that showed as red code now renders: aligned equations, ∯ and other MathJax-only commands.',
      'Anki decks whose answers are built by a script (like Languages on Fire) now import with their translations and notes; front-only “info” notes import too.',
      'AI-written cards with code in their own column import correctly instead of losing the answer.',
      'Flipping back to a shorter question shrinks the card again.',
      'Desktop: you can drag files (images, Anki decks) into the app from outside.',
    ],
  },
  {
    version: '0.1.2',
    date: '2026-09-30',
    title: 'Images and Anki import',
    changes: [
      'Desktop: images in cards. Paste, drag in, or type /image. They’re compressed and kept in your library folder.',
      'Import Anki decks (.apkg or a text export) from the + New menu. Decks become sets, and math, code and formatting carry over.',
      'The desktop app checks for updates hourly and when you come back to it.',
    ],
  },
  {
    version: '0.1.1',
    date: '2026-09-30',
    title: 'Saving fix',
    changes: [
      'Desktop: creating sets and cards no longer shows an error. The app asks for your library folder once more to get access to its subfolders.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-09-30',
    title: 'Desktop app',
    changes: [
      'A Windows app that keeps your sets in a folder on your computer: no account, works offline, no set size limit.',
      'Bring your sets over with the web app’s Download button and the desktop app’s Import.',
      'Updates install from inside the app.',
    ],
  },
  {
    version: 'Earlier',
    date: '2026-09-29',
    title: 'The web app',
    changes: [
      'Spaced repetition with FSRS, and View mode for flipping through a set.',
      'Rich cards: bold, colors, headings, lists, code blocks with highlighting, and math.',
      'Card types: open-ended, fill in the blank, multiple choice, type the answer, true/false, and matching.',
      'Collections, icons, tags, drag to reorder, and bulk actions.',
      'Sharing links, Discover, and Friends.',
      'A desktop layout with a sidebar, keyboard shortcuts, and ` quick actions on set pages.',
    ],
  },
]
