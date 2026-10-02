import Logo from '../components/Logo'

/** Shown instead of the login page until the two Supabase values exist in .env.local. */
export default function SetupScreen() {
  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <div className="page-enter w-full max-w-xl rounded-[26px] border border-line bg-card p-8 shadow-[0_24px_40px_-30px_rgba(43,38,34,0.6)]">
        <Logo size={48} />
        <h1 className="mt-6 font-display text-3xl">connect supabase to sign in.</h1>
        <p className="mt-2 font-mono text-sm leading-relaxed text-muted">
          the app needs your project’s URL and public key. nothing is wrong with your notes — they’re safe in this browser.
        </p>
        <ol className="mt-6 list-decimal space-y-2 pl-5 font-mono text-sm leading-relaxed">
          <li>in Supabase: Project Settings → API. copy the <b>Project URL</b> and the <b>anon / publishable key</b>.</li>
          <li>
            in the project folder, copy <code className="rounded bg-pill px-1.5">.env.example</code> to{' '}
            <code className="rounded bg-pill px-1.5">.env.local</code> and paste both values in.
          </li>
          <li>stop and restart <code className="rounded bg-pill px-1.5">npm run dev</code> (env files are read at startup).</li>
        </ol>
        <pre className="mt-6 overflow-x-auto rounded-2xl bg-pill/70 p-4 font-mono text-xs leading-relaxed">{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ… or sb_publishable_…`}</pre>
      </div>
    </div>
  )
}
