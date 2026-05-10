import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUpdateMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: {
    joinCode: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

const mockGetServerUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  getServerUser: () => mockGetServerUser(),
}));

const mockUserHasSchoolAccess = vi.fn();
vi.mock("@/lib/schoolAccess", () => ({
  userHasSchoolAccess: (...args: unknown[]) => mockUserHasSchoolAccess(...args),
}));

import { deactivateJoinCodeAction } from "@/lib/actions/joinCodeActions";

describe("deactivateJoinCodeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerUser.mockResolvedValue({ id: "admin-1", role: "admin" });
    mockUserHasSchoolAccess.mockResolvedValue(true);
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("updates only join codes that belong to the given school", async () => {
    await deactivateJoinCodeAction("jc-1", "school-a");

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: "jc-1", schoolId: "school-a" },
      data: { isActive: false },
    });
  });

  it("reports failure when no row matches (wrong school or unknown id)", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const result = await deactivateJoinCodeAction("jc-other", "school-a");

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/not found/);
  });
});
