import { describe, it, expect } from "vitest";
import { stripSvgFences } from "../server/session-manager";

describe("SVG fence stripping", () => {
  it("strips ```svg fence", () => {
    const input = '```svg\n<svg width="100"><circle/></svg>\n```';
    expect(stripSvgFences(input)).toBe('<svg width="100"><circle/></svg>');
  });

  it("strips bare ``` fence", () => {
    const input = '```\n<svg><rect/></svg>\n```';
    expect(stripSvgFences(input)).toBe("<svg><rect/></svg>");
  });

  it("strips ```xml fence", () => {
    const input = '```xml\n<svg><text>hello</text></svg>\n```';
    expect(stripSvgFences(input)).toBe("<svg><text>hello</text></svg>");
  });

  it("leaves clean SVG untouched", () => {
    const input = '<svg width="100"><circle/></svg>';
    expect(stripSvgFences(input)).toBe(input);
  });

  it("handles fence with no newline", () => {
    const input = "```svg<svg><rect/></svg>```";
    expect(stripSvgFences(input)).toBe("<svg><rect/></svg>");
  });
});
