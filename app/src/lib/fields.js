// Shared helpers for reading the { value, needsReview, note } leaf shape
// that the migration script wrote for every input field. See migrate.js's
// header comment and BUILD_SPEC.md's Data Model section for the "why".
export function fieldValue(f) {
  if (f === null || f === undefined) return null;
  return typeof f === "object" && "value" in f ? f.value : f;
}

export function fieldNeedsReview(f) {
  return typeof f === "object" && f !== null ? !!f.needsReview : false;
}

export function fieldNote(f) {
  return typeof f === "object" && f !== null ? f.note || "" : "";
}
