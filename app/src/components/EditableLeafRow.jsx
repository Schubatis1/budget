import { useEffect, useRef, useState } from "react";
import { updateDoc } from "firebase/firestore";
import { fieldValue, fieldNeedsReview, fieldNote } from "../lib/fields";
import { humanizeKey } from "../lib/labels";

const DEBOUNCE_MS = 700;

// A single editable input row for the Inputs screen, per BUILD_SPEC.md:
// "Each field shows its current value, its color-coded status..., and its
// note text inline... Edits write directly to Firestore (debounce writes;
// don't fire one on every keystroke)."
//
// `containerFieldPath`, when the field lives inside a container that was
// itself flagged inheritsFrom="default" (a property's loan/propertyTax/
// carryingCosts block), lets an edit also detach that container from the
// household default going forward, per the Data Model's inheritance note.
export default function EditableLeafRow({
  docRef,
  fieldPath,
  field,
  label,
  containerFieldPath,
  isInherited,
}) {
  const value = fieldValue(field);
  const needsReview = fieldNeedsReview(field);
  const note = fieldNote(field);
  const isNumber = typeof value === "number";

  const [draft, setDraft] = useState(value === null || value === undefined ? "" : String(value));
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saved
  const timeoutRef = useRef(null);

  useEffect(() => {
    setDraft(value === null || value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e) {
    const raw = e.target.value;
    setDraft(raw);
    setSaveState("pending");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => commit(raw), DEBOUNCE_MS);
  }

  async function commit(raw) {
    const parsed = isNumber ? (raw === "" ? 0 : Number(raw)) : raw;
    if (Number.isNaN(parsed)) return;
    const update = {
      [`${fieldPath}.value`]: parsed,
      [`${fieldPath}.needsReview`]: false,
    };
    if (containerFieldPath) {
      update[`${containerFieldPath}.inheritsFrom`] = null;
    }
    await updateDoc(docRef, update);
    setSaveState("saved");
    setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
  }

  return (
    <div className={"input-row" + (needsReview ? " needs-review" : "")}>
      <div className="input-row-label">
        {humanizeKey(label)}
        {needsReview && <span className="status-badge" style={{ background: "var(--status-needsreview-bg)", color: "var(--status-needsreview)" }}>needs review</span>}
        {isInherited && <span className="status-badge inherited">household default</span>}
      </div>
      <div className="input-row-control">
        <input
          type={isNumber ? "number" : "text"}
          step="any"
          value={draft}
          onChange={handleChange}
          className={needsReview ? "input-needs-review" : "input-confirmed"}
        />
        {saveState === "pending" && <span className="input-save-state">saving…</span>}
        {saveState === "saved" && <span className="input-save-state saved">saved</span>}
      </div>
      {note && <div className="input-row-note">{note}</div>}
    </div>
  );
}
