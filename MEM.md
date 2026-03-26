# Project Memory — Humor Project (Semester Project)
> Use this file to carry context into a new repo (e.g. an admin panel).

---

## Stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Styling**: Tailwind CSS (dark theme: black bg, pink-500 accent)
- **Database + Auth**: Supabase (shared professor project)
- **Hosting**: Vercel → Cloudflare DNS → custom domain
- **Custom domain**: `https://humorproject.arinjaff.com`

---

## Supabase Credentials

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://secure.almostcrackd.ai` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpaHNnbmZqcW1ram1vb3d5ZmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk1Mjc0MDAsImV4cCI6MjA2NTEwMzQwMH0.c9UQS_o2bRygKOEdnuRx7x7PeSf_OUGDtf9l3fMqMSQ` |
| Raw Supabase project ID | `qihsgnfjqmkjmoowyfbn` |
| Raw project URL (REST API fallback) | `https://qihsgnfjqmkjmoowyfbn.supabase.co` |

> IMPORTANT: Use `https://secure.almostcrackd.ai` as the Supabase URL (not the raw project URL).
> This is required so that Google OAuth uses the correct `redirect_uri` registered with the Google OAuth client.

---

## Google OAuth

- **Google OAuth Client ID**: `388960353527-fh4grc6mla425lg0e3g1hh67omtrdihd.apps.googleusercontent.com`
- **No client secret needed** (uses Supabase's built-in OAuth flow)
- **How it works**:
  1. App calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "${window.location.origin}/auth/callback" } })`
  2. Supabase sends user to Google with `redirect_uri=https://secure.almostcrackd.ai/auth/v1/callback`
  3. Google authenticates and returns to Supabase
  4. Supabase redirects to `https://humorproject.arinjaff.com/auth/callback?code=...`
  5. App's `/auth/callback` route calls `exchangeCodeForSession(code)`
- **Supabase redirect URL whitelist**: Professor must add `https://humorproject.arinjaff.com/auth/callback` to Authentication → URL Configuration → Redirect URLs in the Supabase dashboard.

---

## Database Schema (Supabase)

### `images`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `url` | text | CDN URL of image |
| `image_description` | text | nullable |
| `is_public` | boolean | filter by this for public images |
| `created_datetime_utc` | timestamptz | |
| `modified_datetime_utc` | timestamptz | |

### `captions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `content` | text | caption text |
| `image_id` | uuid | FK → images.id |
| `created_datetime_utc` | timestamptz | |
| `modified_datetime_utc` | timestamptz | |

Nested select pattern (images → captions):
```typescript
supabase.from("images").select(`id, url, image_description, captions (id, content)`)
```

### `caption_votes`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `caption_id` | uuid | FK → captions.id |
| `profile_id` | uuid | FK → auth user ID (user.id) |
| `vote_value` | integer | 1 = upvote, -1 = downvote |
| `created_datetime_utc` | timestamptz | NO default — must be provided on insert |
| `modified_datetime_utc` | timestamptz | NO default — must be provided on insert |

Insert pattern (both timestamps required):
```typescript
const now = new Date().toISOString();
await supabase.from("caption_votes").insert({
  caption_id,
  profile_id: user.id,
  vote_value,
  created_datetime_utc: now,
  modified_datetime_utc: now,
});
```

---

## Crackd Pipeline API

**Base URL**: `https://api.almostcrackd.ai`

**Auth**: Bearer token from Supabase session
```typescript
const { data: sessionData } = await supabase.auth.getSession();
const token = sessionData.session?.access_token;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
```

**4-Step Upload Pipeline**:

```
POST /pipeline/generate-presigned-url
  body: { contentType: "image/jpeg" }
  returns: { presignedUrl, cdnUrl }

PUT <presignedUrl>
  headers: { "Content-Type": file.type }
  body: <raw file bytes>

POST /pipeline/upload-image-from-url
  body: { imageUrl: cdnUrl, isCommonUse: false }
  returns: { imageId }

POST /pipeline/generate-captions
  body: { imageId }
  returns: [{ id, content }] or { captions: [...] }
```

---

## Supabase Client Setup

Install: `@supabase/ssr`

**Browser client** (client components):
```typescript
import { createBrowserClient } from '@supabase/ssr'
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Server client** (server components / route handlers):
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
// pass cookieStore.getAll() and cookieStore.set() in the cookies config
```

**Auth callback route** (`/auth/callback/route.ts`):
```typescript
const code = searchParams.get('code')
const { error } = await supabase.auth.exchangeCodeForSession(code)
if (!error) return NextResponse.redirect(`${origin}/`)
return NextResponse.redirect(`${origin}/protected?error=auth_failed`)
```

**Middleware**: Only refreshes session (no route blocking). Calls `supabase.auth.getUser()` to keep cookies fresh.

---

## Pages Built (this repo)

| Route | Assignment | Description |
|---|---|---|
| `/` | 1 | Hello World / jokes |
| `/images` | 2 | 3D Gallery |
| `/swipe` | 2 | Swipe to vote on memes |
| `/review` | 2 | See your votes |
| `/protected` | 3 | Google OAuth demo |
| `/rate` | 4 | Rate captions (insert to caption_votes) |
| `/upload` | 5 | Upload image → Crackd pipeline → captions |

---

## Key Patterns / Gotchas

- Use `export const dynamic = "force-dynamic"` on server pages that read from Supabase — avoids stale cached empty results at build time.
- `caption_votes` has no DB defaults on timestamps — always supply `created_datetime_utc` and `modified_datetime_utc` on insert.
- RLS policies are not modified in this project — work within existing permissions.
- The shared Supabase project is managed by the professor; students cannot change URL configuration or RLS.
- Do NOT use the raw project URL (`qihsgnfjqmkjmoowyfbn.supabase.co`) as `NEXT_PUBLIC_SUPABASE_URL` — use the custom domain `secure.almostcrackd.ai` instead.
