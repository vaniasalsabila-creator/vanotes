# vanotes

A calm, centralized work-notes app for one person: notes grouped by project, shown as a timeline, with checklist items that automatically become tasks.

**Your Supabase account is the source of truth.** Everything you write — projects, notes, images, calendar events — is stored in Supabase under your account, so every browser, window and device you sign in on shows the same notes. A browser only keeps a temporary view of them while the window is open; it is deleted when you sign out.

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
5. In **SQL Editor**, paste and run [`supabase/schema.sql`](supabase/schema.sql). That creates the tables, row-level security (each user only sees their rows), a private `note-images` storage bucket, and turns on Realtime. It's safe to run again — run it again whenever this file changes.
6. `cp .env.example .env.local` and paste the two values in. Restart `npm run dev`.

Without the env values the app shows a setup screen instead of the login page. The anon/publishable key is meant to be public; never put a `service_role` or secret key in this project.

If the SQL has not been run, after signing in you'll see a screen saying the database isn't set up yet.

## Run it
```
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/
```

## How syncing works
- **Signing in** downloads your account's data. Nothing from the browser is trusted or shown before that; if it can't be loaded you get an error screen, not a stale copy.
- **Edits** appear instantly and are written straight to Supabase (in order, retried automatically if the network drops). The sidebar shows *saved to your account*, *saving…*, or *offline · N changes waiting*. If you close the window with unsent changes, the browser asks first.
- **Other windows and devices** are followed live through Supabase Realtime. As a safety net each window also compares itself with the server when you come back to it, when the network returns, and every ~30 seconds, and fixes any difference — the server always wins.
- **Deleting** is a soft delete (a `deleted_at` stamp), so every window learns about it. Deleted notes are never brought back by a stale window.
- **Accounts are separate.** Each row belongs to your user id and Supabase row-level security stops any other account from reading or changing it. Signing out deletes this window's view; signing in as someone else shows only their notes.
- **Last write wins** if two windows edit the same note at the same moment. An editor you have open updates live when the note is changed elsewhere (unless you have unsaved typing).
- **Notes saved only in a browser** by earlier versions are rescued: unsent changes are uploaded automatically, and notes from before accounts existed are added only if you say so.

## Data model
Stored in Supabase (see `supabase/schema.sql`), one set per account:
- `projects` — name, color, icon (plus a fixed `dump` project)
- `notes` — project, title, `content` (Tiptap JSON), `body_text` (for search)
- `note_images` + the private `note-images` storage bucket — images, in a folder per user
- `events` — imported calendar events

Tasks are not stored separately: they're derived from the checklist items in each note (each item carries its own id and timestamps), so they come out identical everywhere. In the browser, `src/lib/db.ts` holds the temporary per-window view and `src/lib/sync.ts` the sync engine.

## Stack
React, TypeScript, Vite, Tailwind CSS, Tiptap, Dexie, ical.js, Supabase.
