# Review Fix Changelog

| Finding | Status | Commit hash | Test name(s) |
|---|---|---|---|
| F2 | DONE | `241319b9e5e9c0cf19a73c13be5e8b6d14fff736` | `app refuses to boot when JWT_SECRET is missing`; `app refuses to boot when JWT_SECRET is shorter than 32 characters`; auth controller and middleware tests |
| F3 | DONE | `6568f6e9d2ab965e0c0ceaa7711b7d7dabf957d4` | `Paise input validation`; `rejects invalid paise on expense and settlement creation and accepts the configured maximum`; exact split and itemized split paise validation; INR conversion validation |
| F4 | DONE | `c84abe9b7b080d86855174aab841c8e2e03358a0` | `matches detailed debt net to balance net for 6000 seeded multi-payer expenses` (seed `0xF4A2026`); includes A=1 paisa, B=99 paise, equal 3-way split |

Final backend verification after F4: `npm run test:unit` (52 passed), `npm run test:random` (2 passed), and `npm test` (152 passed, 0 failed, 0 cancelled).
