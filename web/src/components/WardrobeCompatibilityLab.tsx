import { DEFAULT_WARDROBE_INSPECTION, type WardrobeInspection } from "../lib/wardrobeInspection";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  WARDROBE_BODY_PROFILES,
  resolveWardrobeTemplateCertification,
  type WardrobeCompatibilityCase,
} from "../lib/wardrobeBodyProfiles";
import type { WardrobeStoreItem } from "../lib/wardrobeStore";
import "./WardrobeCompatibilityLab.css";

export type WardrobePreviewCalibration = {
  identityScale: number;
  identityOffsetY: number;
};

const SCALE_STEP = 0.04;
const OFFSET_STEP = 0.01;

function baseCalibration(
  testCase: WardrobeCompatibilityCase,
): WardrobePreviewCalibration {
  return {
    identityScale: testCase.identityScale ?? 1,
    identityOffsetY: testCase.identityOffsetY ?? 0,
  };
}

export function WardrobeCompatibilityLab({
  cases,
  items,
  renderSourceCompanion,
  renderCompanion,
  onExit,
}: {
  cases: readonly WardrobeCompatibilityCase[];
  items: readonly WardrobeStoreItem[];
  renderSourceCompanion: (testCase: WardrobeCompatibilityCase, inspection: WardrobeInspection) => ReactNode;
  renderCompanion: (
    testCase: WardrobeCompatibilityCase,
    item: WardrobeStoreItem,
    calibration: WardrobePreviewCalibration,
    inspection: WardrobeInspection,
  ) => ReactNode;
  onExit: () => void;
}) {
  const [inspection, setInspection] = useState(DEFAULT_WARDROBE_INSPECTION);
  const outfitItems = useMemo(
    () => items.filter((item) => item.asset.kind === "outfit"),
    [items],
  );
  const [selectedCaseId, setSelectedCaseId] = useState(cases[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState(
    outfitItems[0]?.id ?? "",
  );
  const [calibrationByCase, setCalibrationByCase] = useState<
    Record<string, WardrobePreviewCalibration>
  >({});
  const selectedCase = useMemo(
    () =>
      cases.find((testCase) => testCase.id === selectedCaseId) ?? cases[0],
    [cases, selectedCaseId],
  );
  const selectedItem = useMemo(
    () => outfitItems.find((item) => item.id === selectedItemId) ?? outfitItems[0],
    [outfitItems, selectedItemId],
  );
  const selectedCalibration = selectedCase
    ? calibrationByCase[selectedCase.id] ?? baseCalibration(selectedCase)
    : { identityScale: 1, identityOffsetY: 0 };

  const updateCalibration = (
    action: string,
    update: (current: WardrobePreviewCalibration) => WardrobePreviewCalibration,
  ) => {
    if (!selectedCase) return;
    setCalibrationByCase((currentByCase) => {
      const current = currentByCase[selectedCase.id] ?? baseCalibration(selectedCase);
      const next = update(current);
      console.log(
        ` 🎮 [wardrobe-certification-lab] calibration_changed result=preview_only companion=${selectedCase.companionId} action=${action} scale=${next.identityScale.toFixed(2)} offset_y=${next.identityOffsetY.toFixed(2)}`,
      );
      return { ...currentByCase, [selectedCase.id]: next };
    });
  };

  const templateId = selectedItem?.templateId ?? "";
  const certification = selectedCase
    ? resolveWardrobeTemplateCertification(selectedCase.companionId, templateId)
    : null;
  const approvedCount = cases.filter(
    (testCase) =>
      resolveWardrobeTemplateCertification(testCase.companionId, templateId)
        .status === "approved",
  ).length;

  useEffect(() => {
    if (!selectedCase || !selectedItem || !certification) return;
    console.log(
      ` 🎮 [wardrobe-certification-lab] preview_selected result=${certification.status} companion=${selectedCase.companionId} item=${selectedItem.id} template=${templateId}`,
    );
  }, [certification, selectedCase, selectedItem, templateId]);

  if (!selectedCase || !selectedItem || !certification) return null;
  const profile = WARDROBE_BODY_PROFILES[selectedCase.bodyProfileId];
  const statusCopy =
    certification.status === "approved"
      ? `Approved for ${selectedCase.companionName}’s store`
      : certification.status === "rejected"
        ? "Rejected — excluded from store"
        : "Quarantined — human review required";

  return (
    <section
      aria-label="VRM clothing compatibility lab"
      className="wardrobe-compatibility-lab"
      data-case-id={selectedCase.id}
      data-item-id={selectedItem.id}
      data-certification-status={certification.status}
      data-model-url={selectedCase.modelUrl}
    >
      <header className="wardrobe-compatibility-lab__header">
        <div>
          <span>Diagnostic sandbox · only approved pairings enter the store</span>
          <h1>Wardrobe Certification Lab</h1>
        </div>
        <div className="wardrobe-compatibility-lab__header-actions">
          <strong>{approvedCount} of {cases.length} companions approved</strong>
          <button type="button" onClick={onExit}>Back to showroom</button>
        </div>
      </header>

      <main className="wardrobe-compatibility-lab__stage">
        <div className="wardrobe-compatibility-lab__comparison">
          <section
            className="wardrobe-compatibility-lab__pane"
            aria-label={`Original ${selectedCase.companionName}`}
          >
            <span>Original character</span>
            <div className="wardrobe-compatibility-lab__viewport">
              {renderSourceCompanion(selectedCase, inspection)}
            </div>
          </section>
          <section
            className="wardrobe-compatibility-lab__pane"
            aria-label={`Wardrobe fit ${selectedCase.companionName}`}
          >
            <span>Wardrobe fit</span>
            <div className="wardrobe-compatibility-lab__viewport">
              {renderCompanion(selectedCase, selectedItem, selectedCalibration, inspection)}
            </div>
          </section>
        </div>
        <div className="wardrobe-compatibility-lab__caption">
          <div>
            <span>
              {selectedCase.kind === "reference"
                ? "Approved reference"
                : selectedCase.kind === "prepared" ? "Prepared complete identity · candidate" : "Standard-body identity candidate"}
            </span>
            <h2>{selectedCase.companionName} · {selectedItem.name}</h2>
            <p>{certification.reason}</p>
          </div>
          <div
            className={`wardrobe-compatibility-lab__status is-${certification.status}`}
          >
            {statusCopy}
          </div>
        </div>
      </main>

      <aside className="wardrobe-compatibility-lab__sidebar" aria-label="Compatibility cases">
        <div className="wardrobe-compatibility-lab__outfits">
          <span>Outfit variants</span>
          <div role="group" aria-label="Outfits to certify">
            {outfitItems.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-label={`Preview ${item.name}`}
                aria-pressed={item.id === selectedItem.id}
                onClick={() => setSelectedItemId(item.id)}
              >
                <i
                  aria-hidden
                  style={{
                    background:
                      item.asset.kind === "outfit"
                        ? item.asset.materialVariant.tint
                        : "#756882",
                  }}
                />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="wardrobe-compatibility-lab__profile">
          <label>Inspection view<select aria-label="Inspection view" value={inspection.view} onChange={event => setInspection({...inspection, view:event.target.value as WardrobeInspection["view"]})}>
            <option value="front">Front</option><option value="side">Side</option><option value="back">Back</option><option value="face">Face close-up</option>
          </select></label>
          <label>Inspection movement<select aria-label="Inspection movement" value={inspection.pose} onChange={event => setInspection({...inspection, pose:event.target.value as WardrobeInspection["pose"]})}>
            <option value="idle">Idle</option><option value="blink">Blink</option><option value="speak">Mouth open</option><option value="head-turn">Head turn</option><option value="arms-up">Arms raised</option><option value="elbows-bent">Elbows bent</option><option value="leg-swing">Leg swing (synthetic)</option>
          </select></label>
          <label>Inspection accessory<select aria-label="Inspection accessory" value={inspection.accessory} onChange={event => setInspection({...inspection, accessory:event.target.value as WardrobeInspection["accessory"]})}>
            <option value="none">None</option><option value="crown">Crown</option><option value="cat-ears">Cat ears</option><option value="halo">Halo</option>
          </select></label>
        </div>
        {selectedCase.kind !== "prepared" && <div className="wardrobe-compatibility-lab__calibration">
          <div>
            <span>Preview calibration</span>
            <strong>{selectedCalibration.identityScale.toFixed(2)}× head</strong>
            <small>{selectedCalibration.identityOffsetY >= 0 ? "+" : ""}{selectedCalibration.identityOffsetY.toFixed(2)} vertical</small>
          </div>
          <div className="wardrobe-compatibility-lab__calibration-controls">
            <button
              type="button"
              aria-label="Decrease head size"
              onClick={() => updateCalibration("scale_down", (current) => ({
                ...current,
                identityScale: Math.max(0.76, current.identityScale - SCALE_STEP),
              }))}
            >−</button>
            <button
              type="button"
              aria-label="Increase head size"
              onClick={() => updateCalibration("scale_up", (current) => ({
                ...current,
                identityScale: Math.min(1.48, current.identityScale + SCALE_STEP),
              }))}
            >+</button>
            <button
              type="button"
              aria-label="Move head up"
              onClick={() => updateCalibration("move_up", (current) => ({
                ...current,
                identityOffsetY: Math.min(0.12, current.identityOffsetY + OFFSET_STEP),
              }))}
            >↑</button>
            <button
              type="button"
              aria-label="Move head down"
              onClick={() => updateCalibration("move_down", (current) => ({
                ...current,
                identityOffsetY: Math.max(-0.12, current.identityOffsetY - OFFSET_STEP),
              }))}
            >↓</button>
            <button
              type="button"
              aria-label="Reset calibration"
              onClick={() => updateCalibration("reset", () => baseCalibration(selectedCase))}
            >Reset</button>
          </div>
        </div>

        }
        <div className="wardrobe-compatibility-lab__profile">
          <span>Body profile</span>
          <strong>{selectedCase.bodyProfileId}</strong>
          <p>{profile.classificationBasis}</p>
          <dl>
            <div><dt>Head-to-foot</dt><dd>{profile.bindPoseMetrics.headToFoot.toFixed(3)}</dd></div>
            <div><dt>Shoulder span</dt><dd>{profile.bindPoseMetrics.shoulderBoneSpan.toFixed(3)}</dd></div>
            <div><dt>Upper arm</dt><dd>{profile.bindPoseMetrics.upperArm.toFixed(3)}</dd></div>
            <div><dt>Upper leg</dt><dd>{profile.bindPoseMetrics.upperLeg.toFixed(3)}</dd></div>
          </dl>
        </div>

        <nav aria-label="Character model reviews">
          {cases.map((testCase) => {
            const caseCertification = resolveWardrobeTemplateCertification(
              testCase.companionId,
              templateId,
            );
            return (
              <button
                type="button"
                key={testCase.id}
                aria-label={`Review ${testCase.label}`}
                aria-pressed={testCase.id === selectedCase.id}
                data-certification-status={caseCertification.status}
                onClick={() => setSelectedCaseId(testCase.id)}
              >
                <span>{testCase.companionName}</span>
                <small>{testCase.kind === "reference" ? "store reference" : "identity proof"}</small>
                <b>{caseCertification.status === "approved" ? "Approved" : "Review"}</b>
              </button>
            );
          })}
        </nav>
      </aside>
    </section>
  );
}
