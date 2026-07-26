import EditableLeafRow from "./EditableLeafRow";
import { humanizeKey } from "../lib/labels";

function isLeaf(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val) && "value" in val;
}

function isContainer(val) {
  return typeof val === "object" && val !== null && !Array.isArray(val) && !("value" in val);
}

// Recursively renders a household/property section object as editable rows,
// entirely driven by the data's own shape ({ value, needsReview, note } for
// leaves, plain nested objects for sub-sections) -- no hardcoded per-field
// lookup table, per BUILD_SPEC.md's visual-language section.
export default function InputSection({ title, data, docRef, fieldPathPrefix = "", depth = 0, skipKeys = [] }) {
  if (!data) return null;
  const path = (key) => (fieldPathPrefix ? `${fieldPathPrefix}.${key}` : key);

  const inherited = data.inheritsFrom === "default";
  const skip = new Set(["_notes", "inheritsFrom", ...skipKeys]);
  const metaEntries = Object.entries(data).filter(
    ([k, v]) => !skip.has(k) && typeof v !== "object"
  );
  const leafEntries = Object.entries(data).filter(([k, v]) => !skip.has(k) && isLeaf(v));
  const containerEntries = Object.entries(data).filter(([k, v]) => !skip.has(k) && isContainer(v));

  return (
    <div className={depth === 0 ? "input-section" : "input-subsection"}>
      {title && (depth === 0 ? <h3>{title}</h3> : <h4>{title} {inherited && <span className="status-badge inherited">household default</span>}</h4>)}

      {metaEntries.length > 0 && (
        <div className="input-meta-chips">
          {metaEntries.map(([k, v]) => (
            <span key={k} className="input-meta-chip">{humanizeKey(k)}: {String(v)}</span>
          ))}
        </div>
      )}

      {leafEntries.map(([key, field]) => (
        <EditableLeafRow
          key={key}
          docRef={docRef}
          fieldPath={path(key)}
          field={field}
          label={key}
          isInherited={inherited}
          containerFieldPath={inherited ? fieldPathPrefix : undefined}
        />
      ))}

      {containerEntries.map(([key, sub]) => (
        <InputSection
          key={key}
          title={humanizeKey(key)}
          data={sub}
          docRef={docRef}
          fieldPathPrefix={path(key)}
          depth={depth + 1}
        />
      ))}

      {data._notes && data._notes.length > 0 && (
        <div className="input-general-notes">
          {data._notes.map((n, i) => <p key={i}>{n}</p>)}
        </div>
      )}
    </div>
  );
}
