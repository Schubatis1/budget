import { useState } from "react";
import { updateDoc } from "firebase/firestore";
import { fieldValue, fieldNeedsReview, fieldNote } from "../lib/fields";

// A needsReview flag shown inline with a one-tap edit, per BUILD_SPEC.md's
// Dashboard requirement: "a one-tap way to edit it right there (writes
// straight back to Firestore)." Writes go to `${fieldPath}.value` and clear
// `${fieldPath}.needsReview`, on the given Firestore document reference.
export default function EditableField({ docRef, fieldPath, field, label, format, type = "number" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(fieldValue(field) ?? ""));
  const [saving, setSaving] = useState(false);

  const needsReview = fieldNeedsReview(field);
  const note = fieldNote(field);
  const value = fieldValue(field);

  async function save() {
    setSaving(true);
    const parsed = type === "number" ? Number(draft) : draft;
    try {
      await updateDoc(docRef, {
        [`${fieldPath}.value`]: parsed,
        [`${fieldPath}.needsReview`]: false,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!needsReview && !editing) return null;

  return (
    <div className="needs-review-wrap editable-field">
      <span className="needs-review-label">⚠ {label}</span>
      {editing ? (
        <div className="editable-field-row">
          <input
            type={type}
            step="any"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <button className="btn-primary" style={{ padding: "8px 14px" }} disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn-secondary" style={{ padding: "8px 14px" }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="editable-field-row">
          <span className="status-value">{format ? format(value) : value}</span>
          <button className="btn-secondary" style={{ padding: "6px 12px" }} onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      )}
      {note && <span className="needs-review-note">{note}</span>}
    </div>
  );
}
