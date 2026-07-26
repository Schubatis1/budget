import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { HouseholdProvider, useHousehold } from "./lib/HouseholdContext";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Compare from "./pages/Compare";
import Dashboard from "./pages/Dashboard";
import HouseholdBudget from "./pages/HouseholdBudget";
import MonthlyCost from "./pages/MonthlyCost";
import CashToClose from "./pages/CashToClose";
import Affordability from "./pages/Affordability";
import Inputs from "./pages/Inputs";
import TaxImpact from "./pages/TaxImpact";
import Scenarios from "./pages/Scenarios";
import Amortization from "./pages/Amortization";
import Transactions from "./pages/Transactions";
import Access from "./pages/Access";

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

// Per BUILD_SPEC.md's Login screen requirement: render nothing (no financial
// data, no cached values) until Firebase has confirmed the session one way
// or the other.
function Gate() {
  const { user, resolved } = useAuth();

  if (!resolved) return <FullScreenMessage>Loading…</FullScreenMessage>;
  if (!user) return <Login />;

  return (
    <HouseholdProvider>
      <HouseholdGate />
    </HouseholdProvider>
  );
}

function HouseholdGate() {
  const { loading, error, household } = useHousehold();
  const { signOut, user } = useAuth();

  if (loading) return <FullScreenMessage>Loading household data…</FullScreenMessage>;

  if (error) {
    return (
      <div className="access-denied-screen">
        <div className="login-card">
          <h2>Access not yet granted</h2>
          <p style={{ marginTop: 10, color: "var(--muted)" }}>
            Signed in as <strong>{user.email}</strong>, but this account isn't
            on the household's allowlist yet. Ask the household owner to add
            your user ID (<code>{user.uid}</code>) to{" "}
            <code>meta.allowlistedUids</code> in the Firebase console.
          </p>
          <button className="btn-secondary" style={{ marginTop: 16 }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (!household) return <FullScreenMessage>No household data found.</FullScreenMessage>;

  return (
    <BrowserRouter basename="/budget">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/compare" replace />} />
          <Route path="compare" element={<Compare />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="household-budget" element={<HouseholdBudget />} />
          <Route path="inputs" element={<Inputs />} />
          <Route path="monthly-cost" element={<MonthlyCost />} />
          <Route path="cash-to-close" element={<CashToClose />} />
          <Route path="affordability" element={<Affordability />} />
          <Route path="tax-impact" element={<TaxImpact />} />
          <Route path="scenarios" element={<Scenarios />} />
          <Route path="amortization" element={<Amortization />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="access" element={<Access />} />
          <Route path="*" element={<Navigate to="/compare" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function FullScreenMessage({ children }) {
  return <div className="access-denied-screen">{children}</div>;
}
