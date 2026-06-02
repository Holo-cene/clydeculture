# apps/web — frontend placeholder

Do not populate until ADR 0001 (`docs/decisions/0001-frontend-architecture.md`) is decided.

- If Webflow is chosen, this directory stays empty; the frontend lives in Webflow and
  is fed by `packages/publishing`.
- If a coded frontend is chosen, this becomes the Next.js app (plain, or on MakerKit
  for the Phase 2 membership portal) reading from Supabase.
