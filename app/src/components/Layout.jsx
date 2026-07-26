import { NavLink, Outlet } from "react-router-dom";
import HouseMark from "./HouseMark";
import { useAuth } from "../lib/AuthContext";
import { useHousehold } from "../lib/HouseholdContext";
import { formatCurrency } from "../lib/format";

const NAV_ITEMS = [
  { to: "/compare", label: "Compare" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/household-budget", label: "Household Budget" },
  { to: "/inputs", label: "Inputs" },
  { to: "/monthly-cost", label: "Monthly Cost" },
  { to: "/cash-to-close", label: "Cash to Close" },
  { to: "/affordability", label: "Affordability" },
  { to: "/tax-impact", label: "Tax Impact" },
  { to: "/scenarios", label: "Scenarios" },
  { to: "/amortization", label: "Amortization" },
  { to: "/transactions", label: "Transactions" },
  { to: "/access", label: "Access" },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const { propertyList, selectedPropertyId, setSelectedPropertyId, selectedProperty } =
    useHousehold();

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-brand">
          <HouseMark size={40} />
          <div className="header-brand-text">
            <span className="wordmark">
              home<span className="accent">·</span>budget
            </span>
            <span className="header-tagline">Royal Oak House Hunt</span>
          </div>
        </div>
        <div className="header-actions">
          <span className="header-user">{user?.email}</span>
          <button className="btn-secondary" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {propertyList.length > 0 && (
        <div className="property-selector">
          <label htmlFor="property-select">Viewing</label>
          <select
            id="property-select"
            value={selectedPropertyId || ""}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
          >
            {propertyList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address?.value || p.id}
                {p.listPrice?.value ? ` — ${formatCurrency(p.listPrice.value)}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="layout-with-sidebar">
        <nav className="nav-tabs">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => "nav-tab" + (isActive ? " active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="main-content">
          <Outlet context={{ selectedProperty }} />
        </div>
      </div>
    </div>
  );
}
