# Curriculum catalog, school profile, and onboarding

This document describes a **planned** product direction: help schools bootstrap **subjects**, **grade–subject offerings** (`Curriculum`), and downstream **timetable generation** from **country / teaching-system–aware catalog templates**, while keeping full freedom to customize or start from scratch.

**Status:** **Phases A–E implemented** in application code (school profile, catalog API + static JSON packs, transactional install with preview, optional **re-sync** with version banner + scalar refresh from template; catalog doc Phase D is “periods/week” and is covered by enhancement Phase B).  

**Documentation index:** [docs/README.md](../README.md).

**Related data model (today):** see [`prisma/schema.prisma`](../../prisma/schema.prisma) — models `Grade`, `Subject`, `Curriculum` (academic year × grade × subject), `AcademicYear`.

**See also:** [Lesson scheduling & timetable guide](../scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md) (how `Lesson` / `Curriculum` fit the pipeline); [Timetable assistant MVP](../timetable/TIMETABLE_ASSISTANT_MVP.md) (drafting requirements); [Curriculum enhancement design](./CURRICULUM_ENHANCEMENT_DESIGN.md) (books, syllabus, priorities).

---

## 1. Problem statement

- Entering **every** grade–subject link and **every** timetable requirement **by hand** is slow and error-prone.
- Schools in different **countries** and **teaching systems** (national curriculum, IB, American credits, French “cycles”, etc.) expect **sensible defaults**, not a blank slate.
- **Legal / accuracy:** Official programs differ by jurisdiction; any built-in catalog must be positioned as a **starting point** that schools **review and edit**, not as legal compliance.

---

## 2. Concepts

| Concept | Meaning |
|--------|---------|
| **School profile** | Metadata on the school: at minimum **country** (ISO code) and **teaching system** (enum or free text + normalized slug). Optional: locale, accreditation body. |
| **Master data** | **Grades** (`Grade.level` per school) and **Subjects** (`Subject.name` per school) — already first-class entities. |
| **Live curriculum** | Rows in **`Curriculum`**: for a given **`AcademicYear`**, a **grade** **offers** a **subject**, with optional `description`, **`coefficient`**, and teaching materials via **`CurriculumBook`** (and syllabus fields). The legacy single `textbook` string is deprecated — see enhancement Phase D. Unique `(academicYearId, gradeId, subjectId)`. |
| **Catalog template** | A **versioned**, **read-only** definition keyed by `(country, teachingSystem, …)` containing **canonical subject codes/names**, suggested **grade bands**, optional **weekly hours** / **block** hints, **not** live `teacherId`s (teachers are school-specific). |
| **Install from catalog** | One-time (or repeatable) **copy** from a catalog template into the school’s **`Subject`**, **`Grade`** (if needed), and **`Curriculum`** rows for a chosen academic year, then **editable** in-app. |

---

## 3. School registration / settings (UX)

During **school onboarding** or in **Settings**:

1. **Country** — e.g. `MA`, `FR`, `US` (store ISO 3166-1 alpha-2).
2. **Teaching system** — controlled list, e.g. `national_morocco`, `ib_myp`, `us_common_core`, `fr_ministere`, `custom`.
3. Optional: **Default academic year** to apply the first template.

This profile **filters** which catalog entries are shown and sets **defaults** in wizards (“Recommended for Morocco · National”).

---

## 4. Catalog template contents (logical shape)

A template is **not** a replacement for `Curriculum`; it is **input** to create or update school data.

Suggested fields per template (versioned JSON or DB rows):

- **`id`** / **`version`** — e.g. `morocco-lower-secondary@v3`.
- **`country`** + **`teachingSystem`** (+ optional **`region`**).
- **`gradeLabels`** — ordered list of **display labels** or **canonical codes** mapped to school `Grade.level` on install.
- **`lines`** — array of:
  - **`subjectCode`** (stable string) + **`subjectNameDefault`** (display default),
  - **`gradeBand`** or list of **grade indices** where this subject applies,
  - optional **`periodsPerWeek`**, **`blockSize`**, **`room` optional** — for **timetable assistant** hints (may require schema extension on `Curriculum` or a separate table if not folded into coefficient),
  - optional **`coefficient`** default for grading.

