---
description: 'Guidelines for TypeScript Development targeting TypeScript 4.x and ES2019 output (Homey Apps SDK v3 requirement)'
applyTo: '**/*.ts'
---

# TypeScript Development (Homey Apps)

> These instructions are adapted for Homey Apps SDK v3 which requires Node 12 and ES2019 target.

## Core Intent

- Respect the existing architecture and coding standards.
- Prefer readable, explicit solutions over clever shortcuts.
- Extend current abstractions before inventing new ones.
- Prioritize maintainability and clarity, short methods and classes, clean code.

## General Guardrails

- Target TypeScript 4.x / ES2019 (Node 12 compatibility for Homey).
- Use pure ES modules; never emit `require`, `module.exports`, or CommonJS helpers.
- Rely on the project's build, lint, and test scripts unless asked otherwise.
- Note design trade-offs when intent is not obvious.

## Project Organization

- Follow the repository's folder and responsibility layout for new code.
- Use kebab-case filenames (e.g., `user-session.ts`, `data-service.ts`) unless told otherwise.
- Keep tests, types, and helpers near their implementation when it aids discovery.
- Reuse or extend shared utilities before adding new ones.

## Naming & Style

- Use PascalCase for classes, interfaces, enums, and type aliases; camelCase for everything else.
- Skip interface prefixes like `I` unless they improve clarity in this codebase.
- Name things for their behavior or domain meaning, not implementation.

## Formatting & Style

- Run the repository's lint/format scripts (e.g., `npm run lint`) before submitting.
- Match the project's indentation (2 spaces), quote style (single quotes), and trailing comma rules.
- Keep functions focused; extract helpers when logic branches grow.
- Favor immutable data and pure functions when practical.

## Type System Expectations

- Avoid `any` (implicit or explicit); prefer `unknown` plus narrowing.
- Use discriminated unions for state machines and events.
- Centralize shared contracts instead of duplicating shapes.
- Express intent with TypeScript utility types (e.g., `Readonly`, `Partial`, `Record`).

## Async, Events & Error Handling

- Use `async/await`; wrap awaits in try/catch with structured errors.
- Guard edge cases early to avoid deep nesting.
- Send errors through the project's logging utilities (`Logger.ts`).
- Surface user-facing errors via Homey's notification system.
- Dispose resources deterministically (cleanup in finally blocks or explicit dispose methods).

## Architecture & Patterns

- Follow the repository's dependency injection pattern; keep modules single-purpose.
- Observe existing initialization and disposal sequences when wiring into lifecycles.
- Keep transport, domain, and presentation layers decoupled with clear interfaces.
- Supply lifecycle hooks (e.g., `initialize`, `dispose`) and targeted tests when adding services.

## External Integrations

- Instantiate clients outside hot paths and inject them for testability.
- Never hardcode secrets; load them from secure sources (Homey settings).
- Apply retries, backoff, and cancellation to network or IO calls.
- Normalize external responses and map errors to domain shapes.

## Security Practices

- Validate and sanitize external input with schema validators or type guards.
- Avoid dynamic code execution and untrusted template rendering.
- Use parameterized queries or prepared statements to block injection.
- Keep secrets in secure storage (Homey SettingsManager), rotate them regularly.
- Favor immutable flows and defensive copies for sensitive data.
- Use vetted crypto libraries only (built-in Node.js crypto module).
- Patch dependencies promptly and monitor advisories.

## Configuration & Secrets

- Reach configuration through shared helpers (`ConfigurationManager.ts`).
- Handle secrets via Homey's secure storage; guard `undefined` and error states.
- Document new configuration keys and update related tests.

## Testing Expectations

- Add or update unit tests with the project's framework and naming style.
- Expand integration tests when behavior crosses modules.
- Run targeted test scripts for quick feedback before submitting.
- Avoid brittle timing assertions; prefer fake timers or injected clocks.

## Performance & Reliability

- Lazy-load heavy dependencies and dispose them when done.
- Defer expensive work until users need it.
- Batch or debounce high-frequency events to reduce thrash (see polling intervals).
- Track resource lifetimes to prevent leaks.

## Documentation & Comments

- Add JSDoc to public APIs; include `@remarks` or `@example` when helpful.
- Write comments that capture intent, and remove stale notes during refactors.
- Update architecture or design docs when introducing significant patterns.

## Homey-Specific Guidelines

- Follow Homey Apps SDK v3 patterns for drivers, devices, and flows.
- Use `HomeyTokenStore` for secure token storage.
- Respect Homey's lifecycle methods (`onInit`, `onAdded`, `onDeleted`, etc.).
- Use Homey's built-in logging (`this.log`, `this.error`) in drivers/devices.
- Handle capability listeners properly with async/await.
- Test pairing flows thoroughly with device code flow UI.
