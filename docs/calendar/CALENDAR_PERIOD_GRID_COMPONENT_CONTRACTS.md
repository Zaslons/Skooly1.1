# Calendar Period-Grid Component Contracts

## Purpose

This document defines implementation-ready component contracts for the period-grid calendar redesign.

Use it together with:

- `./CALENDAR_UI_UX_REDESIGN_PERIOD_GRID_GUIDE.md`

The goal is to align product, frontend, and backend mapping with stable interfaces.

---

## Data Model Contracts

## 1) Core domain view model

```ts
export type PeriodGridViewModel = {
  timezone: string;
  rangeStart: string; // ISO
  rangeEnd: string;   // ISO
  days: PeriodGridDay[];
  periods: PeriodGridPeriod[];
  legend: PeriodGridLegendItem[];
};
```

```ts
export type PeriodGridDay = {
  key: string;            // yyyy-mm-dd
  dateIso: string;        // ISO date
  labelShort: string;     // Mon 12
  labelLong: string;      // Monday, Jan 12
  exceptionRibbon: DayExceptionRibbonItem[];
};
```

```ts
export type PeriodGridPeriod = {
  id: string;
  order: number;
  name: string;
  startTimeLabel: string; // 08:00
  endTimeLabel: string;   // 09:00
};
```

```ts
export type PeriodGridCell = {
  cellId: string; // `${dayKey}:${periodId}`
  dayKey: string;
  periodId: string;
  state: "empty" | "occupied" | "blocked" | "conflict";
  lesson?: LessonBlockVM;
  exams: ExamInlineVM[];
  chips: CellChipVM[];
  exceptions: CellExceptionVM[];
};
```

---

## 2) Lesson / exam / exception contracts

```ts
export type LessonBlockVM = {
  lessonSessionId: number;
  templateLessonId: number;
  title: string;
  subjectName: string;
  className: string;
  teacherName: string;
  roomName: string | null;
  status: "SCHEDULED" | "CANCELLED";
  spans: {
    isSpanning: boolean;
    isStart: boolean;
    isMiddle: boolean;
    isEnd: boolean;
    spanLength: number;
  };
  meta: {
    popQuizCount: number;
    assignmentDueCount: number;
  };
};
```

```ts
export type ExamInlineVM = {
  examId: number;
  title: string;
  examCategory: "POP_QUIZ" | "COURSE_EXAM";
  isRecurring: boolean;
  durationMinutes: number;
  startsInCell: boolean;
  endsInCell: boolean;
};
```

```ts
export type CellExceptionVM = {
  exceptionId: string;
  type: "HOLIDAY" | "BREAK" | "EXAM_PERIOD";
  title: string;
  startIso: string;
  endIso: string;
  notes?: string | null;
  scope: "day" | "cell";
};
```

```ts
export type DayExceptionRibbonItem = {
  exceptionId: string;
  type: "HOLIDAY" | "BREAK" | "EXAM_PERIOD";
  shortLabel: string;
  tooltipLabel: string;
};
```

```ts
export type CellChipVM =
  | { kind: "POP_QUIZ"; label: string; count: number }
  | { kind: "ASSIGNMENT_DUE"; label: string; count: number }
  | { kind: "WARNING"; label: string };
```

---

## 3) Interaction event contracts

```ts
export type PeriodGridInteractionHandlers = {
  onCellClick?: (args: { dayKey: string; periodId: string; cell: PeriodGridCell }) => void;
  onLessonClick?: (args: { lessonSessionId: number; cell: PeriodGridCell }) => void;
  onExamClick?: (args: { examId: number; cell: PeriodGridCell }) => void;
  onExceptionClick?: (args: { exceptionId: string; dayKey: string }) => void;
  onEmptyCellAction?: (args: { dayKey: string; periodId: string }) => void;
};
```

---

## Component Contracts

## 1) `PeriodGridCalendar`

Top-level composite component.

```ts
type PeriodGridCalendarProps = {
  model: PeriodGridViewModel;
  cellsByKey: Record<string, PeriodGridCell>;
  loading?: boolean;
  density?: "comfortable" | "compact";
  role: "admin" | "teacher" | "student";
  filters: PeriodGridFilters;
  onFiltersChange?: (next: PeriodGridFilters) => void;
  interactions?: PeriodGridInteractionHandlers;
  rightPanel?: React.ReactNode;
};
```

Responsibilities:

- render header + filter bar + grid shell
- render period labels and day headers
- route interaction events to handlers
- respect role-based affordances

---

## 2) `PeriodGridHeader`

```ts
type PeriodGridHeaderProps = {
  title: string;
  subtitle?: string;
  rangeLabel: string;
  canGoPrev?: boolean;
  canGoNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  viewMode: "week" | "day";
  onViewModeChange?: (v: "week" | "day") => void;
};
```

Responsibilities:

- navigation and view mode switch
- compact display of active date range

---

## 3) `PeriodGridFiltersBar`

