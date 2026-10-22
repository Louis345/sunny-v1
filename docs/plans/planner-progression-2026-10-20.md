# Sunny learns from each experience

Jamal approved this plan for a plan-only PR and independent AI review on October 20, 2026. Implementation remains pending review and human authorization.

## The idea

Sunny should work like a thoughtful human tutor who remembers the child.

It starts with an understanding of what the child can do and a plan for helping. Before an experience, the Planner records what it expects that experience to achieve. Afterward, it looks at what actually happened: where the child improved, struggled, needed help, or lost interest. It reflects on whether its expectations were right and decides what would help next.

When Ila returns, Sunny continues from that understanding. The Planner decides how to learn more about her progress and what to do with her next. Her earlier work remains part of the story.

This is Sunny’s shared way of working across subjects. Each subject builds on it.

## A living board

The board is dynamic. Its activities, arrangement, and experience express the Planner’s current thinking about how to help this child and evolve with that understanding.

The aim is a coherent learning experience that stays interesting and responds to the child. The Planner uses its judgment and intuition to choose it. The Creator brings that plan to life visually. We give them the history and the ability to act on it.

As the child becomes ready and the Planner's expectations become better supported by what happens, it can introduce Quest and Boss experiences. Their quality will need its own human review.

## The first small change

Make the existing handoff after a completed board work: the Planner receives what happened, reflects on its previous plan, and produces the next plan. Sunny carries that plan into the next board and remembers it when the app restarts.

Today, Ila's completed work is saved, but the next Planner response was cut off and progression stopped. We will investigate and fix that existing path in a focused change. The next step is not a new planning system or a redesign of the app.

The implementation should help the AI perceive, remember, reflect, and act. Its educational judgment belongs to it. We are not writing its lesson or conversation for it.

## How we will know this step works

We finish a board, close Sunny, and come back. Sunny remembers the child's work, and the Planner has a sensible next plan that connects to what happened before. The next board reflects that plan. Restarting preserves it without repeating purchases or losing progress.

Automated tests verify the handoff, saved records, and restart behavior. The reviewer and the human examine the actual plan and experience: does it make sense for this child, and does the child find it helpful?

This first step does not prove improved learning. It makes the intended learning loop work so we can observe and improve it.

## How we will work

Jamal has approved the plan and requested a plan-only PR with independent AI review. We resolve that review together. Once implementation is authorized, we write failing tests, implement the focused change, and create a separate implementation PR. Human testing and explicit approval come before merging.

All changes stay on a task branch in a dedicated worktree. This draft is on `codex/planner-progression-plan`, based on `main` at `31face36`.

The existing learning authority is [LEARNING_FEEDBACK_LOOP.md](../../LEARNING_FEEDBACK_LOOP.md). [Investigation notes](./planner-progression-investigation-2026-10-20.md) retain the source evidence separately from this plain-English plan.
