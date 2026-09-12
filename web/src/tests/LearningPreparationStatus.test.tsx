import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LearningPreparationStatus } from "../components/LearningPreparationStatus";

describe("truthful learning preparation",()=>{
  it.each([{nodes:[]},{nodes:[{nodeId:"locked",status:"evidence_locked"}]}])("does not promise playable siblings when preparation failed without a ready activity",({nodes})=>{
    render(<LearningPreparationStatus status={{phase:"needs_attention",updatedAt:"now",nodes}} onCheck={vi.fn()} onFinish={vi.fn()}/>);
    expect(screen.getByRole("status").textContent).not.toContain("Ready activities are still available");
    expect(screen.getByRole("status").textContent).toContain("Saved work is safe");
    expect(screen.getByRole("button",{name:"Finish for now"})).toBeEnabled();
  });
  it("shows planning without inventing a percentage or future nodes",()=>{
    render(<LearningPreparationStatus status={{phase:"targeted_planning",updatedAt:"now",nodes:[]}} onCheck={vi.fn()} onFinish={vi.fn()}/>);
    expect(screen.getByRole("status").textContent).toContain("Choosing what to work on");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("button",{name:"Finish for now"})).toBeEnabled();
    expect(screen.queryByText(/100%|Quest|Boss/)).toBeNull();
  });
  it("counts verified artifacts without calling that a time estimate",()=>{
    render(<LearningPreparationStatus status={{phase:"board_generating",updatedAt:"now",nodes:[{nodeId:"a",status:"ready"},{nodeId:"b",status:"preparing"}]}} onCheck={vi.fn()}/>);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow","1");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax","2");
    expect(screen.getByText(/1 of 2 activities ready/)).toBeVisible();
  });
  it("offers read-only refresh and honest stopped status while ready siblings remain playable",()=>{
    const onCheck=vi.fn();
    render(<LearningPreparationStatus status={{phase:"needs_attention",updatedAt:"now",nodes:[{nodeId:"a",status:"ready"},{nodeId:"b",status:"needs_attention"}]}} paused onCheck={onCheck}/>);
    expect(screen.getByRole("status").textContent).toContain("Some activities need attention");
    fireEvent.click(screen.getByRole("button",{name:"Check progress"}));
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/All ready/)).toBeNull();
  });
});
