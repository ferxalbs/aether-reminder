import { describe, expect, test } from "bun:test";
import { parseLocalReminderInput } from "./localIntentParser";

const NOW = new Date(2026, 7, 9, 18, 3, 0, 0);

describe("parseLocalReminderInput", () => {
  test("parses English tomorrow, time and priority locally", () => {
    const intent = parseLocalReminderInput("Buy milk tomorrow at 8am !high", {
      now: NOW,
      timezone: "America/Lima",
    });

    expect(intent).toEqual({
      title: "Buy milk",
      dueDate: "2026-08-10",
      dueTime: "08:00",
      dueTimezone: "America/Lima",
      priority: "high",
      signals: ["priority", "date", "time"],
    });
  });

  test("parses Spanish relative reminders without model inference", () => {
    const intent = parseLocalReminderInput(
      "Llamar a mamá en 20 minutos !alta",
      {
        now: NOW,
        timezone: "America/Lima",
      },
    );

    expect(intent.title).toBe("Llamar a mamá");
    expect(intent.dueDate).toBe("2026-08-09");
    expect(intent.dueTime).toBe("18:23");
    expect(intent.priority).toBe("high");
    expect(intent.signals).toEqual(["priority", "relative", "date", "time"]);
  });

  test("parses Spanish explicit date and 24-hour time", () => {
    const intent = parseLocalReminderInput(
      "Enviar reporte hoy a las 18:30 !media",
      {
        now: NOW,
        timezone: "America/Lima",
      },
    );

    expect(intent.title).toBe("Enviar reporte");
    expect(intent.dueDate).toBe("2026-08-09");
    expect(intent.dueTime).toBe("18:30");
    expect(intent.priority).toBe("medium");
  });

  test("preserves the existing Today / any-time default when no signal exists", () => {
    const intent = parseLocalReminderInput("Read book", {
      now: NOW,
      timezone: "America/Lima",
    });

    expect(intent).toEqual({
      title: "Read book",
      dueDate: "2026-08-09",
      dueTime: null,
      dueTimezone: "America/Lima",
      priority: "medium",
      signals: [],
    });
  });
});
