# نادي — the «من الصفر» reference app

A small, real subscription app: browse free → sign in by email → pay → everything unlocks.
Built with the exact prompts in the guide, on the one path it teaches:

**Claude Code → GitHub → Supabase (sign-in + database) → payment gateway → Cloudflare Pages / Vercel**

Live demo: see the guide. This repo is meant to be read and forked by beginners.

## Run it yourself
1. Create a free Supabase project. In **SQL Editor**, paste `supabase/schema.sql` and run it.
2. Copy `.env.example` to `.env.local` and fill the two public values from **Settings → API Keys**.
3. `npm install` then `npm run dev`.

## What's where
- `src/App.jsx` — the five screens (home, library, sign-in, pay, account).
- `src/supabase.js` — the connection (two public values, no secrets).
- `supabase/schema.sql` — tables, row-security rules, the demo "pay" function, sample content.

## Honest notes
- Payment is in **demo mode** (`demo_activate()`): no money moves. Stage 9 of the guide replaces it with a real gateway and a webhook.
- Sign-in uses Supabase's default email, which sends a **link**. Connecting your own sender (stage 7) lets you switch to a 6-digit code.
