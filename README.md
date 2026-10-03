# vanotes

A calm, centralized work-notes app for one person: notes grouped by project, shown as a timeline, with checklist items that automatically become tasks.

While you work, notes live in this browser (IndexedDB). When you are signed in, they also save to your Supabase account, so another device can pick them up.

## Features
- **Projects → timeline of notes** — rich text (bold, italic, underline, links, lists, checklists) and images (upload, drag-and-drop, paste).
- **Tasks from checklists** — a checklist line in any note appears in that project's Tasks panel and in "all tasks". Ticking it in either place updates the other (one source of truth).
- **Quick capture** — type a thought on the desk and press Enter; it lands in the `dump` folder (or any folder you pick) and can be moved later.
- **Calendar import** — load an `.ics` export (Google, Outlook, Apple), see today's meetings, and start a note from a meeting.
- **Search** across titles and note text; keyboard shortcuts `n` (capture) and `/` (search).
- **Account sync** — projects, notes, images, and imported calendar events follow the signed-in user.

## Sign-in and cloud save (Supabase)
1. Create a project at supabase.com.
2. Project Settings → API: copy the **Project URL** and the **anon / publishable key**.
3. Authentication → Providers → Email is on by default. For a personal tool you can turn **Confirm email** off, so sign-up is instant.
4. Authentication → URL Configuration: set **Site URL** to your dev address (e.g. `http://localhost:5173`) and add `http://localhost:5173/**` under **Redirect URLs**.
5. In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql). That creates the tables, row-level security (each user only sees their rows), and a private `note-images` storage bucket.
6. `cp .env.example .env.local` and paste the two values in. Restart `npm run dev`.

Without the env values the app shows a setup screen instead of the login page. The anon/publishable key is meant to be public; never put a `service_role` or secret key in this project.

If the SQL has not been run, you can still sign in, but the sidebar will say it couldn’t sync until the schema exists.

## Run it
```
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

## Data model
Local (IndexedDB via Dexie, see `src/lib/db.ts`) and cloud (Supabase, see `supabase/schema.sql`) share the same ideas:
- `projects` — name, color (plus a fixed `dump` project)
- `notes` — projectId, title, `content` (Tiptap JSON, the source of truth), `bodyText` (for search)
- `images` — noteId, blob locally / Storage file in the cloud
- `tasks` — derived from checklist items in `notes.content` on this device; not stored separately in Supabase
- `events` — imported calendar events

Each account has its own local database (`vanotes-<user-id>`). Clearing site data removes the copy on that browser; the cloud copy remains.

## Stack
React, TypeScript, Vite, Tailwind CSS, Tiptap, Dexie, ical.js, Supabase.
