# spec-it: to do

Decisions agreed in discussion. `[x]` = built into the skill (2026-11-04). Research: `docs/research-round-3.md`. Previous skill version kept at `.claude/skills/spec-it/evals/baseline-skill-v1/` for comparison.

## 1. Modules and phases

- [x] **Discovery first, when it's needed:** premise, people, areas, standard vs custom, pre-mortem. Skipped, or asked only in part, when the request already answers them. (`interview.md` § Discovery)
- [x] **Never decide structure for the user.** User count or "sounds big" never triggers modules. (SKILL.md rule 1, `structure.md`)
- [x] **Module signals:** 2+ areas each meeting 2+ of: different people or vocabulary, owns its own data, could ship alone, more than about 25 questions. (`structure.md`)
- [x] **Shape checkpoint:** start with one area now *(recommended)* / split into modules / keep one spec (cap 40) / explain.
- [x] **Phase checkpoint,** only on MVP or "later" wording, or an inventory over 12: all at once *(recommended)* / in phases / explain.
- [x] **Four shapes and what the user sees:** nothing extra, a module table, a timeline, or a grid.
- [x] **One unit per run,** ending with "Continue with <next> now, or stop here?". `/spec-it --next` resumes later.
- [x] **Keep units consistent:** each new unit reads `roadmap.md`, `shared/design.md`, earlier glossaries and data models, and its parked questions.
- [x] **Default limits, extendable by the user:** 6 modules, 3 detailed phases. Recorded on the roadmap's `Limits:` line.
- [x] **IDs:** a module prefix only with modules (`BOOK-FR-3`). The check script accepts prefixes.
- [x] **One index file, `roadmap.md`,** for every shape: units, map, parked questions, deferred.
- [x] **Phases now:** every unit is a full spec in its own numbered folder.
- [ ] **Phases later** (with existing-app mode): change-only specs citing earlier IDs.

## 2. Folder layout

```
spec-it/
├── roadmap.md            always
├── shared/               only with 2+ units: design.md, assets/ (theme, fixtures)
└── 1-<name>/             one unit
    ├── REQUIREMENTS.md
    ├── decisions.md      intake + coverage + questions + glossary + restate
    ├── design.md
    └── mockups/          index.html, screens, api.html + openapi.yaml, cli.html + transcripts.md,
        └── assets/       theme.css, fixtures.js, app.js; export/ holds single-file copies
```

- [x] Output root renamed `specs/` → `spec-it/`.
- [x] Flat numbered units. Named `<number>-<name>` (`1-habit-tracker/`), since the number-only option wasn't chosen.
- [x] `roadmap.md` for every shape.
- [x] Intake merged into the top of `decisions.md`.
- [x] `assets/` inside `mockups/`. API and CLI artifacts also live in `mockups/` (`api.html`, `cli.html`), so one folder holds everything to open, and mixed products share one `fixtures.js`.
- [x] `shared/` created when the second unit starts; each unit keeps its own copy of the assets, so it stays self-contained.
- [x] Updated `SKILL.md`, the references, `check.mjs`, `serve.mjs`, `--resume` and `--next`.
- [ ] Update `INSTALL.md` and rebuild `dist/spec-it-mvp.zip` (done after testing).

## 3. API, CLI and mixed products

- [x] **API errors:** RFC 9457 problem details, unless the developer specifies their own format.
- [x] **No live API mock** (no Prism).
- [x] **CLI rules from clig.dev,** used as interview probes and transcript rules.
- [x] **CLI transcripts as runnable tests:** `mockups/transcripts.md` is the source; `scripts/cli-render.mjs` generates `cli.html`; the check script fails when they drift apart.
- [x] **Mixed products:** one `fixtures.js`; an FR may list several artifacts in `Shown in:`.
- [x] **Test project `06-mixed`.**
- [ ] **Run the skill on 03-express-api, 04-node-cli and 06-mixed,** and check the type-specific rules.

## 4. Question UX

- [x] **One question at a time,** one picker call per question.
- [x] **Picker layout:** recommended, up to 2 alternatives, "Explain with an example", plus the automatic "Other".
- [x] **Context above the picker:** progress line, concrete context, why it matters.
- [x] **Explain flow:** story, then "Did that make sense?", then the same question again.
- [x] **Previews** for the design-direction question.
- [x] **Text fallback** when no picker is available.
- [x] **Show each question exactly once.**
- [x] **Provenance and the 70% check** kept.

## 5. Product-to-technical gate

- [x] **Coverage checklist** of 8 areas in `decisions.md`.
- [x] **Coverage drives question choice.**
- [x] **Product gate as the stop test.** The check script fails a confirmed restate while any area is Partial or Missing.
- [x] **Technical round, opt-in,** `T`-tagged, at most 8 (checked), answers in §11 "Constraints and technical decisions".

## 6. Quick wins

- [x] **Ambiguity lint:** vague words and NFRs without a number are warnings; "TBD" is an error.
- [x] **Spec reviewer pass** (`references/reviewer.md`) after synthesis.
- [x] **Single-file mockup export** (`scripts/export.mjs` → `mockups/export/`).
- [x] **Pre-mortem question** in discovery.
- [x] **CLI transcripts as tests.**
- Later, not now: EARS phrasing, analytics events, a time and cost estimate at intake.

## 7. Evals

- [x] Test project `06-mixed`.
- [x] Personas for every case (UI, API, CLI, mixed, large).
- [x] `evals/run-persona.mjs`, with `--skill-dir` to run the saved previous version.
- [x] Old skill snapshotted as `evals/baseline-skill-v1/` before the build.
- [ ] Run the persona evals: the new skill on all 5 cases, plus the baseline skill and no-skill arms for comparison.
