# Curriculum enhancement — product & data design

This document consolidates **direction** for Skooly’s curriculum area: what to build for a **useful, intuitive, easy** experience, how it compares to large SIS products at a high level, and **concrete data designs** for **`CurriculumBook`** and **syllabus / “chapters”** (free-form, not a rigid tree).

**Status:** Product + technical design — implementation may be phased (schema migrations, UI, APIs).

**See also:**

- [CURRICULUM_CATALOG_AND_ONBOARDING.md](./CURRICULUM_CATALOG_AND_ONBOARDING.md) — country / teaching system, catalog install, timetable alignment, catalog **Phase E** (versioning / re-sync / scalar refresh) documented there  
- [Documentation index](../README.md)

---

## 1. Goals

| Goal | Meaning in practice |
|------|----------------------|
| **Useful** | Curriculum ties to **grading** (`coefficient`), **timetable** (expected load), and **teaching materials** (books, syllabus). |
| **Intuitive** | One primary notion: **for this school year, this grade takes these subjects** — advanced options stay secondary. |
| **Easy** | **Templates**, **copy from last year**, and **optional** rich fields — no forced PowerSchool-level complexity on day one. |

---

## 2. What to add (prioritized)

### 2.1 High priority (big UX win, moderate engineering)

| Item | Description |
|------|-------------|
| **Copy curriculum from previous academic year** | One action with preview (diff / skip duplicates). Reduces duplicate data entry. |
| **Optional `periodsPerWeek` (or `weeklyPeriods`) on `Curriculum`** | Bridges **offerings** to the **timetable assistant** (prefill / validate). Nullable until the school cares. |
| **School profile: country + teaching system** | Filters catalog templates and defaults (see catalog doc). |
| **Catalog template install** | Bootstrap subjects + curriculum rows from a versioned pack (see catalog doc). |

### 2.2 Teaching materials — `CurriculumBook` (this document §5)

| Item | Description |
|------|-------------|
| **Multiple books per curriculum row** | Replaces reliance on a single `Curriculum.textbook` string for schools that list several resources. |
| **Structured metadata** | Title, optional ISBN, role (primary / supplementary / …), sort order. |

### 2.3 Syllabus / “chapters” — free-form (this document §6)

| Item | Description |
|------|-------------|
| **`syllabusOutline` on `Curriculum`** | Long text (e.g. Markdown): units, chapter titles, pacing — **no enforced hierarchy in the DB**. |
| **Optional `syllabusUrl`** | Link to PDF, Google Doc, or school site. |

**Explicit non-goals for v1:** A normalized **Chapter** / **Unit** tree with ordering and dates (that is a curriculum-mapping or LMS-scale feature; revisit only with clear user demand).

---

## 3. What to defer or avoid (scope control)

| Avoid / defer | Reason |
|---------------|--------|
| Separate **course master** vs **offering** tables for small schools | Two maintenance surfaces unless you have districts or many course variants. |
| **US state reporting codes** (SCED, etc.) | Region-specific; add when you target that market. |
| **Full standards / competency frameworks** | Large surface; ManageBac-class scope. |
| **Student course request + auto master schedule** | District scheduling product; your **assistant + preview** stays simpler. |
| **Rigid chapter entity** with timetable dates | High complexity; free text + URL first. |

---

## 4. Benchmark reminder (short)

Large SIS products separate **catalog** (what a course *is*), **offerings** (what the school *runs* this year), and **scheduling** (sections, periods). Skooly’s **`Curriculum`** row is closest to the **offering** layer (year × grade × subject). Enriching it with **hours/periods**, **books**, and **syllabus text** keeps one mental model while staying lighter than a full US district SIS.

*(Detailed vendor comparison was discussed internally; this file stays product-focused.)*

---

## 5. `CurriculumBook` (proposed Prisma model)

**Purpose:** Many resources per **one** `Curriculum` row (same academic year, grade, subject). Supports ordering and simple classification without a global library system in v1.

### 5.1 Relations

- **`Curriculum`** `1` — `*` **`CurriculumBook`**
- Deleting a **`Curriculum`** row **cascades** to its books.

### 5.2 Fields (proposed)

| Field | Type | Notes |
|-------|------|--------|
| `id` | `String` `@id` `@default(cuid())` | |
| `curriculumId` | `String` | FK → `Curriculum.id` |
| `sortOrder` | `Int` `@default(0)` | Display order within the curriculum row |
| `title` | `String` | Required (book or resource title) |
| `authors` | `String?` | Optional |
| `isbn` | `String?` | Optional; validate lightly in UI if present |
| `publisher` | `String?` | Optional |
| `edition` | `String?` | Optional |
| `role` | `CurriculumBookRole` or `String` | See §5.3 |
| `notes` | `String?` `@db.Text` | Optional fine print (e.g. “Chapters 1–3 first term”) |
| `createdAt` / `updatedAt` | `DateTime` | Standard |

### 5.3 `role` values (enum recommended)

| Value | Meaning |
|-------|---------|
| `primary` | Main student textbook |
| `supplementary` | Extra readings |
| `workbook` | Workbook / exercices |
| `reader` | Anthology / reader |
| `teacher` | Teacher guide |
| `digital` | Primary digital resource label |
| `other` | Fallback |

