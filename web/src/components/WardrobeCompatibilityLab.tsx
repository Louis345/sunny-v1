import { useMemo, useState, type ReactNode } from "react";
import {
  WARDROBE_BODY_PROFILES,
  type WardrobeCompatibilityCase,
} from "../lib/wardrobeBodyProfiles";
import "./WardrobeCompatibilityLab.css";

export function WardrobeCompatibilityLab({
  cases,
  renderCompanion,
  onExit,
}: {
  cases: readonly WardrobeCompatibilityCase[];
  renderCompanion: (testCase: WardrobeCompatibilityCase) => ReactNode;
  onExit: () => void;
}) {
  const [selectedId, setSelectedId] = useState(cases[0]?.id ?? "");
  const selected = useMemo(
    () => cases.find((testCase) => testCase.id === selectedId) ?? cases[0],
    [cases, selectedId],
  );

  if (!selected) return null;
  const profile = WARDROBE_BODY_PROFILES[selected.bodyProfileId];

  return (
    <section
      aria-label="VRM clothing compatibility lab"
      className="wardrobe-compatibility-lab"
      data-case-id={selected.id}
      data-model-url={selected.modelUrl}
    >
      <header className="wardrobe-compatibility-lab__header">
        <div>
          <span>Diagnostic sandbox · candidate clothing never enters the store</span>
          <h1>Ribbon Dress Compatibility Lab</h1>
        </div>
        <button type="button" onClick={onExit}>Back to showroom</button>
      </header>

      <main className="wardrobe-compatibility-lab__stage">
        <div className="wardrobe-compatibility-lab__viewport">
          {renderCompanion(selected)}
        </div>
        <div className="wardrobe-compatibility-lab__caption">
          <div>
            <span>
              {selected.kind === "reference"
                ? "Approved reference"
                : selected.kind === "standardized_identity"
                  ? "Standard-body identity candidate"
                  : "Source-model candidate"}
            </span>
            <h2>{selected.label}</h2>
            <p>{selected.modelUrl}</p>
          </div>
          <div className={`wardrobe-compatibility-lab__status is-${selected.dressQaStatus}`}>
            {selected.dressQaStatus === "approved"
              ? "Approved for store"
              : "Candidate — human review required"}
          </div>
        </div>
      </main>

      <aside className="wardrobe-compatibility-lab__sidebar" aria-label="Compatibility cases">
        <div className="wardrobe-compatibility-lab__profile">
          <span>Body profile</span>
          <strong>{selected.bodyProfileId}</strong>
          <p>{profile.classificationBasis}</p>
          <dl>
            <div><dt>Head-to-foot</dt><dd>{profile.bindPoseMetrics.headToFoot.toFixed(3)}</dd></div>
            <div><dt>Shoulder span</dt><dd>{profile.bindPoseMetrics.shoulderBoneSpan.toFixed(3)}</dd></div>
            <div><dt>Upper arm</dt><dd>{profile.bindPoseMetrics.upperArm.toFixed(3)}</dd></div>
            <div><dt>Upper leg</dt><dd>{profile.bindPoseMetrics.upperLeg.toFixed(3)}</dd></div>
          </dl>
        </div>
        <nav aria-label="Character model reviews">
          {cases.map((testCase) => (
            <button
              type="button"
              key={testCase.id}
              aria-label={`Review ${testCase.label}`}
              aria-pressed={testCase.id === selected.id}
              onClick={() => setSelectedId(testCase.id)}
            >
              <span>{testCase.companionName}</span>
              <small>
                {testCase.kind === "reference"
                  ? "store reference"
                  : testCase.kind === "standardized_identity"
                    ? "identity proof"
                    : testCase.bodyProfileId}
              </small>
              <b>{testCase.dressQaStatus === "approved" ? "Approved" : "Review"}</b>
            </button>
          ))}
        </nav>
      </aside>
    </section>
  );
}
