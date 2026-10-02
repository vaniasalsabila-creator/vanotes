# vanotes

A calm, centralized work-notes app for one person: notes grouped by project, shown as a timeline, with checklist items that automatically become tasks.

Everything is stored locally in your browser (IndexedDB) — no account, no server.

## Features
- **Projects → timeline of notes** — rich text (bold, italic, underline, links, lists, checklists) and images (upload, drag-and-drop, paste).
- **Tasks from checklists** — a checklist line in any note appears in that project's Tasks panel and in "all tasks". Ticking it in either place updates the other (one source of truth).
- **Quick capture** — type a thought on the desk and press Enter; it lands in the `dump` folder (or any folder you pick) and can be moved later.
- **Calendar import** — load an `.ics` export (Google, Outlook, Apple), see today's meetings, and start a note from a meeting.
- **Search** across titles and note text; keyboard shortcuts `n` (capture) and `/` (search).

## Run it
```
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

## Data model (IndexedDB via Dexie, see `src/lib/db.ts`)
- `projects` — name, color (plus a fixed `dump` project)
- `notes` — projectId, title, `content` (Tiptap JSON, the source of truth), `bodyText` (for search)
- `images` — noteId, blob, order
- `tasks` — derived from checklist items in `notes.content`; each item carries a stable `taskId`
- `events` — imported calendar events

Data lives in the browser you use. Clearing site data deletes it, and there is no export yet.

## Stack
React, TypeScript, Vite, Tailwind CSS, Tiptap, Dexie, ical.js.