**Teachers:** catalog lines **must not** embed real `teacherId` values. At install or in the timetable UI, resolve **“first teacher who teaches this subject”** or **column defaults** in the matrix.

---

## 5. Install flow (product)

1. Admin opens **Curriculum setup** or **Install from catalog**.
2. Chooses **template** (filtered by school country + system).
3. Chooses **target academic year** and **mapping** (e.g. “Our Grade 7 ↔ template grade index 2”) if grade names differ.
4. **Preview** — diff: subjects to create, curriculum rows to add (skip duplicates per `@@unique`).
5. **Apply** — transactional write: create missing `Subject` rows, upsert `Curriculum` rows, record **`installedTemplateId` + `installedVersion`** on school or academic year for support/auditing.

**Empty path:** Schools can still **skip** the catalog and create grades/subjects/curriculum manually — unchanged.

---

## 6. Relationship to timetable assistant

- **Per-grade timetable templates** (`TimetableGradeTemplate`, whole-school assistant) remain **school-authored** presets saved in DB.
- **Catalog** can **seed** or **suggest** periods/week per (grade, subject) once those fields exist or via mapping rules (e.g. derive initial matrix from `Curriculum` + optional `periodsPerWeek` column).
- **Generation** (greedy / CP-SAT) should consume **resolved** `Lesson` / requirement rows derived from **live** school data, not from “which catalog was picked” indefinitely — the catalog is for **bootstrap**, not a runtime dependency.

---

## 7. Implementation phases (suggested)

| Phase | Scope |
|-------|--------|
| **A** | `School` fields: `country`, `teachingSystem`; admin settings UI — **shipped** (`/admin/school-profile`). |
| **B** | Static **JSON packs** in repo (`catalog/*.json`) + read-only API `GET /api/schools/[schoolId]/curriculum-catalog` (school admin, same `schoolId`) — **shipped**. |
| **C** | **Install** action: map template → `Subject` + `Curriculum` for selected year; audit fields on `AcademicYear` — **shipped** (`/admin/setup/catalog-install`). |
| **D** | Optional **periods/week** + timetable “Suggest from curriculum” — **shipped** under [CURRICULUM_ENHANCEMENT_DESIGN.md](./CURRICULUM_ENHANCEMENT_DESIGN.md) **enhancement Phase B** (`periodsPerWeek`, assistant prefill). This catalog doc’s **Phase D** label is **not** the same as enhancement Phase D (legacy `textbook` migration — see enhancement doc §8 Phase D). |
| **E** | Versioning, diff, and “re-sync from template” (non-destructive merge rules) — **shipped** (`/admin/setup/catalog-install`). Shows installed vs on-disk template version; optional **Refresh coefficient and periods/week** for existing matching rows; never deletes curriculum rows. |

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Wrong national program | Disclaimer; editable install; versioned templates |
| Subject name collisions | Prefer **codes** + merge rules on install |
| Grade mismatch | Explicit mapping UI; preview diff |
| Scope creep | Ship **read-only catalog + install** before timetable automation |

---

## 9. Document history

- **Added:** Initial design for curriculum catalog, school profile (country / teaching system), install flow, and timetable alignment.
- **Updated:** Cross-link to [CURRICULUM_ENHANCEMENT_DESIGN.md](./CURRICULUM_ENHANCEMENT_DESIGN.md) (books, syllabus, offering priorities).
- **2026-03-22:** Documented **implementation** of phases A–C: migration `20260322100000_school_profile_catalog_audit`, demo template `catalog/demo-morocco-v1.json`, server actions `previewCatalogInstallAction` / `applyCatalogInstallAction`, UI entry points from **Scheduling setup** and **Curriculum** page.
- **2026-03-23:** Clarified §7 Phase D vs enhancement phases; **live curriculum** row now points to `CurriculumBook` and deprecated legacy `textbook` (enhancement Phase D).
- **2026-03-23:** Phase E shipped — catalog install UI shows **AcademicYear** catalog audit fields (`catalogTemplateId`, `catalogTemplateVersion`, `catalogInstalledAt`), compares to on-disk template version; `previewCatalogInstallAction` / `applyCatalogInstallAction` accept optional `refreshScalarsFromTemplate` to update `coefficient` / `periodsPerWeek` on existing rows that match template lines (same grade mapping + subject name).
