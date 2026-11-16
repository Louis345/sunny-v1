import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubjectPicker, type PickerPresentation, type ShelfSubject } from "../storybook/SubjectPicker";
import {
  CALM_PICTURES_CONFIG,
  CHALLENGE_CONFIG,
  ILA_SHELF,
  MOCK_TODAY,
  NOTHING_DUE_SHELF,
  ONE_SUBJECT_SHELF,
  PLAIN_LIST_CONFIG,
  REINA_SHELF,
  THREE_SUBJECT_SHELF,
} from "../storybook/subjectPickerFixtures";

// Mockups for owner sign-off (2026-11-16): one component, synthetic data. Every story differs only in its data.
const meta = { title: "Start screen/Subject picker (mockup)", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj;

const picker = (subjects: ShelfSubject[], config: PickerPresentation) => () => (
  <SubjectPicker subjects={subjects} config={config} today={MOCK_TODAY} onPick={(s) => console.log(` 🎮 [subject-picker] [pick] [mock] domain=${s.domain}`)} />
);

/** Spelling test Thursday (glowing, three moons = three sleeps) and an undated math packet. No words. */
export const IlaShelf: Story = { render: picker(ILA_SHELF, CALM_PICTURES_CONFIG) };

/** Division test Friday with a match countdown and her best to beat, plus a spelling list. */
export const ReinaShelf: Story = { render: picker(REINA_SHELF, CHALLENGE_CONFIG) };

/** The proof it is data-driven: the exact same shelf drawn from each child's config, side by side. */
export const SameShelfTwoLooks: Story = {
  render: () => (
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1 }}><SubjectPicker subjects={ILA_SHELF} config={CALM_PICTURES_CONFIG} today={MOCK_TODAY} /></div>
      <div style={{ flex: 1 }}><SubjectPicker subjects={ILA_SHELF} config={CHALLENGE_CONFIG} today={MOCK_TODAY} /></div>
    </div>
  ),
};

/** The owner's simpler alternative: a plain list, same data. */
export const PlainList: Story = { render: picker(ILA_SHELF, PLAIN_LIST_CONFIG) };

/** Edge: one subject. The config says skip, so the book opens by itself and she goes straight in. */
export const OneSubjectSkips: Story = { render: picker(ONE_SUBJECT_SHELF, CALM_PICTURES_CONFIG) };

/** Edge: nothing dated. No glow, no countdown; both books equal. */
export const NothingDue: Story = { render: picker(NOTHING_DUE_SHELF, CALM_PICTURES_CONFIG) };

/** Edge: three subjects on the challenge shelf. */
export const ThreeSubjects: Story = { render: picker(THREE_SUBJECT_SHELF, CHALLENGE_CONFIG) };

/** Edge: an empty shelf (all homework done). */
export const AllDone: Story = { render: picker([], CALM_PICTURES_CONFIG) };
