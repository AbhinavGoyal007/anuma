import { describe, expect, it } from "vitest";

import { displayValue, readableLabel } from "@/modules/intelligence/display";

describe("cleaning a stored value for display", () => {
  it("removes a prefix that only repeats the row's own label", () => {
    // Rendered raw this read as "BATTERY LIFE battery_life=im…", which looks
    // like leaked plumbing rather than a finding.
    expect(displayValue("battery_life", "battery_life=important")).toEqual({
      label: "battery_life",
      text: "Important",
    });
  });

  it("tolerates the spacing and case a machine happened to use", () => {
    expect(displayValue("Battery Life", "battery_life=important").text).toBe("Important");
    expect(displayValue("battery-life", "Battery Life=important").text).toBe("Important");
  });

  it("leaves a value alone when the prefix is a different word", () => {
    // Stripping this would delete a real distinction the customer drew.
    expect(displayValue("weight", "portability=important").text).toBe("portability=important");
  });

  it("never touches free text that merely contains an equals sign", () => {
    expect(displayValue("budget", "he said 35 = his ceiling").text).toBe(
      "he said 35 = his ceiling",
    );
  });

  it("does not merge two different spoken phrases", () => {
    // Near-synonyms stay separate: collapsing them would be inventing a
    // taxonomy the business never agreed to.
    const first = displayValue("driver", "battery life");
    const second = displayValue("driver", "Battery Life");
    expect(first.text).not.toBe(second.text);
  });

  it("keeps the label alone when the value was only ever the label", () => {
    expect(displayValue("weight", "weight=")).toEqual({ label: "weight", text: "" });
  });

  it("passes an unlabelled value straight through", () => {
    expect(displayValue(null, "architecture work using AutoCAD")).toEqual({
      label: null,
      text: "architecture work using AutoCAD",
    });
  });

  it("renders a label for reading", () => {
    expect(readableLabel("battery_life")).toBe("Battery life");
  });
});
