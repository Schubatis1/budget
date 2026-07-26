// Editable 0-5 star rating, matching the "A ★★★★★ / L ★★★★★" pattern from
// the Aqi-Watch open-house page. Tap a star to set the rating; tap the
// currently-set star again to clear it back to "not yet rated".
export default function StarRating({ personLabel, stars, onChange, readOnly = false }) {
  const value = stars ?? 0;
  return (
    <div className="star-rating">
      <span className="star-rating-person">{personLabel}</span>
      <span className="star-rating-stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            className={"star" + (n <= value ? " filled" : "")}
            onClick={() => onChange && onChange(n === value ? null : n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            ★
          </button>
        ))}
      </span>
      {stars === null || stars === undefined ? (
        <span className="star-rating-unrated">not yet rated</span>
      ) : null}
    </div>
  );
}
