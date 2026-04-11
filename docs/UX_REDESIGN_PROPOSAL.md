# Skooly UX Redesign Proposal

> **Date:** April 2026
> **Scope:** Full UX audit, user story analysis, information architecture redesign, and flow improvement proposals for the Skooly school management platform.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Core Problem](#2-the-core-problem)
3. [Current User Stories by Role](#3-current-user-stories-by-role)
4. [Flow-by-Flow Walkthrough: Is It Intuitive?](#4-flow-by-flow-walkthrough-is-it-intuitive)
5. [Systemic UX Problems](#5-systemic-ux-problems)
6. [New Information Architecture](#6-new-information-architecture)
7. [Merging Pages: What Combines With What](#7-merging-pages-what-combines-with-what)
8. [Role-Specific Sidebar Reduction](#8-role-specific-sidebar-reduction)
9. [Flow Redesigns: Step-by-Step Comparisons](#9-flow-redesigns-step-by-step-comparisons)
10. [Quick Wins (No IA Restructuring Needed)](#10-quick-wins-no-ia-restructuring-needed)
11. [The Mental Model Shift](#11-the-mental-model-shift)
12. [What's Already Good](#12-whats-already-good)
13. [Priority Roadmap](#13-priority-roadmap)

---

## 1. Executive Summary

Skooly has a **strong backend** — the data model, Prisma schema, scheduling engine, and server actions are solid. The problem is the **frontend user experience**: the app is organized around database entities (Students, Teachers, Classes, Exams, Assignments, Results...) instead of user goals ("How is my child doing?", "Set up my school", "Enter today's grades").

This document proposes a redesign that:
- Reduces the admin sidebar from **25+ flat items → 8 collapsible groups**
- Merges **14 separate CRUD pages** into **4 goal-oriented hubs**
- Cuts the "new school setup" flow from **15+ page visits → 5 wizard steps**
- Cuts the "parent checks on child" flow from **5+ pages → 1 page**
- Fixes **7 dead links** and **4 instances of fake/placeholder data**
- Adds breadcrumbs, active sidebar highlighting, required field markers, and loading skeletons

The redesign requires **no backend changes** — all improvements are frontend reorganization wrapping existing server actions and data queries.

---

## 2. The Core Problem

The app is organized like a **database admin panel** — one sidebar item per database table. That gives us 14+ separate pages for what are really just 4 user goals:

| User Goal | Current: Separate Pages | Proposed: Unified Hub |
|-----------|------------------------|----------------------|
| "Who is in my school?" | Students, Teachers, Parents, Grades, Join Codes, Bulk Import | **People** |
| "What do we teach and when?" | Academic Years, Terms, Classes, Curriculum, Subjects, Lessons, Bell Schedule, Calendar Exceptions, Timetable Assistant, Manage Schedule, Scheduling Setup, Scheduling Diagnostics | **Academics + Scheduling** |
| "How are students performing?" | Exams, Assignments, Results, Grading Scales, Attendance, Promotions | **Gradebook + Attendance** |
| "What's happening?" | Events, Announcements, Messages (broken) | **Communication** |

The fundamental redesign principle: **hide the data model, expose the user's goals.**

---

## 3. Current User Stories by Role

### 3.1 System Admin

| # | User Story | Status |
|---|-----------|--------|
| 1 | As a system admin, I can manage subscription plans (create, edit, activate/deactivate, delete) | Working |
| 2 | As a system admin, I can view and filter all school subscriptions | Working (but filters use raw UUIDs, not names) |
| 3 | As a system admin, I can access a dedicated dashboard | **Broken** — menu links to `/system/dashboard` which doesn't exist |
| 4 | As a system admin, I can manage my profile/settings | **Broken** — `/system/profile` and `/system/settings` routes don't exist |

### 3.2 School Admin

| # | User Story | Status |
|---|-----------|--------|
| 1 | As an admin, I can see a dashboard with school KPIs (student count, teacher count, attendance, demographics) | Working — polished |
| 2 | As an admin, I can CRUD students, teachers, parents, subjects, classes, grades, rooms | Working |
| 3 | As an admin, I can manage academic years, terms, and curriculum | Working |
| 4 | As an admin, I can create and manage exams, assignments, and view results | Working |
| 5 | As an admin, I can manage the bell schedule, calendar exceptions, and lesson timetable | Working |
| 6 | As an admin, I can use the timetable assistant for automated scheduling | Working |
| 7 | As an admin, I can manage grading scales and promotion rules | Working |
| 8 | As an admin, I can generate join codes for students/teachers/parents | Working |
| 9 | As an admin, I can bulk import data via CSV | Working |
| 10 | As an admin, I can manage school subscription/billing | Working (depends on Stripe keys) |
| 11 | As an admin, I can browse and invite teachers from the marketplace | Working |
| 12 | As an admin, I can view and manage schedule change requests | Working |
| 13 | As an admin, I can send messages to teachers/parents/students | **Broken** — Messages page 404 |
| 14 | As an admin, I can manage my profile and settings | **Incomplete** — profile page is extremely sparse; settings page doesn't exist |
| 15 | As an admin, I can install curriculum from a catalog | Working |
| 16 | As an admin, I can take attendance | **Gap** — admin has no attendance-taking flow (only view) |

### 3.3 Teacher

| # | User Story | Status |
|---|-----------|--------|
| 1 | As a teacher, I can see a dashboard with my class performance data | Working — shows per-class averages and struggling students |
| 2 | As a teacher, I can view my weekly schedule | Working |
| 3 | As a teacher, I can set my availability | Working |
| 4 | As a teacher, I can take attendance for my lessons | Working — one of the best flows |
| 5 | As a teacher, I can view my students and their parents | Working |
| 6 | As a teacher, I can manage my marketplace profile | Working |
| 7 | As a teacher, I can submit schedule change requests | Working |
| 8 | As a teacher, I can view/respond to marketplace invitations | Working |
| 9 | As a teacher, I can create exams and assignments | Working |
| 10 | As a teacher, I can enter student results/scores | Working (but one student at a time) |
| 11 | As a teacher, I can send messages | **Broken** — Messages page 404 |

### 3.4 Student

| # | User Story | Status |
|---|-----------|--------|
| 1 | As a student, I can see my academic summary (GPA, attendance rate, subject averages) | Working — good dashboard |
| 2 | As a student, I can view my class schedule | Working |
| 3 | As a student, I can view my attendance history | Working |
| 4 | As a student, I can view exams, assignments, and results | Working (via list pages) |
| 5 | As a student, I can join online lessons | Working (link shown when delivery mode is online) |
| 6 | As a student, I can send messages | **Broken** — Messages page 404 |

### 3.5 Parent

| # | User Story | Status |
|---|-----------|--------|
| 1 | As a parent, I can see all my children's academic summaries | Working — with child filter |
| 2 | As a parent, I can view my children's class schedules | Working |
| 3 | As a parent, I can see my children's subjects and teachers | Working (but no links to teacher profiles, phone not displayed) |
| 4 | As a parent, I can view attendance summary per child | **Partial** — overview works but "View Detailed Attendance" links 404 |
| 5 | As a parent, I can view events and announcements | Working |
| 6 | As a parent, I can send messages | **Broken** — Messages page 404 |

### 3.6 Onboarding / Multi-school

| # | User Story | Status |
|---|-----------|--------|
| 1 | As a new user, I can sign up and create a school | **Flawed** — school name collected at sign-up but discarded; must re-enter at `/create-school` |
| 2 | As a new user, I can join a school via join code | Working (but student join creates parent account unexpectedly) |
| 3 | As a multi-school user, I can switch between schools | Working (but Switch School button buried at sidebar bottom) |

---

## 4. Flow-by-Flow Walkthrough: Is It Intuitive?

### 4.1 Onboarding: New User Creates a School

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Visits landing page, clicks "Get Started" | Goes to `/sign-up` | Yes |
| 2 | Fills username, **school name**, email, password, confirm password | Submits form | **No** — school name is collected but **silently discarded** by the API. The backend only creates an auth account. User thinks they created a school. |
| 3 | Sees "Account created! Redirecting..." | Auto-redirects to `/sign-in` after 2s | **Confusing** — why redirect to login if I just signed up? Why not auto-login? |
| 4 | Logs in again with same credentials | API detects no `schoolId` on the JWT | Redundant friction |
| 5 | Auto-redirected to `/create-school` | Must enter school name **again** | **Bad** — user already typed this. Feels like the first form was broken. |
| 6 | Creates school | Token refreshed, redirected to admin dashboard | OK |
| 7 | Sees empty dashboard | No data, no guidance, no "what to do next" | **Lost** — admin has 25+ sidebar items but zero orientation |

**Verdict:** 7 steps, 2 are redundant, 1 is misleading. Should be 3 steps max.

**Fix:** Auto-login after sign-up. Actually use the school name from registration. Redirect new admins to the Setup Wizard (`/admin/setup`) with a "Welcome! Let's set up your school" flow.

---

### 4.2 Onboarding: User Joins via Code (Student Path)

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Gets a join code from their school | Goes to `/join` or clicks "Join with a code" from landing | Yes |
| 2 | Enters code, clicks Continue | API validates code, shows school name + class info | Yes |
| 3 | Fills out **parent** info + **student** info (~15 fields) | Submits | **Confusing** — the user came to join as a student but must also create a parent account. No explanation of why. Long form, no progress bar. |
| 4 | On success | Redirected, signed in as the **parent**, not the student | **Very confusing** — "I wanted to be a student, now I'm a parent?" |

**Verdict:** The "student joins" flow actually creates a parent-student pair. This is never explained to the user. No client-side validation (just plain state + server errors).

**Fix:** Explain the model upfront ("A parent account will be created to manage this student"). Add client-side validation. Consider allowing direct student accounts for older students.

---

### 4.3 Multi-School User Switches Schools

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Logs in | If >1 membership, sent to `/select-school` | Yes |
| 2 | Clicks a school card | POST, new token, redirected to role dashboard | Yes |
| 3 | Later, clicks "Switch School" in sidebar | Goes back to `/select-school` | **OK but hidden** — button is at very bottom of 25+ item sidebar |

**Fix:** Move "Switch School" to top bar next to school name.

---

### 4.4 Admin: Add a New Student

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Clicks "Students" in sidebar | List page loads | Yes |
| 2 | Clicks yellow "+" button | Modal opens with StudentForm | **Partially** — the "+" icon is small and unlabeled |
| 3 | Fills ~14 fields | Submits | **Problematic** — parent is **required** but there's no way to create a parent from this modal |
| 4 | Discovers parent required after submit failure | Must close, go create parent, come back | **Frustrating** |
| 5 | Re-opens form, selects parent, submits | Toast, modal closes, list refreshes | Yes |

**Fix:** Add "Create Parent" inline in StudentForm. Mark required fields. Consider multi-step wizard.

---

### 4.5 Admin: Create an Exam

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Clicks "Exams" → "+" button | ExamForm modal | OK |
| 2 | Fills category, title, times, duration, max score, weight, lesson | Submits | **Confusing** — "Lesson" is required but users think exams belong to a subject + class, not a lesson |

**Fix:** Replace "Lesson" dropdown with "Subject" + "Class" dropdowns that auto-resolve to a lesson behind the scenes.

---

### 4.6 Admin: View Student Academic Performance

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Students → view icon → student detail page | Profile card loads | Yes |
| 2 | Sees **Lorem ipsum placeholder text** | | **Bad** — looks unfinished |
| 3 | Sees "Performance" widget | **Hard-coded static chart** with fake 2024 data | **Very bad** — misleading |
| 4 | Sees attendance card | Real data | OK |
| 5 | Must use "Shortcuts" links to navigate to filtered Results list | Indirect | **No inline grade summary** |

**Fix:** Replace Performance with real data. Remove Lorem ipsum. Show actual subject averages inline.

---

### 4.7 Admin: Set Up Academic Year

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Academic Years → create year | Modal | OK |
| 2 | Click "Terms" on year row → sub-page | Create terms | OK but **no breadcrumb** |
| 3 | Back → "Classes" on year row → sub-page | Create classes | Same |
| 4 | Back → "Curriculum" on year row → sub-page | Create entries | Same |
| 5 | Optionally: School Profile → set country → Catalog Install → install template | 2 more pages | **Hidden dependency** |

**Verdict:** Split across 6+ pages with no wizard, no progress indicator, no breadcrumbs.

**Fix:** Single-page tabbed Academic Year Hub with a "New Year Wizard" for guided setup.

---

### 4.8 Teacher: Take Attendance

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Attendance → lesson cards | Sees all lessons | Yes |
| 2 | Click lesson → attendance page | "Take Attendance" button + history | Yes |
| 3 | Click → modal with per-student statuses | Fill and submit | **Good** |

**Verdict: This is one of the best flows in the app.** Clear, logical, minimal clicks.

**Gap:** No quick "today's classes" filter — teacher must scan all lessons to find today's.

---

### 4.9 Teacher: Enter Grades

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Results → "+" button | ResultForm modal | OK |
| 2 | Select exam vs assignment type | Toggle | OK |
| 3 | Select student, enter score, submit | Toast | OK |
| 4 | **Repeat for each student** | Must open modal 30+ times for a class | **Terrible** for bulk entry |

**Fix:** Spreadsheet-style grade entry grid — students as rows, exams as columns, click cells to enter scores.

---

### 4.10 Student: Check Grades

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Logs in → dashboard | Academic summary with averages | **Good** |
| 2 | Wants individual scores → Results in sidebar | Separate list page | OK but **no link from summary** |

**Fix:** Make subject averages on dashboard clickable → filtered results.

---

### 4.11 Parent: Check Child's Attendance

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Attendance → cards per child | See rates | Yes |
| 2 | Click "View Detailed Attendance" | **404 error** | **Broken** |

**Fix:** Create the `[childId]` route or expand details inline.

---

### 4.12 Parent: Understand Child's Situation

| Step | What user does | What happens | Intuitive? |
|------|---------------|-------------|------------|
| 1 | Dashboard → summary only | No drill-down | Partial |
| 2 | Attendance → 404 on detail | Broken | **Broken** |
| 3 | Results → generic list | Must search | OK |
| 4 | My Children → teachers list | No links, no phone | Dead-end |
| 5 | Exams → upcoming list | Must search | OK |

**Verdict:** 5+ pages to understand one child. Should be 1 page.

**Fix:** Unified child detail page with tabs: Grades, Attendance, Schedule, Teachers, Upcoming.

---

### Summary: Every Major Flow Rated

| Flow | Steps | Intuitive? | Broken? | Rating |
|------|-------|-----------|---------|--------|
| Sign up + create school | 7 | No — redundant steps, misleading form | School name discarded | 2/10 |
| Join via code (student) | 4 | No — creates parent unexpectedly | No | 4/10 |
| Switch schools | 3 | Partially — button is buried | No | 6/10 |
| Admin: add student | 5+ | No — hidden parent dependency | No | 4/10 |
| Admin: create exam | 3 | Partially — lesson model confusing | No | 6/10 |
| Admin: take attendance | N/A | **Can't** — admin has no attendance flow | Gap | 2/10 |
| Admin: view student perf | 3 | No — fake data, no real grades on detail | Misleading | 3/10 |
| Admin: setup academic year | 10+ | No — no wizard, no breadcrumbs | No | 3/10 |
| Admin: generate timetable | 10+ | No — 7 sidebar items, unclear order | No | 4/10 |
| Teacher: take attendance | 4 | Yes — clear flow | No | 8/10 |
| Teacher: create assignment | 3 | Yes | No | 7/10 |
| Teacher: enter grades | 3×N | No — one student at a time | No | 3/10 |
| Teacher: view schedule | 1–2 | Yes — two entry points | No | 9/10 |
| Student: check grades | 2 | Yes — good dashboard summary | No drill-down | 7/10 |
| Student: view schedule | 1 | Yes | No | 8/10 |
| Parent: check attendance | 3 | No — detail link is broken | **Yes — 404** | 2/10 |
| Parent: see teachers | 2 | Partial — no links or phone | Dead-end | 5/10 |
| Parent: check grades | 2 | Yes — dashboard + results list | No | 7/10 |

**Overall UX score: ~5/10** — Core data model and scheduling are strong, but user-facing flows have significant gaps in guidance, navigation, data integrity, and polish.

---

## 5. Systemic UX Problems

### 5.1 No Concept of "Where Am I"

- **Zero breadcrumbs** anywhere in the app.
- Sidebar has **no active state highlighting** — no item shows as "currently selected."
- The only location indicator is the school name in the top bar.
- When navigating to `/academic-years/{id}/terms`, there's no visual cue that you're inside a specific academic year.

**Impact:** Users get lost in deep pages and rely on browser back button.

### 5.2 Sidebar is a Flat Dump of 25+ Items (Admin)

Section headers (MAIN, PEOPLE, SCHOOL, SCHEDULING, ACADEMICS, ADMIN TOOLS, COMMUNICATION, OTHER) exist but are **not collapsible**. It's a scrollable wall of links. The SCHEDULING section alone has 9 items.

**Impact:** New admins are overwhelmed. Important items get buried. "Switch School" is at the very bottom.

### 5.3 No Progressive Onboarding

After creating a school, an admin lands on an empty dashboard with no guidance. The Setup Wizard exists (`/admin/setup`) but is **buried in the SCHEDULING section** — a new admin would never find it without reading documentation.

**Impact:** New admins don't know where to start.

### 5.4 Dead Links Everywhere

| Dead Link | Where | Who Sees It |
|-----------|-------|------------|
| Messages | Sidebar, all roles | Everyone |
| Settings | Sidebar, all roles | Everyone |
| System Dashboard | Sidebar, system admin | System admin |
| System Profile | Sidebar, system admin | System admin |
| System Settings | Sidebar, system admin | System admin |
| Parent Attendance Detail | "View Detailed Attendance" button | Parents |
| Navbar Attendance Icon | Top bar shortcut | All school roles |
| `/schools/{id}/profile` (no authId) | Edge case in Menu | Rare |

**Impact:** Every dead link erodes trust.

### 5.5 Forms Don't Show What's Required

Across **all 17+ forms**, almost none mark required fields with asterisks. Users fill a form, submit, and only then discover via red error text which fields were mandatory. The only exception: Lesson form marks start period with `*` in one mode.

**Impact:** Trial-and-error form completion.

### 5.6 Fake/Placeholder Data on Production Pages

| What | Where | Problem |
|------|-------|---------|
| Lorem ipsum text | Student detail, Teacher detail | Looks unfinished |
| Hard-coded "90%" attendance | Teacher detail | Misleading — not real data |
| Static Performance chart | Student detail | Shows fake 2024 data unrelated to the student |
| `charAt(0) + "th"` grade display | Student detail | Produces "1th", "2th" — grammatically wrong |
| Hard-coded FinanceChart | Admin dashboard | Static demo data, not from DB |

**Impact:** Users can't trust any data on these pages.

### 5.7 Inconsistent Feedback Patterns

| Pattern | Where | Issue |
|---------|-------|-------|
| Toast (bottom-right, dark theme) | Most CRUD forms | Good — consistent |
| Toast (top-right, colored theme) | Subscription page | **Different** — has its own duplicate `ToastContainer` |
| `alert()` / `confirm()` | Bulk import, system admin delete | **Jarring** — browser native dialogs |
| Plain text on white page | Auth failures | **Ugly** — no branded error page |
| Silent failure | Select school POST fails | **No feedback at all** |

### 5.8 Loading States Are Uneven

- Only **1 route** (`list/loading.tsx`) has a proper animated skeleton.
- Most pages show raw text `"Loading..."` or `<h1>Loading...</h1>`.
- No `Suspense` boundaries with skeleton fallbacks for most server components.
- No `error.tsx` or `not-found.tsx` files anywhere in the app.

### 5.9 Entity Relationships Are Not Navigable

The data model is rich (Student → Class → Grade → Lessons → Teacher → Subject) but the UI barely links them. From a class list, you can't click through to students or lessons. From a lesson row, you can't click to teacher or class. Parents list has **no view action at all**. Most table rows require clicking a tiny icon — the row itself is not clickable.

### 5.10 Two Conflicting Visual Systems

Marketing/auth pages use a warm palette (`#bf633f`, `#F5F3F0`) while the dashboard uses pastel "lama" colors (`lamaSky`, `lamaPurple`, `lamaYellow`). The transition feels like entering a different app.

### 5.11 Accessibility Gaps

- `InputField` has `<label>` without `htmlFor` — screen readers can't associate labels.
- Modals have no `aria-modal`, `role="dialog"`, or focus trap.
- `FormModal` close button has no `aria-label`.
- `TableSearch` icon has empty `alt`, no visible label.
- Marketing/auth inputs use `focus:outline-0 focus:ring-0` which removes keyboard focus visibility.

### 5.12 Mobile Sidebar Doesn't Collapse

The sidebar uses percentage widths but never converts to an off-canvas drawer on mobile. On small screens it becomes a cramped column.

---

## 6. New Information Architecture

### 6.1 Current Admin Sidebar (25+ items, flat)

```
MAIN:          Home
PEOPLE:        Teachers, Students, Parents
SCHOOL:        Grades, Classes, Subjects, Rooms, Academic Years
SCHEDULING:    Lessons, Manage Schedule, Scheduling Setup,
               Timetable Assistant, Whole-school Timetable,
               Bell Schedule, Calendar Exceptions, Pending Requests
ACADEMICS:     Exams, Assignments, Results, Attendance
ADMIN TOOLS:   Grading Scales, Promotions, Join Codes,
               Bulk Import, Subscription, Teacher Marketplace
COMMUNICATION: Events, Announcements, Messages
OTHER:         Profile, Settings, Logout
```

### 6.2 Proposed Admin Sidebar (8 groups, collapsible)

```
HOME               → Dashboard (with quick actions panel)

PEOPLE             → Unified people hub
  ├─ Students         (merged: student list + inline detail panel)
  ├─ Teachers         (merged: teacher list + inline detail panel)
  ├─ Parents          (merged: parent list + finally gets a view action)
  └─ Invite & Import  (merged: join codes + bulk import)

ACADEMICS          → Unified academic hub
  ├─ Academic Years      (merged: years + terms + classes + curriculum, tabbed)
  ├─ Subjects & Curriculum  (merged: subjects + curriculum + catalog install)
  └─ Gradebook           (merged: exams + assignments + results + grading scales)

SCHEDULING         → Unified scheduling hub
  ├─ Timetable          (merged: lessons + manage schedule + timetable assistant)
  ├─ Bell & Calendar     (merged: bell schedule + calendar exceptions + diagnostics)
  └─ Change Requests     (merged: pending requests + teacher requests view)

ATTENDANCE         → Top-level (daily action, deserves prominence)

COMMUNICATION      → Unified
  ├─ Announcements
  └─ Events & Calendar

SCHOOL SETTINGS    → Unified settings hub
  ├─ School Profile
  ├─ Rooms
  ├─ Promotions
  ├─ Subscription
  └─ Teacher Marketplace

[Profile / Logout]  → Bottom-pinned
```

**Result: 25+ items → 8 top-level groups. Every group is collapsible. Items within groups expand on click.**

---

## 7. Merging Pages: What Combines With What

### 7.1 Merge: "Gradebook" (Currently 5 Separate Pages → 1)

**Currently:** Exams, Assignments, Results, Grading Scales, and the Performance widget are all separate pages with no connection.

**Problem:** To see "how is Student X doing in Math?", an admin must visit 5 separate pages and do mental math.

**Proposed Gradebook page:**

| Tab | What It Shows | Merges |
|-----|--------------|--------|
| **By Class** | Grid: students as rows, exams/assignments as columns, scores in cells. Class average at bottom. Color-coded by grading scale. | Results list + Exams + Assignments |
| **By Student** | Single student: all subjects, all scores, weighted average, trend over terms. Link to parent. | Results filtered + student detail Performance widget |
| **By Subject** | Single subject across classes: class averages, distribution charts. | Results filtered + teacher dashboard class performance |
| **Grading Config** | Configure scales (existing page, as sub-tab or settings gear). | Grading Scales page |

**Actions available directly on the Gradebook:**
- Inline score entry (click a cell → type score → Tab to next)
- "Add Exam" / "Add Assignment" as column header actions
- Export to CSV
- Print report card per student

**Steps reduced:** Viewing a student's performance goes from **5 pages → 1 page, 1 click** (Gradebook → By Student tab → select student).

---

### 7.2 Merge: "Academic Year Setup" (Currently 6+ Pages → 1)

**Currently:** Academic Years, Terms, Classes (under AY), Curriculum, Catalog Install, and School Profile are separate pages requiring a specific (undocumented) order.

**Problem flow:**
```
Academic Years → create → Terms sub-page → create terms →
back → Classes sub-page → create classes → back →
Curriculum sub-page → create entries OR School Profile → set country →
Catalog Install → install template → back to Curriculum to verify
```

**Proposed Academic Year Hub (single page, tabbed):**

| Tab | Content | Merges |
|-----|---------|--------|
| **Overview** | Year name, dates, status, quick stats | Academic Years list |
| **Terms** | Inline term list with create/edit modals | Terms sub-page |
| **Classes & Enrollment** | Class list with capacity, grade, supervisor. Expand row → enrolled students. | Classes sub-page + Enrollments sub-page |
| **Curriculum** | Grade × Subject grid. "Install from Catalog" button opens inline wizard. Country/teaching system fields at top. | Curriculum sub-page + Catalog Install + School Profile fields |

**New Year Wizard** (appears when creating a new year):
```
Step 1: Name + Dates
Step 2: Terms (pre-fill from template or copy from last year)
Step 3: Classes (copy from last year or create new)
Step 4: Curriculum (install from catalog or copy from last year)
→ Done! "Your year is ready. Set up the timetable?"
```

**Steps reduced:** Setting up a year goes from **6+ page visits, 15+ clicks → 1 page, 4-step wizard**.

---

### 7.3 Merge: "Timetable" (Currently 7 Sidebar Items → 1)

**Currently:** Lessons, Manage Schedule, Scheduling Setup, Timetable Assistant, Whole-school Timetable, Bell Schedule, Calendar Exceptions — 7 separate sidebar items.

**Problem flow:**
```
Scheduling Setup (check readiness) → Bell Schedule (define periods) →
Lessons (create templates) → Timetable Assistant (auto-place) →
Manage Schedule (expand to term) → Calendar Exceptions (mark holidays) →
Back to Setup (verify) → Diagnostics (debug)
```

**Proposed Timetable Hub (single page, sections):**

| Section | Content | Merges |
|---------|---------|--------|
| **Readiness Bar** | Persistent top bar: "3/5 steps complete. Next: define bell periods." | Scheduling Setup page |
| **Weekly Grid** | Interactive period grid. Click cell → create/edit lesson. Drag to move. | Lessons list + Manage Schedule |
| **Auto-Schedule** | "Auto-fill" button opens assistant as panel/modal. Per-class or whole-school toggle. | Timetable Assistant + Whole-school Timetable |
| **Generate Term** | "Expand to Term" button with date range and options. Progress and result. | Manage Schedule generate function |

**Bell Schedule & Calendar (combined sub-page):**

| Section | Content | Merges |
|---------|---------|--------|
| **Bell Periods** | Existing bell schedule editor | Bell Schedule page |
| **Calendar Exceptions** | Existing exception editor, below or as tab | Calendar Exceptions page |
| **Diagnostics** | Collapsible audit log | Scheduling Diagnostics page |

**Steps reduced:** Creating a timetable goes from **7 sidebar items, 10+ page visits → 1 page with inline workflow**.

---

### 7.4 Merge: "People" (Currently 3 Lists + 2 Tools → 1)

**Currently:** Students, Teachers, Parents are separate list pages. Join Codes and Bulk Import are under "Admin Tools."

**Proposed People Hub:**

| Tab | Content | Merges |
|-----|---------|--------|
| **Students** | Student list. Row click → slide-out panel with: profile, class, grades summary, attendance rate, parent link. | Students list + Student detail page |
| **Teachers** | Teacher list. Row click → slide-out with: profile, subjects, classes, schedule mini-grid. | Teachers list + Teacher detail page |
| **Parents** | Parent list. Row click → slide-out with: children, attendance summary per child. | Parents list (currently has no view action) |
| **Invite & Import** | Join codes + Bulk import, side by side. "Invite" tab for codes, "Import" tab for CSV. | Join Codes + Bulk Import |

**Key changes:**
- Detail pages become **slide-out panels** — no full page navigation needed.
- Parents finally get a **view action**.
- "Add Student" includes **inline parent creation**.
- Entire rows are clickable (not just a tiny icon).

---

### 7.5 Merge: "Communication" (Currently 3 Items, 1 Broken → 1)

**Currently:** Events, Announcements, Messages (404).

**Proposed Communication Hub:**

| Tab | Content | Notes |
|-----|---------|-------|
| **Announcements** | Existing list + create. Add targeting: All / Grade X / Class Y. | Announcements page |
| **Events & Calendar** | Calendar view (existing) with list below. Click date → create event. | Events list + dashboard calendar widget merged |
| **Messages** | Remove from nav until built. | Currently 404 |

---

## 8. Role-Specific Sidebar Reduction

### 8.1 Teacher (15+ items → 6)

**Current:** Home, Students, Parents, Classes, Lessons, My Schedule, Availability, Marketplace Profile, My Change Requests, Exams, Assignments, Results, Attendance, Events, Announcements, Messages, Profile

**Proposed:**
```
HOME            → Dashboard (today's lessons at top, struggling students, announcements)
MY CLASSES      → Students I teach, class performance, quick grade entry
MY SCHEDULE     → Period grid + availability + change requests (merged via tabs)
ATTENDANCE      → Today's lessons → take attendance (one tap per lesson)
GRADEBOOK       → My exams/assignments, enter scores, view results
COMMUNICATION   → Announcements + Events combined
[MARKETPLACE]   → Profile + invitations + engagements (only if school has it enabled)
```

### 8.2 Student (8+ items → 4)

**Current:** Home, My Schedule, Exams, Assignments, Results, Attendance, Events, Announcements, Messages, Profile

**Proposed:**
```
HOME            → Dashboard (grades summary, today's schedule, upcoming exams)
MY GRADES       → All subjects, all scores, averages, trends
MY SCHEDULE     → Period grid + upcoming exams/assignments on timeline
SCHOOL NEWS     → Announcements + Events combined feed
```

### 8.3 Parent (8+ items → 3)

**Current:** Home, My Children, Exams, Assignments, Results, Attendance, Events, Announcements, Messages, Profile

**Proposed:**
```
HOME            → Dashboard (all children summaries at a glance, alerts)
MY CHILDREN     → Tab per child: Grades, Attendance, Schedule, Teachers, Upcoming — all in one!
SCHOOL NEWS     → Announcements + Events combined
```

**Key insight:** Currently a parent must visit 5 different pages to understand one child (Dashboard, My Children, Attendance, Results, Exams). All of this becomes **one page per child with tabs**.

---

## 9. Flow Redesigns: Step-by-Step Comparisons

### 9.1 Admin Adds 30 Students at Semester Start

**Current (per student: ~8 interactions, ×30 = 240 interactions):**
```
For each student:
  Sidebar → Students → [+] → Fill 14 fields → discover parent required →
  Close → Sidebar → Parents → [+] → Fill parent → Submit →
  Sidebar → Students → [+] → Fill student again → Select parent → Submit
```

**Proposed (bulk: ~5 interactions total):**
```
People → Import tab → Upload CSV → Preview table → Confirm
→ "30 students created. 15 new parent accounts generated."
→ "Download credentials PDF" (usernames + temporary passwords)
```

**Or individual with inline parent:**
```
People → Students tab → "Add Student" (labeled button) →
  Step 1: Student basics (name, sex, birthday, grade, class) — required fields marked *
  Step 2: "Select parent" or "Create new parent" (inline, 3 fields)
  Step 3: Auto-generated credentials shown with copy button
  → Done → "Add another" / "View student" / "Go to class"
```

---

### 9.2 Parent Checks on Their Child (Monday Morning)

**Current (5+ pages, 8+ clicks):**
```
Login → Select school → Dashboard (summary only, no drill-down) →
Sidebar → Attendance → See rate → "View Detail" → 404!
→ Back → Sidebar → Results → Search → See scores
→ Back → Sidebar → My Children → See teachers (no links)
→ Back → Sidebar → Exams → See upcoming
```

**Proposed (1 page, 2 clicks):**
```
Login → Dashboard (all children at a glance) →
Click child card → Child Detail Page:
  [Grades] [Attendance] [Schedule] [Teachers] [Upcoming]
Everything in one place. Tap any tab. Done.
```

---

### 9.3 Teacher Takes Attendance and Enters Grades

**Current (2 separate workflows, 6+ page visits):**
```
Attendance:
  Sidebar → Attendance → Find today's lesson → Click → Take Attendance →
  Fill statuses → Submit

Grades:
  Sidebar → Results → [+] → Select exam → Select student →
  Enter score → Submit → Repeat × 30 students (!)
```

**Proposed (1 unified workflow):**
```
Dashboard → "Today's Lessons" card → Click lesson →
  Tab 1: [Attendance] → Toggle statuses → Save
  Tab 2: [Grades] → Spreadsheet grid → Type scores → Tab between cells → Save all
Both done from one context. Never leave the lesson.
```

---

### 9.4 Admin Sets Up a Brand New School

**Current (unknown order, 10+ page visits, no guidance):**
```
Create school → Empty dashboard → ???
→ Find Academic Years (buried in SCHOOL) → Create year
→ Find Terms (button on year row) → Create terms
→ Find Grades (separate page) → Create grades
→ Find Classes (separate page) → Create classes
→ Find Subjects (separate page) → Create subjects
→ Find Bell Schedule (buried in SCHEDULING) → Define periods
→ Find Lessons (separate page) → Create 50+ lessons manually
→ Find Timetable Assistant (another page) → Auto-fill → ...
```

**Proposed (guided wizard, 5 steps):**
```
Create school → "Welcome to Skooly! Let's set up your school."

Step 1: BASICS
  School name, country, teaching system, timezone
  → Pre-selects curriculum catalog

Step 2: ACADEMIC YEAR
  Year name, start/end dates
  → Auto-creates 3 terms (editable)

Step 3: STRUCTURE
  "How many grade levels?" → slider or number input
  "Sections per grade?" → A/B/C selector
  → Auto-creates grades + classes

Step 4: CURRICULUM
  "Install from [Country] catalog?" → Yes (one click) / No (manual later)
  → Auto-creates subjects + curriculum entries

Step 5: SCHEDULE
  Bell period builder (visual drag interface)
  → "Auto-generate timetable?" → Yes → Done!

→ "Your school is ready! Here's your dashboard."
  Dashboard now shows real data.
```

**Steps reduced: ~15 page visits → 5 wizard steps.**

---

### 9.5 Admin Generates a Timetable

**Current (7 sidebar items, unclear order):**
```
Scheduling Setup → check what's missing →
Bell Schedule → define periods → back →
Lessons → create templates one by one → back →
Timetable Assistant → auto-fill per class → back →
Manage Schedule → generate term sessions → back →
Calendar Exceptions → mark holidays →
Scheduling Diagnostics → verify
```

**Proposed (1 page, readiness-driven):**
```
Timetable Hub → See readiness bar: "Missing: bell periods"
→ Click "Add Bell Periods" → Inline editor → Save
→ Readiness bar updates: "Missing: weekly lessons"
→ Click "Auto-fill" → Assistant runs → Preview → Confirm
→ Readiness bar updates: "Ready to generate!"
→ Click "Generate Term" → Progress bar → "Done! 6,294 sessions created."
→ Mark calendar exceptions if needed (inline section)
```

---

## 10. Quick Wins (No IA Restructuring Needed)

These improvements work with the **current page architecture** — no merging required:

| # | Quick Win | Effort | Impact |
|---|-----------|--------|--------|
| 1 | Remove Messages and Settings from sidebar (they 404) | 5 min | Eliminates 2 dead links for every user |
| 2 | Add `*` to required form fields across all forms | 1 hr | Eliminates trial-and-error on every form |
| 3 | Replace Lorem ipsum + fake data (Performance, "90%", FinanceChart) | 30 min | Removes 4+ trust-destroying elements |
| 4 | Add active sidebar highlighting (current route match) | 1 hr | Users always know where they are |
| 5 | Add breadcrumbs to academic year sub-pages | 2 hr | Eliminates "where am I?" in deepest flows |
| 6 | Make sidebar sections collapsible (with localStorage state) | 2 hr | Reduces visual overwhelm for admins |
| 7 | Add "Create Parent" button inside StudentForm modal | 2 hr | Eliminates the biggest form dependency pain |
| 8 | Fix parent attendance detail route (create `[childId]` page) | 1 hr | Fixes the #1 parent dead end |
| 9 | Auto-login after sign-up (skip redundant sign-in step) | 1 hr | Eliminates 1 redundant step for every new user |
| 10 | Redirect new schools to Setup Wizard after creation | 30 min | Gives new admins a starting point |
| 11 | Add `loading.tsx` skeletons to top 5 routes | 3 hr | Professional feel on most-visited pages |
| 12 | Make table rows clickable (not just tiny icon) | 2 hr | Matches every user's expectation |
| 13 | Fix system admin routes (redirect Home → `/system/plans`) | 15 min | Fixes 3 dead links for system admins |
| 14 | Remove duplicate `ToastContainer` from subscription page | 5 min | Eliminates double notification stacking |
| 15 | Add `error.tsx` and `not-found.tsx` at app root | 1 hr | Branded error pages instead of raw Next.js 404 |

**Total: ~18 hours of work for a dramatically improved baseline experience.**

---

## 11. The Mental Model Shift

### Current: "Navigate to the right database table"

The user must think: *"I want to see student grades. Grades come from Results. Results are linked to Exams. Exams are linked to Lessons. So I need the Results page, filtered by student."* This requires understanding the **data model**.

### Proposed: "What do you want to do?"

The user thinks: *"I want to see how my child is doing."* They click the child's name. Everything is there. They don't need to know that grades come from Results which come from Exams which come from Lessons.

| User Goal | Current Path | Proposed Path |
|-----------|-------------|---------------|
| "How is student X doing?" | Students → detail (fake data) → Results → search | Gradebook → By Student → select |
| "What's my child's schedule?" | Dashboard (partial) OR My Children (no schedule) | My Children → child → Schedule tab |
| "Set up my school" | 10+ pages, no guidance | Welcome Wizard → 5 steps |
| "Enter today's grades" | Results → [+] → one student at a time ×30 | Gradebook → class → spreadsheet grid |
| "Who teaches my child?" | My Children → list (no links, no phone) | My Children → child → Teachers tab (with profiles + contact) |
| "Is the timetable ready?" | Setup page (buried in sidebar) → 7 related pages | Timetable Hub → readiness bar at top |
| "Add people to my school" | 3 separate lists + 2 separate tool pages | People Hub → Import tab |
| "What happened this week?" | Dashboard (partial) + Events + Announcements separately | Communication Hub (combined timeline) |

---

## 12. What's Already Good

Not everything needs to change. These are genuine strengths:

- **Admin dashboard** — polished KPI cards, charts, calendar. Well-designed "at a glance" view.
- **Teacher dashboard** — practical class performance view with struggling students highlighted in red.
- **Student dashboard** — excellent academic summary with per-subject weighted averages.
- **Teacher attendance flow** — one of the best flows: clear, logical, minimal clicks.
- **Period grid component** — visually strong, used consistently across dashboards and schedule pages.
- **Scheduling engine** — the Setup pipeline, temporal rules, and constraint-solving timetable assistant are architecturally sound.
- **Multi-school architecture** — school switching, multi-membership, per-school data scoping all work correctly.
- **Join code system** — clever self-serve onboarding mechanism.
- **Teacher marketplace** — unique differentiating feature with profiles, invitations, engagements, needs.
- **Form validation** — Zod + react-hook-form pattern is consistently applied (execution needs polish, but the pattern is right).
- **Seed data** — creates a realistic multi-school environment for development.
- **Catalog install** — country-based curriculum templates are a productivity multiplier.

---

## 13. Priority Roadmap

### Phase 1: Fix What's Broken (Quick Wins)
**Goal:** Eliminate all dead links, fake data, and trust-destroying issues.
**Scope:** Items 1–15 from Section 10.

### Phase 2: Unify the Parent Experience
**Goal:** Parents can understand their child's full situation from one page.
**Scope:**
- Create unified child detail page with Grades / Attendance / Schedule / Teachers / Upcoming tabs.
- Merge "My Children" + attendance + results into one flow.
- Fix parent attendance detail route.
- Add teacher contact info and profile links.

### Phase 3: Build the Gradebook
**Goal:** Teachers and admins can view and enter grades efficiently.
**Scope:**
- Gradebook page with By Class / By Student / By Subject tabs.
- Spreadsheet-style inline score entry.
- Replace fake Performance widget with real data.
- Integrate grading scale visualization.

### Phase 4: Restructure Admin Navigation
**Goal:** Admin sidebar goes from 25+ items to 8 collapsible groups.
**Scope:**
- Collapsible sidebar sections.
- Active route highlighting.
- Merge scheduling pages into Timetable Hub.
- Merge academic year pages into tabbed hub.
- New School Setup Wizard.

### Phase 5: Polish and Accessibility
**Goal:** Professional, accessible experience.
**Scope:**
- Loading skeletons for all routes.
- Branded error and 404 pages.
- Breadcrumb system.
- Modal accessibility (focus trap, aria attributes).
- Mobile off-canvas sidebar.
- Unified notification pattern.

---

*This document was generated from a comprehensive code audit of the Skooly codebase, including analysis of all 60+ page routes, 17+ form components, the complete sidebar menu system, all server actions, the authentication flow, and manual testing of the running application across all 5 user roles.*