### 5.4 Legacy `Curriculum.textbook`

The existing optional **`textbook`** string on **`Curriculum`** can:

- **Remain** for quick one-line notes or **import compatibility**, or  
- Be **deprecated** in UI in favor of **`CurriculumBook`**, with a one-time migration: if `textbook` is non-empty and no books exist, create one **`CurriculumBook`** with `role = primary` and `title` from the legacy field.

### 5.5 API / UI (outline)

- **List / create / update / delete** books under a curriculum row (admin-only, same permissions as curriculum today).
- **Validation:** `title` required; `sortOrder` auto-filled or drag-and-drop reorder.

---

## 6. Syllabus and “chapters” (free-form on `Curriculum`)

**Problem:** Schools want to record **what** is taught (units, chapters, order) without maintaining a second heavy product (full LMS).

### 6.1 Proposed fields on `Curriculum`

| Field | Type | Notes |
|-------|------|--------|
| `syllabusOutline` | `String?` `@db.Text` | Free-form: bullet list, numbered chapters, term splits. Markdown optional in UI. |
| `syllabusUrl` | `String?` | Optional URL to external syllabus (PDF, Drive, school page). |

**No** `Chapter` table in v1: avoids rigid ordering debates and duplicate maintenance. If structured units are needed later, introduce **`CurriculumUnit`** (or similar) **after** usage patterns are clear.

### 6.2 UX hints

- Labels: **“Syllabus outline (optional)”** — helper text: *Units, chapters, or pacing notes. You can paste from Word or link a document below.*  
- Optional **preview** if Markdown is enabled.

---

## 7. Optional future fields (not committed)

| Field | Purpose |
|-------|---------|
| ~~`periodsPerWeek` on `Curriculum`~~ | **Shipped (Phase B):** optional `Int?` for weekly period count; timetable assistant can prefill from curriculum. |
| `creditValue` | US-style credits (only if product goes there) |
| `isCore` / `electiveGroupId` | Tracks / option blocks |

---

## 8. Implementation phases (suggested)

| Phase | Deliverables |
|-------|----------------|
| **A** | Prisma: `CurriculumBook` + migration; optional `syllabusOutline` / `syllabusUrl` on `Curriculum`; API + admin UI for books and syllabus fields — **implemented** (2026-03-20, migration `20260320180000_curriculum_books_and_syllabus`) |
| **B** | Copy curriculum from prior year; optional `periodsPerWeek` — **implemented** (2026-03-21, migration `20260321100000_curriculum_periods_per_week`; copy preview/apply + timetable assistant prefill) |
| **C** | School profile + catalog install — **implemented** (2026-03-22, migration `20260322100000_school_profile_catalog_audit`; `catalog/*.json`, `GET /api/.../curriculum-catalog`, admin school profile + catalog install UI) — see [CURRICULUM_CATALOG_AND_ONBOARDING.md](./CURRICULUM_CATALOG_AND_ONBOARDING.md) |
| **D** | Legacy `textbook` migration + UI deprecation — **implemented** (2026-03-23, migration `20260323120000_migrate_legacy_textbook_to_books`; SQL backfill to `CurriculumBook`, admin UI uses Books only; legacy clear-only path) |

---

## 9. Document history

- **Added:** Consolidated product direction, `CurriculumBook` schema sketch, syllabus free-form fields, scope boundaries, implementation phases.
- **2026-03-20:** Phase A shipped — `CurriculumBook` + `CurriculumBookRole`, `syllabusOutline` / `syllabusUrl`, admin server actions and curriculum page UI (`prisma/migrations/20260320180000_curriculum_books_and_syllabus`).
- **2026-03-21:** Phase B shipped — `periodsPerWeek` on `Curriculum`, admin copy-from-year (preview + apply, books cloned), **Fill periods from curriculum** on class timetable assistant (`prisma/migrations/20260321100000_curriculum_periods_per_week`).
- **2026-03-22:** Phase C shipped — `School.country` / `School.teachingSystem`, `AcademicYear` catalog audit fields (`catalogTemplateId`, `catalogTemplateVersion`, `catalogInstalledAt`), static catalog JSON + loader, school-scoped catalog API, preview/apply install actions, admin **School profile** and **Catalog install** (`prisma/migrations/20260322100000_school_profile_catalog_audit`).
- **2026-03-23:** Phase D shipped — legacy `Curriculum.textbook` migrated to `CurriculumBook` primary rows where no books existed; `textbook` cleared; create/API paths no longer accept new legacy text; curriculum edit UI shows legacy only to clear (`prisma/migrations/20260323120000_migrate_legacy_textbook_to_books`).
- **2026-03-23:** Catalog **Phase E** (see [CURRICULUM_CATALOG_AND_ONBOARDING.md](./CURRICULUM_CATALOG_AND_ONBOARDING.md) §7) — catalog install re-sync and scalar refresh from template; not a separate row in this doc’s §8 table (Phases A–D are enhancement curriculum phases).
