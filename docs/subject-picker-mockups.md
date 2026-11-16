# Subject picker mockups (for owner sign-off, 2026-11-16)

Storybook only: `Start screen/Subject picker (mockup)` in `web/src/stories/SubjectPicker.stories.tsx`. It uses synthetic data, has no server wiring, and leaves the live start screen unchanged. Screenshots are in `docs/screenshots/subject-picker/`.

- **One component, two inputs.** `SubjectPicker` takes a *shelf* (subjects) and a *presentation config*. It has no per-child branches. Ila's and Reina's screens differ only in their data, and `SameShelfTwoLooks` draws one shelf both ways.
- **Shelf from the chart.** In the later PR, the shelf for each child comes from her chart: the latest unfinished assignment per subject, with goal kind (test/worksheet), due date, the Planner's suggestion, and her best checked score. The order follows one rule for every child: suggested first, then the soonest due date.
- **Look from the profile.** The config holds text level, motion, book size, due cue (`glow`, `sleeps`, `countdown`, `beatBest`), whether to skip the picker when she has one subject, palette and companion. It lives in each child's profile, so a new child needs only a new config.
- **New subject = one row.** `DOMAIN_LOOK` is the single registry of each subject's picture and colours. A new subject is one row there, and no picker code changes.
- **Edge cases.** With one subject the picker is skipped and the book opens by itself (`singleSubject: "skip"`). With nothing due, no book is marked. With three subjects the books share one shelf. With none, the screen shows the companion and a moon.
- **Recommendation: the shelf.** It is the same code as the plain list (`layout: "list"` is one config value), so it costs nothing extra. It also follows "don't make me think": pictures and moons for Ila, a countdown and a best score for Reina. Keep the list as a grown-up/debug view. Skip the picker when there is only one subject, so a child with one assignment never has a choice to make.
