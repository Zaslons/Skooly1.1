import { describe, expect, it } from "vitest";
import { Day, LessonDeliveryMode } from "@prisma/client";
import { lessonSchema } from "@/lib/formValidationSchemas";

describe("lessonSchema deliveryMode", () => {
  it("accepts ONLINE with no room", () => {
    const parsed = lessonSchema.safeParse({
      name: "Math",
      day: Day.MONDAY,
      startTime: new Date("2025-01-06T09:00:00"),
      endTime: new Date("2025-01-06T10:00:00"),
      subjectId: 1,
      classId: 1,
      teacherId: "cmxxxxxxxxxxxxxxxxxxxxxxxx",
      deliveryMode: LessonDeliveryMode.ONLINE,
      roomId: null,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.deliveryMode).toBe(LessonDeliveryMode.ONLINE);
      expect(parsed.data.roomId).toBeNull();
    }
  });

  it("defaults deliveryMode to IN_PERSON when omitted", () => {
    const parsed = lessonSchema.safeParse({
      name: "Math",
      day: Day.MONDAY,
      startTime: new Date("2025-01-06T09:00:00"),
      endTime: new Date("2025-01-06T10:00:00"),
      subjectId: 1,
      classId: 1,
      teacherId: "cmxxxxxxxxxxxxxxxxxxxxxxxx",
      roomId: 1,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.deliveryMode).toBe(LessonDeliveryMode.IN_PERSON);
    }
  });

  it("accepts ONLINE with optional meeting URL and label", () => {
    const parsed = lessonSchema.safeParse({
      name: "Math",
      day: Day.MONDAY,
      startTime: new Date("2025-01-06T09:00:00"),
      endTime: new Date("2025-01-06T10:00:00"),
      subjectId: 1,
      classId: 1,
      teacherId: "cmxxxxxxxxxxxxxxxxxxxxxxxx",
      deliveryMode: LessonDeliveryMode.ONLINE,
      roomId: null,
      meetingUrl: "https://example.com/zoom",
      meetingLabel: "Zoom",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.meetingUrl).toBe("https://example.com/zoom");
      expect(parsed.data.meetingLabel).toBe("Zoom");
    }
  });

  it("rejects meeting URL when delivery is IN_PERSON", () => {
    const parsed = lessonSchema.safeParse({
      name: "Math",
      day: Day.MONDAY,
      startTime: new Date("2025-01-06T09:00:00"),
      endTime: new Date("2025-01-06T10:00:00"),
      subjectId: 1,
      classId: 1,
      teacherId: "cmxxxxxxxxxxxxxxxxxxxxxxxx",
      deliveryMode: LessonDeliveryMode.IN_PERSON,
      roomId: 1,
      meetingUrl: "https://example.com/oops",
    });
    expect(parsed.success).toBe(false);
  });
});
