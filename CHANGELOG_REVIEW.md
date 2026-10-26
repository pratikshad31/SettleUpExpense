# Review Fix Changelog

| Finding | Status | Commit hash | Test name(s) |
|---|---|---|---|
| F2 | DONE | `241319b9e5e9c0cf19a73c13be5e8b6d14fff736` | `app refuses to boot when JWT_SECRET is missing`; `app refuses to boot when JWT_SECRET is shorter than 32 characters`; auth controller and middleware tests |
| F3 | DONE | `6568f6e9d2ab965e0c0ceaa7711b7d7dabf957d4` | `Paise input validation`; `rejects invalid paise on expense and settlement creation and accepts the configured maximum`; exact split and itemized split paise validation; INR conversion validation |
| F4 | DONE | `c84abe9b7b080d86855174aab841c8e2e03358a0` | `matches detailed debt net to balance net for 6000 seeded multi-payer expenses` (seed `0xF4A2026`); includes A=1 paisa, B=99 paise, equal 3-way split |
| F5 | DONE | `e6750c1a1fbf3379af7d345468678a5d67ae0a7d` | `returns no search results for users with no shared group`; `denies UPI lookup for an unrelated guessed numeric user ID`; `allows shared-group search and UPI lookup with minimal search fields`; `does not treat an inactive group member as shared` |
| F6 | DONE | `79fda4b9131fb47184082f7efffe90e849e80787` | `creates one settlement for five concurrent requests with the same key`; `keeps the same key independent between users and preserves the first response`; `does not replay a response for a different route with the same key`; `returns 422 when the same user, route, and key are reused with a different body`; `creates one expense when retried with the same key`; `releases the reservation after a 5xx so a corrected retry can run` |

Final backend verification after F6: `npm run test:unit` (52 passed), `npm run test:random` (2 passed), and `npm test` (162 passed, 0 failed, 0 cancelled).
