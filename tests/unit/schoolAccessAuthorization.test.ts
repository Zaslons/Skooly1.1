import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    schoolMembership: {
      findFirst: vi.fn(),
    },
  },
}));

import prisma from "@/lib/prisma";
import { userHasSchoolAccess } from "@/lib/schoolAccess";

describe("userHasSchoolAccess", () => {
  beforeEach(() => {
    vi.mocked(prisma.schoolMembership.findFirst).mockReset();
  });

  it("allows system_admin without a membership lookup", async () => {
    const ok = await userHasSchoolAccess({ id: "auth1", role: "system_admin" }, "school_b");
    expect(ok).toBe(true);
    expect(prisma.schoolMembership.findFirst).not.toHaveBeenCalled();
  });

  it("returns true when an active SchoolMembership matches auth, school, and role", async () => {
    vi.mocked(prisma.schoolMembership.findFirst).mockResolvedValue({ id: "m1" } as never);
    const ok = await userHasSchoolAccess({ id: "auth1", role: "admin" }, "school_b");
    expect(ok).toBe(true);
    expect(prisma.schoolMembership.findFirst).toHaveBeenCalledWith({
      where: { authId: "auth1", schoolId: "school_b", role: "admin", isActive: true },
    });
  });

  it("returns false when no membership exists", async () => {
    vi.mocked(prisma.schoolMembership.findFirst).mockResolvedValue(null);
    const ok = await userHasSchoolAccess({ id: "auth1", role: "admin" }, "school_b");
    expect(ok).toBe(false);
  });
});
