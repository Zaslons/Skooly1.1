# Auth, `schoolId`, and `SchoolMembership` (how the session works)

This document is the **canonical note** on how school context is resolved for logged-in users. Keep it updated when login or token payload changes.

**Target architecture** (identity = Auth, tenant = `SchoolMembership`): [`DOMAIN_MODEL.md`](../DOMAIN_MODEL.md).

**Implementation:** `src/lib/auth.ts` (`authenticateUser`, `selectSchoolMembership`, `verifyToken` / JWT payload), `getCurrentUserSchoolId()`, `requireSchoolAccess` (API routes), and `src/lib/schoolAccess.ts` (`findActiveMembership`, `assertSchoolAccessForServerUser` for server components and server actions).

---

## Membership-first access (current)

- **`SchoolMembership`** is **authoritative** for “may this user act in this school in this role?” An active row must exist for `(authId, schoolId, role)` with `isActive: true` (except **`system_admin`**, which bypasses membership checks where implemented).
- **`Auth.schoolId`** is optional and **not** used for authorization in API routes or server-side access checks. It may still appear on legacy rows or as a convenience default; **new flows** should not rely on it for permission.
- **Profile FKs on `SchoolMembership`** (`adminId`, `teacherId`, `studentId`, `parentId`) are **not unique**: the same profile row may be linked from multiple membership rows (e.g. multi-school teacher).
- **Students:** at most **one active student membership per `authId`** is enforced in the database (partial unique index on active student memberships) and should be enforced in application code on create/join paths.

---

## What the app uses at runtime (JWT / session)

After login, the **JWT** carries at least: `id`, `role`, **`schoolId`** (active tenant), optional **`profileId`**, optional **`membershipId`**. Helpers such as `getCurrentUserSchoolId()` read **`schoolId` from the token** (active school context after login or school switch).

### Login resolution (`authenticateUser`)

1. **System admin:** token behavior unchanged (no school membership required).
2. **School users:** after password validation, the flow **ensures `SchoolMembership` rows** exist from legacy profiles when possible (`ensureMembershipsFromProfiles`). If there are **still zero** memberships, login **fails** (seed and migrations should always create memberships so this is rare).
3. **One vs many memberships:** same as before; multi-membership users get `needsSchoolSelection` until they pick a school; `selectSchoolMembership` reissues the token.

### API routes under `/api/schools/[schoolId]/...`

Use **`requireSchoolAccess(request, schoolId)`** from `src/lib/auth.ts`. It loads the user from the JWT and checks **`findActiveMembership(user.id, schoolId, user.role)`**. Do **not** compare `user.schoolId` to `schoolId` for authorization.

### Server components and server actions

Use **`assertSchoolAccessForServerUser(authUser, schoolId)`** or **`userHasSchoolAccess`** from `src/lib/schoolAccess.ts` when the `schoolId` comes from the URL or form and must match an active membership.

---

## Middleware and deep links

**Phase 1 (current):** The first segment `/schools/[schoolId]/...` should match the **JWT `schoolId`** (active context). Users with multiple schools **switch school** (e.g. select-school flow) so the token updates before visiting another school’s URL. Allowing navigation to another school’s routes based only on membership **without** updating the JWT is a larger change and is deferred.

---

## Seed and development

After **`prisma migrate` / seed**, every school-scoped user in the demo data should have a corresponding **`SchoolMembership`** row. Login and `requireSchoolAccess` depend on this.

---

## Related

- [`DOMAIN_MODEL.md`](../DOMAIN_MODEL.md) — Auth, School, SchoolMembership.
