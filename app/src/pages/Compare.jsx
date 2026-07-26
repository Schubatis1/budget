import { useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db, HOUSEHOLD_ID } from "../lib/firebase";
import { useHousehold } from "../lib/HouseholdContext";
import { formatCurrency } from "../lib/format";
import { monthlyPrincipalAndInterest } from "../lib/mortgage";
import { fieldValue, fieldNeedsReview } from "../lib/fields";
import StarRating from "../components/StarRating";

const SORT_OPTIONS = [
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating-desc", label: "Highest rated first" },
  { value: "completeness-desc", label: "Most complete data first" },
];

// Data-completeness score: fraction of the "basic facts" fields that are NOT
// flagged needsReview. Surfaces properties with only a confirmed price (per
// BUILD_SPEC.md calc note #12) as visibly less complete, not silently equal.
const COMPLETENESS_FIELDS = [
  "address", "listPrice", "sqft", "beds", "bathsFull", "yearBuilt", "architecturalStyle", "hoaMonthly",
];

function completenessScore(property) {
  const total = COMPLETENESS_FIELDS.length;
  const confirmed = COMPLETENESS_FIELDS.filter((k) => !fieldNeedsReview(property[k])).length;
  return confirmed / total;
}

function avgRating(property) {
  const a = property.ratings?.adam?.stars;
  const l = property.ratings?.lauren?.stars;
  const vals = [a, l].filter((v) => typeof v === "number");
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

export default function Compare() {
  const { propertyList, setSelectedPropertyId } = useHousehold();
  const navigate = useNavigate();
  const [sort, setSort] = useState("price-asc");
  const [compareIds, setCompareIds] = useState([]);
  const MAX_COMPARE = 4;

  // Stable "House N" numbering, independent of the current sort order, so
  // renumbering doesn't happen every time someone changes the sort.
  const badgeNumberById = useMemo(() => {
    const byAddress = [...propertyList].sort((a, b) =>
      (fieldValue(a.address) || a.id).localeCompare(fieldValue(b.address) || b.id)
    );
    const map = {};
    byAddress.forEach((p, i) => { map[p.id] = i + 1; });
    return map;
  }, [propertyList]);

  const sorted = useMemo(() => {
    const list = [...propertyList];
    switch (sort) {
      case "price-desc":
        return list.sort((a, b) => (fieldValue(b.listPrice) || 0) - (fieldValue(a.listPrice) || 0));
      case "rating-desc":
        return list.sort((a, b) => (avgRating(b) ?? -1) - (avgRating(a) ?? -1));
      case "completeness-desc":
        return list.sort((a, b) => completenessScore(b) - completenessScore(a));
      case "price-asc":
      default:
        return list.sort((a, b) => (fieldValue(a.listPrice) || 0) - (fieldValue(b.listPrice) || 0));
    }
  }, [propertyList, sort]);

  function toggleCompare(id) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  }

  async function setRating(propertyId, person, stars) {
    await updateDoc(doc(db, "households", HOUSEHOLD_ID, "properties", propertyId), {
      [`ratings.${person}.stars`]: stars,
    });
  }

  const compareProperties = propertyList.filter((p) => compareIds.includes(p.id));

  return (
    <div className="compare-screen">
      <div className="compare-toolbar">
        <h2>Compare houses</h2>
        <div className="compare-sort">
          <label className="field-label" htmlFor="sort-select">Sort by</label>
          <select id="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="property-grid">
        {sorted.map((p) => (
          <PropertyCard
            key={p.id}
            property={p}
            badgeNumber={badgeNumberById[p.id]}
            selected={compareIds.includes(p.id)}
            onToggleCompare={() => toggleCompare(p.id)}
            onSetRating={(person, stars) => setRating(p.id, person, stars)}
            onOpenDashboard={() => { setSelectedPropertyId(p.id); navigate("/dashboard"); }}
          />
        ))}
      </div>

      {compareProperties.length > 0 && (
        <ComparePanel properties={compareProperties} badgeNumberById={badgeNumberById} />
      )}
    </div>
  );
}

