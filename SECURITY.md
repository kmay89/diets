# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 1.0.x | ✅ |

## Reporting a vulnerability

Report privately through GitHub's **Security → Report a vulnerability** on
<https://github.com/kmay89/diets>, or open an issue if the problem is not sensitive.
Please do not include personal health information in a public report.

Expect an acknowledgement within a week, an assessment within two, and credit in the changelog
unless you would rather not have it.

## Threat model

Diets is a static, client-side application. It has no backend, no accounts, no authentication and
no network calls of its own beyond fetching its own files. That removes most of the usual
categories — there is no server to compromise, no session to hijack, no API to abuse.

What remains, and what we care about:

- **Cross-site scripting.** All user-supplied text (names, hand-added shopping items, pasted lists)
  is inserted via `textContent` and DOM node construction, never `innerHTML` string concatenation.
  A path that lets pasted text execute is a real vulnerability — report it.
- **Local data exposure.** Household details, ages and weights live in `localStorage` and are not
  encrypted. That is documented in [PRIVACY.md](PRIVACY.md). A way for another origin to read them
  is a real vulnerability.
- **Service worker scope.** The worker only handles same-origin GET requests and never caches
  cross-origin responses. A path that lets it cache or serve foreign content is a real
  vulnerability.
- **Backup import.** Restoring a backup replaces local state from a JSON file. It is parsed with
  `JSON.parse` and merged field-wise, never evaluated. A crafted backup that achieves anything
  beyond setting state is a real vulnerability.
- **Supply chain.** There are no runtime dependencies and no build step, on purpose. Anything that
  would add one deserves scrutiny.

## Out of scope

- Someone with physical access to an unlocked device reading local data — that is inherent to
  client-side storage and is documented.
- The behavior of retailer sites reached through the shopping-list search links.
- Self-hosting misconfiguration (missing HTTPS, permissive headers) on a fork.

## Hardening for self-hosters

Serve over HTTPS — service workers require a secure context. A reasonable Content-Security-Policy
for this app, which loads nothing from other origins:

```
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self';
  script-src 'self'; connect-src 'self'; form-action 'none'; frame-ancestors 'none';
  base-uri 'self'
```
