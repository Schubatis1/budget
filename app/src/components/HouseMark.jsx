// Original house-in-circle glyph, styled after (but not copied from) the
// House Hunters International show package -- see BUILD_SPEC.md's visual
// style section. Deliberately redrawn rather than using the actual HGTV/
// Scripps brand assets from assets/HHI_Rebrand_Deck.pdf, since this repo is
// public.
export default function HouseMark({ size = 32, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="48" fill="var(--coral)" />
      <path
        d="M50 20 L82 48 H72 V78 H58 V58 H42 V78 H28 V48 H18 Z"
        fill="var(--navy)"
      />
    </svg>
  );
}