```ts
export type PeriodGridFilters = {
  showLessons: boolean;
  showExams: boolean;
  showExceptions: boolean;
  showHoliday: boolean;
  showBreak: boolean;
  showExamPeriod: boolean;
  showPopQuizChips: boolean;
  showAssignmentDueChips: boolean;
};

type PeriodGridFiltersBarProps = {
  value: PeriodGridFilters;
  onChange: (next: PeriodGridFilters) => void;
};
```

Responsibilities:

- all visibility controls
- exception subtype toggles

---

## 4) `PeriodGridDayHeader`

```ts
type PeriodGridDayHeaderProps = {
  day: PeriodGridDay;
  isToday?: boolean;
  onExceptionClick?: (exceptionId: string) => void;
};
```

Responsibilities:

- day label
- exception ribbons with tooltip triggers

---

## 5) `PeriodRowLabel`

```ts
type PeriodRowLabelProps = {
  period: PeriodGridPeriod;
  density: "comfortable" | "compact";
};
```

Responsibilities:

- render period name and time range

---

## 6) `PeriodCell`

```ts
type PeriodCellProps = {
  cell: PeriodGridCell;
  day: PeriodGridDay;
  period: PeriodGridPeriod;
  role: "admin" | "teacher" | "student";
  density: "comfortable" | "compact";
  filters: PeriodGridFilters;
  interactions?: PeriodGridInteractionHandlers;
};
```

Responsibilities:

- render cell state and background tint
- render lesson block, exam blocks, chips
- manage click targets and hover previews

---

## 7) `LessonBlockCard`

```ts
type LessonBlockCardProps = {
  lesson: LessonBlockVM;
  density: "comfortable" | "compact";
  muted?: boolean; // e.g. cancelled / blocked contexts
  onClick?: () => void;
};
```

Responsibilities:

- show title + teacher/room + status
- span visual style for multi-period lessons

---

## 8) `ExamInlineCard`

```ts
type ExamInlineCardProps = {
  exam: ExamInlineVM;
  density: "comfortable" | "compact";
  onClick?: () => void;
};
```

Responsibilities:

- render exam identity and category state
- compact vs expanded rendering

---

## 9) `CellMetaChips`

```ts
type CellMetaChipsProps = {
  chips: CellChipVM[];
  density: "comfortable" | "compact";
};
```

Responsibilities:

- standard chip rendering for quiz/due/warnings

---

## 10) `ScheduleDetailsDrawer`

```ts
type ScheduleDetailsDrawerProps = {
  open: boolean;
  context:
    | { type: "lesson"; lessonSessionId: number }
    | { type: "exam"; examId: number }
    | { type: "exception"; exceptionId: string }
    | null;
  role: "admin" | "teacher" | "student";
  onClose: () => void;
};
```

Responsibilities:

- contextual details and role-appropriate actions
- preserve existing modals/actions where possible

---

## Adapter Contracts (API -> ViewModel)

## Input

Use existing calendar API payload from:

- `/api/schools/[schoolId]/calendar/instances`

## Output builders

Provide pure functions:

```ts
function buildPeriodGridModel(params: {
  events: CalendarInstanceEventDTO[];
  periods: Array<{ id: string; name: string; order: number; startTime: string; endTime: string }>;
  rangeStartIso: string;
  rangeEndIso: string;
  timezone: string;
}): {
  model: PeriodGridViewModel;
  cellsByKey: Record<string, PeriodGridCell>;
}
```

Key rules:

1. stable sort by period order then event priority
2. deterministic conflict marking
3. idempotent output for same input

---

## Rendering Precedence Rules

Within one period cell, render in this order:

1. exception background state
2. lesson block
3. exam inline blocks
4. metadata chips
5. empty-state affordance (if none above)

Conflict classification:

- `blocked`: exception should suppress normal emphasis
- `conflict`: invalid overlap/state requiring warning affordance

---

## Accessibility Contracts

Each `PeriodCell` should expose:

- `role="gridcell"`
- `aria-label`: includes day + period + primary state summary
- keyboard focus and Enter/Space activation

Each ribbon/chip should have:

- tooltip text available to screen readers
- color-independent icon or text differentiation

---

## Performance Contracts

1. Adapter functions must be memoizable.
2. `cellsByKey` object should be stable across no-op updates.
3. Avoid re-rendering all cells on single selection changes.
4. Defer drawer-heavy data fetching until selection.

---

## Telemetry (Optional but Recommended)

Capture client events:

- filter toggles used
- lesson/exam/exception click rate
- switch between legacy and period-grid view
- render time for week load

This helps validate UX effectiveness post-rollout.

---

## Implementation Checklist

- [ ] Add shared `types` file for period-grid contracts
- [ ] Build adapter utilities with unit tests
- [ ] Implement base grid shell + headers
- [ ] Implement `PeriodCell` states and content blocks
- [ ] Integrate details drawer with existing actions
- [ ] Hook filters to visibility logic
- [ ] Add accessibility attributes and keyboard support
- [ ] Optimize render and memoization
- [ ] Add integration/e2e coverage for key interactions

