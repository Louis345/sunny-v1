import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReturnedWorkPage } from "../components/ReturnedWorkPage";

describe("ReturnedWorkPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the selected assignment identity and requires review before confirmation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ assignments: [{
        homeworkId: "hw-original", title: "Pashley multiplication", domain: "math",
      }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ draft: {
        homeworkId: "hw-original",
        source: { sourceId: "returned-work:one" },
        score: { earned: 1, possible: 2 },
        items: [{ itemId: "item-1", prompt: "4 groups of 5", childResponse: "20", correct: true, extractionConfidence: 0.72, constructLinks: [{ constructId: "math.multiplication.equal_groups", role: "primary", confidence: 0.9 }] }],
      } }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ interpretationStatus: "interpreted", reason: "interpreted" }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(<ReturnedWorkPage childId="reina" />);
    const assignment = await screen.findByRole("button", { name: /Pashley multiplication/i });
    fireEvent.click(assignment);
    const file = new File(["marked"], "marked.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Marked homework file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Review marked work" }));

    expect(await screen.findByText("4 groups of 5")).toBeTruthy();
    expect(screen.getByText("72% extraction confidence")).toBeTruthy();
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/learning/reina/assignments/hw-original/returned-work/extract");

    fireEvent.change(screen.getByLabelText("Result for 4 groups of 5"), { target: { value: "incorrect" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm results" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/learning/reina/assignments/hw-original/returned-work/returned-work%3Aone/confirm");
    const request = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body)).items[0].correct).toBe(false);
    expect(await screen.findByText("Evidence saved")).toBeTruthy();
  });
});