function PropertyCard({ property, badgeNumber, selected, onToggleCompare, onSetRating, onOpenDashboard }) {
  const address = fieldValue(property.address) || property.id;
  const price = fieldValue(property.listPrice);
  const sqft = fieldValue(property.sqft);
  const beds = fieldValue(property.beds);
  const bathsFull = fieldValue(property.bathsFull);
  const facts = [
    beds != null ? `${beds} bd` : null,
    bathsFull != null ? `${bathsFull} ba` : null,
    sqft ? `${sqft.toLocaleString()} sqft` : null,
  ].filter(Boolean);
  const factsIncomplete = fieldNeedsReview(property.sqft) || fieldNeedsReview(property.beds) || fieldNeedsReview(property.bathsFull);
  const completeness = Math.round(completenessScore(property) * 100);

  return (
    <div className={"property-card" + (selected ? " selected" : "")}>
      <div className="property-card-badge">HOUSE {badgeNumber}</div>

      <button className="property-card-body" onClick={onOpenDashboard} type="button">
        <div className="property-card-address">{address}</div>
        <div className="property-card-price">{price ? formatCurrency(price) : "Price TBD"}</div>

        {factsIncomplete ? (
          <div className="needs-review-wrap" style={{ marginTop: 6 }}>
            <span className="needs-review-label">⚠ Facts not fully gathered</span>
            <span style={{ fontSize: "0.85rem" }}>{facts.length ? facts.join(" · ") : "No details yet"}</span>
          </div>
        ) : (
          <div className="property-card-facts">{facts.join(" · ")}</div>
        )}

        <div className="property-card-completeness">
          <div className="completeness-bar">
            <div className="completeness-fill" style={{ width: `${completeness}%` }} />
          </div>
          <span>{completeness}% of basic facts confirmed</span>
        </div>
      </button>

      <div className="property-card-ratings">
        <StarRating
          personLabel="A"
          stars={property.ratings?.adam?.stars ?? null}
          onChange={(stars) => onSetRating("adam", stars)}
        />
        <StarRating
          personLabel="L"
          stars={property.ratings?.lauren?.stars ?? null}
          onChange={(stars) => onSetRating("lauren", stars)}
        />
      </div>

      <label className="property-card-compare-toggle">
        <input type="checkbox" checked={selected} onChange={onToggleCompare} />
        Compare
      </label>
    </div>
  );
}

function ComparePanel({ properties, badgeNumberById }) {
  return (
    <div className="card compare-panel">
      <h3>Compare properties</h3>
      <div className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>House</th>
              {properties.map((p) => (
                <th key={p.id}>HOUSE {badgeNumberById[p.id]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Address</td>
              {properties.map((p) => <td key={p.id}>{fieldValue(p.address) || p.id}</td>)}
            </tr>
            <tr>
              <td>Price</td>
              {properties.map((p) => <td key={p.id}>{formatCurrency(fieldValue(p.listPrice))}</td>)}
            </tr>
            <tr>
              <td>Est. monthly P&amp;I</td>
              {properties.map((p) => {
                const loanAmount = fieldValue(p.loan?.loanAmount);
                const rate = fieldValue(p.loan?.interestRateAnnual);
                const term = fieldValue(p.loan?.termYears);
                const pi = monthlyPrincipalAndInterest(loanAmount, rate, term);
                return <td key={p.id}>{formatCurrency(pi)}</td>;
              })}
            </tr>
            <tr>
              <td>Adam's rating</td>
              {properties.map((p) => (
                <td key={p.id}>{p.ratings?.adam?.stars ? "★".repeat(p.ratings.adam.stars) : "—"}</td>
              ))}
            </tr>
            <tr>
              <td>Lauren's rating</td>
              {properties.map((p) => (
                <td key={p.id}>{p.ratings?.lauren?.stars ? "★".repeat(p.ratings.lauren.stars) : "—"}</td>
              ))}
            </tr>
            <tr>
              <td>Data completeness</td>
              {properties.map((p) => <td key={p.id}>{Math.round(completenessScore(p) * 100)}%</td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 10 }}>
        DTI and monthly surplus will appear here once the Affordability screen is built --
        this table currently shows what can be computed from Compare-level data alone.
      </p>
    </div>
  );
}
