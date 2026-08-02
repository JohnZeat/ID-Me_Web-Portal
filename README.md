# ID-Me — Subscriber / Staff Web Portal (POC)

Next.js (TypeScript, App Router, Tailwind) staff portal, per the ID-Me
solution design (23 July 2026). Hosted on Vercel, backed by Supabase
(ap-southeast-2 / Sydney).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`) for auth + Postgres
- Deploy target: Vercel (Pro plan — see project notes on why Hobby doesn't apply)

## Getting started

1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in your Supabase
   project's URL + anon key (Project Settings -> API).
3. `npm run dev` — [http://localhost:3000](http://localhost:3000)

## Structure

```
src/
  app/
    page.tsx           landing page
    login/              staff sign-in (Supabase Auth)
    dashboard/          staff dashboard — code generation slots in here
    admin/               admin area (staff mgmt, API keys, settings, audit log)
  lib/supabase/
    client.ts            browser Supabase client
    server.ts             server Supabase client (Server Components/Actions)
    middleware.ts        session refresh + route protection
  proxy.ts                wires lib/supabase/middleware.ts into Next's request pipeline
```

## Build sequencing (from the solution design)

1. **Core verification loop** — staff login → generate code → customer
   app → verify. *(this scaffold covers staff login; code generation
   needs the Supabase `codes`/`customers` tables — not yet created)*
2. Customer list management: CSV upload, then API sync.
3. Subscriber admin area: staff invites, API keys, company settings.
4. Billing: Stripe tiers, seat sync, self-serve upgrade flow.
5. Hardening: MFA, rate limiting, audit log, push-notification confirmation.

Routes `/dashboard` and `/admin` are already gated by middleware — an
unauthenticated request redirects to `/login`.

## Not yet done

- Supabase project not yet created (see setup walkthrough)
- No database schema (staff, customers, codes, audit log tables)
- No Stripe integration
- `/admin` only checks "is logged in," not an Admin role — role table
  doesn't exist yet
