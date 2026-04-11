# Documentation index

Skooly technical and product documentation, organized by area.  
(Older links may have pointed at flat `docs/*.md` paths; files now live under the subfolders below.)

## Curriculum & onboarding

| Document | Description |
|----------|-------------|
| [curriculum/CURRICULUM_ENHANCEMENT_DESIGN.md](./curriculum/CURRICULUM_ENHANCEMENT_DESIGN.md) | Product priorities, SIS-scope guidance, **`CurriculumBook`**, syllabus outline / URL, phased implementation through **Phase D** (legacy `textbook` migration + UI; see §8) |
| [curriculum/CURRICULUM_CATALOG_AND_ONBOARDING.md](./curriculum/CURRICULUM_CATALOG_AND_ONBOARDING.md) | Country / teaching-system profile, static `catalog/*.json` templates, `GET /api/.../curriculum-catalog`, admin school profile + catalog install/re-sync (phases A–E shipped). |

## Scheduling & lessons

| Document | Description |
|----------|-------------|
| [scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md](./scheduling/LESSON_SCHEDULING_AND_TIMETABLE_GUIDE.md) | Lesson templates, term sessions, calendar, and timetable overview |
| [scheduling/BELL_SCHEDULE_IMPLEMENTATION.md](./scheduling/BELL_SCHEDULE_IMPLEMENTATION.md) | Bell schedule (`Period`), phases, API, strict grid |
| [scheduling/SCHEDULING_DATA_BACKFILL.md](./scheduling/SCHEDULING_DATA_BACKFILL.md) | Data backfill notes |
| [scheduling/SCHEDULING_E7_ROLLOUT.md](./scheduling/SCHEDULING_E7_ROLLOUT.md) | E7 rollout note |
| [scheduling/PLAN_LESSON_PERIOD_SPAN_AND_PERIODS_ONLY.md](./scheduling/PLAN_LESSON_PERIOD_SPAN_AND_PERIODS_ONLY.md) | Period-span lessons plan |

## Timetable assistant & solver

| Document | Description |
|----------|-------------|
| [timetable/TIMETABLE_ASSISTANT_MVP.md](./timetable/TIMETABLE_ASSISTANT_MVP.md) | Greedy assistant, APIs, whole-school draft, grade templates |
| [timetable/TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md](./timetable/TIMETABLE_WHOLE_SCHOOL_DRAFT_PLAN.md) | Multi-class draft roadmap |
| [timetable/TIMETABLE_SOLVER_PHASE_F_DESIGN.md](./timetable/TIMETABLE_SOLVER_PHASE_F_DESIGN.md) | Phase F solver design |
| [timetable/TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md](./timetable/TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md) | F.2 CP-SAT feasibility |
| [timetable/TIMETABLE_SOLVER_F3_IMPLEMENTATION.md](./timetable/TIMETABLE_SOLVER_F3_IMPLEMENTATION.md) | F.3 soft goals |
| [timetable/TIMETABLE_SOLVER_F4_IMPLEMENTATION.md](./timetable/TIMETABLE_SOLVER_F4_IMPLEMENTATION.md) | F.4 admin UI |

## Calendar UI

| Document | Description |
|----------|-------------|
| [calendar/CALENDAR_UI_UX_REDESIGN_PERIOD_GRID_GUIDE.md](./calendar/CALENDAR_UI_UX_REDESIGN_PERIOD_GRID_GUIDE.md) | Period grid UX |
| [calendar/CALENDAR_PERIOD_GRID_COMPONENT_CONTRACTS.md](./calendar/CALENDAR_PERIOD_GRID_COMPONENT_CONTRACTS.md) | Component contracts |
| [calendar/CALENDAR_EXCEPTIONS_FULL_IMPLEMENTATION_GUIDE.md](./calendar/CALENDAR_EXCEPTIONS_FULL_IMPLEMENTATION_GUIDE.md) | Calendar exceptions |

---

**Repository root:** See also [../README.md](../README.md) and assessment boards at the repo root (`SCHEDULING_ASSESSMENT_*.md`).
