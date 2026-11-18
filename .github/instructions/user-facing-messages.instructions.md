---
description: 'Style guide for user-facing error messages, pairing hints, and UI strings — what the Homey owner reads when something goes wrong.'
applyTo: '**/*.{ts,html,json}'
---

# User-Facing Message Style

These rules apply to any string a Homey user can see: thrown `Error` messages
that surface in the Homey UI, pairing-flow / repair-flow text, settings-page
copy, flow-card descriptions, and the `.homeychangelog.json` (see also
`homey-changelog.instructions.md`).

## We are not BMW

This is a **third-party community app**, not an official BMW product.

- **Never tell the user to contact BMW support.** BMW will not help with a
  third-party Homey app and the user will be sent in a frustrating loop.
- Do not write "contact / share with / reach out to BMW support",
  "open a ticket with BMW", "BMW can help", or any variant.
- Do not include phrases like "share the correlation ID with BMW support" —
  the correlation ID is for **our** diagnostic logs, not BMW's.
- If a problem genuinely needs upstream BMW action (rare), say so generically:
  "this looks like a BMW-side issue; please open a GitHub issue with the
  correlation ID and we'll take a look" — point users at our repo, not BMW.

## Don't blame the user when we don't know

When a 403 / generic failure could be one of several causes, do not assert a
specific cause as fact. Use neutral phrasing:

- Good: "verify the 'Streaming API' option is enabled on your BMW CarData
  client, or open a GitHub issue with the correlation ID below."
- Bad: "check that the Streaming API option is enabled" (implies it is off).
- Bad: "your BMW CarData client is misconfigured" (presumes fault).

## Reference the correlation ID for *our* diagnostics

When we include a correlation ID in a surfaced message, frame it as something
the user can paste into a GitHub issue **on this repo** so we can grep our
diagnostic logs — never as a BMW support reference.

## Plain language, no jargon

Homey users are not developers. Prefer plain English:

- "daily request limit" not "rate limit quota window"
- "wait a few hours" not "retry after the rolling 24h window clears"
- Acronyms (CU-429, MQTT, OAuth, PKCE) belong in logs, not user-facing copy.
  If you must include a BMW error code for support purposes, put it in
  parentheses after the plain-English explanation.

## Tell the user what to do next

Every user-facing error should answer "what now?". If there's no action the
user can take, say that explicitly ("nothing you need to do — the app will
retry automatically") rather than leaving them stranded.
