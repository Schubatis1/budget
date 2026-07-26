// camelCase / kebab-case field name -> readable label, so section renderers
// don't need a hardcoded per-field label table (matches BUILD_SPEC.md's
// "drive the UI from the data, not a lookup table" principle).
export function humanizeKey(key) {
  return key
    .replace(/-/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\bHoa\b/, "HOA")
    .replace(/\bPct\b/, "%")
    .replace(/\bPmi\b/, "PMI")
    .replace(/\bDti\b/, "DTI")
    .replace(/\bFica\b/, "FICA")
    .replace(/\bHsa\b/, "HSA")
    .replace(/\bAgi\b/, "AGI")
    .replace(/\bSalt\b/, "SALT")
    .replace(/\bMfj\b/, "MFJ")
    .replace(/\bIrs\b/, "IRS");
}
