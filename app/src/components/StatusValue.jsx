// Renders a Firestore leaf field ({ value, needsReview, note, ... }) with the
// blue/yellow/green color-coding from BUILD_SPEC.md's visual-language table,
// driven entirely by the field's own needsReview/note data -- no hardcoded
// per-field lookup table.
//
// format: (value) => string, defaults to identity/String(value).
export default function StatusValue({ field, format, inherited = false, label }) {
  if (field === null || field === undefined) {
    return <span className="status-value status-computed">—</span>;
  }

  // Tolerate being handed a raw primitive (e.g. a value that was never
  // wrapped, or already unwrapped by a caller).
  const isWrapped = typeof field === "object" && "value" in field;
  const value = isWrapped ? field.value : field;
  const needsReview = isWrapped ? !!field.needsReview : false;
  const note = isWrapped ? field.note : "";

  const displayValue = format ? format(value) : String(value);

  if (needsReview) {
    return (
      <div className="needs-review-wrap">
        <span className="needs-review-label">
          ⚠ Needs review{label ? ` — ${label}` : ""}
        </span>
        <span className="status-value">{displayValue}</span>
        {note && <span className="needs-review-note">{note}</span>}
      </div>
    );
  }

  return (
    <span className="status-value">
      <span className={inherited ? "status-inherited" : "status-confirmed"}>
        {displayValue}
      </span>
      {inherited && <span className="status-badge inherited">household default</span>}
      {note && !inherited && (
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{note}</span>
      )}
    </span>
  );
}

export function ComputedValue({ children }) {
  return (
    <span className="status-value">
      <span className="status-computed">{children}</span>
      <span className="status-badge computed">computed</span>
    </span>
  );
}
