# prompt-chain-tool

Admin interface for building and testing humor-flavor prompt chains.


## What this tool does

- Create, update, and delete humor flavors.
- Create, update, delete, and reorder humor flavor steps.
- Restrict all access to users where profile has:
	- `profiles.is_superadmin = TRUE`, or
	- `profiles.is_matrix_admin = TRUE`
- Load an image test set from `images` and test a humor flavor against that set.
- Generate captions using the Assignment 5 REST API at `https://api.almostcrackd.ai`.
- Read generated captions per image and flavor test run in the UI.
- Support theme modes: light, dark, system.

## Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS 4
- Supabase (`@supabase/ssr`)

## Environment setup

Copy `.env.example` to `.env.local` and fill values:

```bash
cp .env.example .env.local
```

Required values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `CRACKD_API_BASE_URL` (defaults to `https://api.almostcrackd.ai`)

## Install and run

```bash
npm install
npm run dev
```

## Database schema notes

This project expects:

- `humor_flavors` table
- `humor_flavor_steps` table
- Existing `profiles` table with `is_superadmin` and `is_matrix_admin`
- Existing `images` table for test set loading

A starter schema is included at `sql/schema.sql`.

### Required audit columns on all INSERT/UPDATE writes

This implementation always sets:

- `created_by_user_id`
- `modified_by_user_id`

And expects database automation for:

- `created_datetime_utc` set on INSERT
- `modified_datetime_utc` set on UPDATE

## API surface in this app

- `GET/POST /api/flavors`
- `GET/PATCH/DELETE /api/flavors/:flavorId`
- `POST /api/flavors/:flavorId/steps`
- `PATCH/DELETE /api/flavors/:flavorId/steps/:stepId`
- `POST /api/flavors/:flavorId/steps/reorder`
- `GET /api/test-images`
- `POST /api/test-flavor`

## Important behavior

- Every route checks the authenticated user and verifies admin role flags.
- Every write operation includes user audit fields (`created_by_user_id`, `modified_by_user_id`).
- Step reorder persists order via `step_order` updates.
- Flavor test requests send both selected image IDs and the ordered prompt chain to the REST API.

## REST API payload for testing

`POST /api/test-flavor` relays to:

- `POST ${CRACKD_API_BASE_URL}/pipeline/generate-captions`

Payload:

```json
{
	"imageId": "<image uuid>",
	"humorFlavorId": "<flavor uuid>",
	"humorFlavorName": "Dry Absurdist",
	"promptChain": [
		{ "id": "...", "order": 1, "instruction": "Describe image in text." },
		{ "id": "...", "order": 2, "instruction": "Generate something funny." },
		{ "id": "...", "order": 3, "instruction": "Return five short captions." }
	]
}
```

If your API expects different field names, adjust mapping in `app/api/test-flavor/route.ts`.
