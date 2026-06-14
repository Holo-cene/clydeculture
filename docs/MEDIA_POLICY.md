# Media and Display-Permission Policy

**Status: target policy (ADR 0005 Tranche B4).** This document generalises image/media
handling across all sources. It extends
[ADR 0004](decisions/0004-ticketmaster-image-usage.md) (Ticketmaster image usage) from a
single-source decision into a per-source matrix. The `display_permitted` concept below
is a **planned** signal — verify against `supabase/migrations/` before treating it as a
current schema field.

Clyde Culture is link-first (`docs/source-policy.md`): we route to sources, we do not
republish them. Media is the area where "link-first" most needs explicit rules, because
events arrive with very different media and very different rights.

---

## The core distinction: `display_permitted`

Whether an image (or other media) may be shown publicly is a **rights** question, not a
quality one. The model carries a per-media **`display_permitted`** signal so the
frontend only ever renders media we are permitted to display. Default is **not
permitted** until a source's media terms are reviewed and recorded (mirrors the
`imageUrlGuess` gate in `docs/source-policy.md`).

Never download, proxy, or cache media binaries (link-first / ADR 0004). Where display is
permitted, hot-link at render time and re-check on each sweep.

---

## Per-source media-rights matrix

| Media type / source | Public display? | Notes |
|---|---|---|
| Ticketmaster CDN image | **Constrained — permitted with attribution** | Hot-link only; "Buy on Ticketmaster" attribution adjacent (ADR 0004). No binary caching. |
| Venue-provided image via **partnership** | **Yes** | Where a partner/venue source grants display rights; record the grant. |
| **User-submitted** image with permission | **Yes** | Submitter confirms they hold/granted rights at submission (`docs/SUBMISSIONS.md`). |
| Scraped website image | **Usually no** | Default not-permitted unless the venue's ToS explicitly allows image display. |
| Instagram flyer / poster | **Risky — default no** | Only if submitted/permissioned; never scraped (ToS prohibits — `docs/source-policy.md` §2). |
| Placeholder / category artwork | **Safe** | Platform-owned or licensed artwork; always displayable. |
| Data Thistle images | **No** | Prohibited by their terms (`docs/source-policy.md`). |

---

## Rules

1. **Default deny.** `display_permitted = false` until a source's media terms are
   reviewed and recorded in the connector source file / SPEC and reflected in
   `docs/source-policy.md`.
2. **No binaries.** Never download, proxy, or cache media; hot-link permitted media at
   render time and re-validate each sweep.
3. **Attribution where required.** Some permissions are conditional on attribution
   (Ticketmaster). Carry the attribution label with the media.
4. **Submitted media needs a rights confirmation.** User-uploaded images require the
   submitter to confirm rights; store that confirmation.
5. **Fallback is the placeholder.** When no displayable media exists, use platform/
   category artwork — never substitute a non-permitted image.
6. **Beauty does not override rights.** A nicer image that we are not permitted to show
   is not shown.

---

## Phasing

| Item | Phase |
|---|---|
| This policy + per-source review in `docs/source-policy.md` | NOW (documentation) |
| `display_permitted` signal on stored media | DESIGN-NOW, BUILD-LATER (B4) |
| Partner media grants, user-submitted media | with B4 / submission build |

Connector authors: record each source's media position per `docs/CONNECTOR_GUIDE.md`
(media-rights classification) and `docs/source-policy.md`. Umbrella decision:
[ADR 0005](decisions/0005-event-data-model-for-all-event-coverage.md); extends
[ADR 0004](decisions/0004-ticketmaster-image-usage.md).
