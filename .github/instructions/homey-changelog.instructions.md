---
description: 'Style guide for `.homeychangelog.json` entries — written for non-technical end-users.'
applyTo: '.homeychangelog.json'
---

# Homey Changelog Style

> `.homeychangelog.json` is shown verbatim to end-users in the Homey App Store
> "What's new" section. Treat it as marketing / user-comms copy, **not** as a
> developer commit log.

## Audience

The reader is a Homey owner who connected their BMW to the app. Assume they:

- Don't know what a "container", "MQTT topic", "OAuth client", or "correlation ID" is.
- Don't read GitHub issues or PR descriptions.
- Care about: **does my car still work? did anything I touch get better? do I need to do anything?**

## Required Style

- **One short paragraph per version.** No bullet lists, no headings, no markdown.
- **Plain language.** Replace jargon with the user-visible symptom or benefit.
- **Active voice, present tense.** "Fixed X" / "Pairing is faster" — not "Refactored the X subsystem".
- **Lead with the user benefit**, follow with a brief "why it matters" only if it adds clarity.
- **Mention required user action** (re-pair, re-authenticate, update Homey, etc.) if any.
- **One or two sentences ideal, three max.** If you need more, you're being too technical.

## Forbidden

- ❌ Internal identifiers: class names, file paths, function names, HTTP status codes,
  header names, log field names, environment variable names.
- ❌ Issue / PR numbers (`#108`), commit hashes, version control terminology.
- ❌ Acronyms users won't know: API, OAuth, PKCE, MQTT, JWT, REST, JSON, RFC, SDK,
  TLS, GCID, VIN (VIN is fine — users see it on their car).
- ❌ Technical fix descriptions: "Refactored", "Migrated", "Hardened the X layer",
  "Added retry logic with exponential backoff".
- ❌ Marketing fluff with no substance: "Various improvements and bug fixes",
  "Stability enhancements" (be specific about what the user will notice).
- ❌ Apologies or self-flagellation: "Sorry for the bug in 1.0.x" — just fix it.

## Translation Examples

| ❌ Too technical                                                                                 | ✅ User-focused                                                                          |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| "Fixed race condition in ConnectedDriver pair session state (#108)"                              | "Pairing two cars at once no longer ends up with one of them missing its data."          |
| "ContainerManager now lists existing containers before POSTing a new one"                        | "Re-pairing your car no longer creates a new connection profile every time."             |
| "HttpClient diagnostics moved to context argument so Logger preserves them"                      | "When something goes wrong, the error message now actually tells you what happened."     |
| "Added client-side correlation ID via x-correlation-id header"                                   | "Errors now include a reference code you can share with support."                        |
| "OAuth device-code polling respects RFC 8628 slow_down responses"                                | "Authentication is more reliable when BMW's servers are busy."                           |
| "Refused to persist device with containerId=undefined when list_devices races container setup"   | "If pairing was interrupted, the app now asks you to retry instead of adding a car that can't show any data." |

## Template

For a typical release covering 2–4 user-visible improvements:

```jsonc
"X.Y.Z": {
  "en": "<Headline benefit in one sentence.> <Optional second sentence covering remaining changes or required action.>"
}
```

For a single-focus release:

```jsonc
"X.Y.Z": {
  "en": "<One sentence: what changed from the user's perspective, and why they'll notice.>"
}
```

## Process Reminder

1. **Write the developer-detail changelog elsewhere** (PR description, internal notes).
2. **Rewrite for users** from scratch — do not paste the dev-changelog and trim.
3. **Read it out loud.** If you'd be embarrassed to explain a word to your non-technical
   relative, replace it.
4. **Keep technical detail in the GitHub release / issue comment**, not in this file.
