import { describe, expect, it } from "vitest";
import { hasRegisteredParentContact } from "@/lib/join/parentLinkEligibility";

describe("hasRegisteredParentContact", () => {
  it("returns false when both emails are empty", () => {
    expect(hasRegisteredParentContact({ parentEmail: null, authEmail: null })).toBe(false);
    expect(hasRegisteredParentContact({ parentEmail: "", authEmail: undefined })).toBe(false);
    expect(hasRegisteredParentContact({ parentEmail: "   ", authEmail: "  " })).toBe(false);
  });

  it("returns true when parent profile has email", () => {
    expect(
      hasRegisteredParentContact({ parentEmail: "a@school.edu", authEmail: null })
    ).toBe(true);
  });

  it("returns true when auth has email", () => {
    expect(
      hasRegisteredParentContact({ parentEmail: null, authEmail: "guardian@example.com" })
    ).toBe(true);
  });
});
