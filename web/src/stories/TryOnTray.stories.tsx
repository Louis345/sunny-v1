import type { Meta, StoryObj } from "@storybook/react-vite";
import { TryOnTray, type TryOnEntry } from "../components/TryOnTray";
import { REWARD_CATALOG } from "../../../src/shared/rewardCatalog";

const meta = { title: "Wardrobe/Try-on tray", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj;

const item = (id: string) => REWARD_CATALOG.find(row => row.id === id)!;
// Princess with what Ila owns tonight (2026-11-15): dresses and the blazer fit; cat ears do not yet; two are locked.
const entries: TryOnEntry[] = [
  { item: item("outfit:sky-ribbon-dress"), owned: true, fits: true, tint: "#7cc8ff", worn: true },
  { item: item("outfit:navy-ribbon-dress"), owned: true, fits: true, tint: "#26215c", worn: false },
  { item: item("outfit:plum-ribbon-dress"), owned: true, fits: true, tint: "#9b6ad6", worn: false },
  { item: item("outfit:teal-ribbon-dress"), owned: true, fits: true, tint: "#3fbfa8", worn: false },
  { item: item("outfit:constellation-blazer"), owned: true, fits: true, worn: false },
  { item: item("outfit:cat-ears"), owned: true, fits: false, worn: false },
  { item: item("outfit:sunset-ribbon-dress"), owned: false, fits: true, chest: "epic", worn: false },
  { item: item("outfit:rose-ribbon-dress"), owned: false, fits: true, chest: "legendary", worn: false },
];
export const PrincessTonight: Story = {
  render: () => (
    <div style={{ position: "relative", width: 1200, height: 780, background: "linear-gradient(#cfd8f0,#f3e6f0)" }}>
      <div style={{ position: "absolute", left: "50%", top: 80, transform: "translateX(-50%)", width: 260, height: 480, borderRadius: 130, background: "rgba(255,255,255,.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>Princess (live 3D)</div>
      <TryOnTray entries={entries} onWear={() => {}} onOriginal={() => {}} onClose={() => {}} companionName="Princess" />
    </div>
  ),
};

// Christmas drop 2026 (S5): the set is a second row of greyed shapes that fill in as she wins them.
const christmas: TryOnEntry[] = REWARD_CATALOG.filter(row => row.season === "christmas-2026").map(row => ({
  item: row, owned: ["outfit:santa-hat", "outfit:holly-ribbon-dress", "outfit:reindeer-antlers"].includes(row.id), fits: true, worn: row.id === "outfit:santa-hat",
  chest: row.rarity, ...(row.id === "outfit:holly-ribbon-dress" ? { tint: "#e8323f" } : {}),
}));
export const ChristmasRow: Story = {
  render: () => (
    <div style={{ position: "relative", width: 1200, height: 780, background: "linear-gradient(#cfd8f0,#f3e6f0)" }}>
      <TryOnTray entries={[...entries.slice(0, 5), ...christmas]} onWear={() => {}} onOriginal={() => {}} onClose={() => {}} companionName="Elli" />
    </div>
  ),
};
