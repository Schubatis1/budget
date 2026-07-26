import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db, HOUSEHOLD_ID } from "./firebase";
import { useAuth } from "./AuthContext";

const HouseholdContext = createContext(null);

const SELECTED_PROPERTY_KEY = "budget:selectedPropertyId";

export function HouseholdProvider({ children }) {
  const { user, resolved } = useAuth();

  const [household, setHousehold] = useState(null);
  const [properties, setProperties] = useState(null); // { [id]: data }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPropertyId, setSelectedPropertyIdState] = useState(
    () => localStorage.getItem(SELECTED_PROPERTY_KEY) || null
  );

  useEffect(() => {
    // Per BUILD_SPEC.md: no financial data, no cached values, until Firebase
    // has confirmed the session AND the Security Rules allow the read.
    if (!resolved || !user) {
      setHousehold(null);
      setProperties(null);
      setLoading(!resolved);
      return;
    }

    setLoading(true);
    setError(null);

    const householdRef = doc(db, "households", HOUSEHOLD_ID);
    const unsubHousehold = onSnapshot(
      householdRef,
      (snap) => {
        setHousehold(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        // Most likely: authenticated but not on meta.allowlistedUids, which
        // Firestore surfaces as a permission-denied error, not an empty read.
        setError(err);
        setLoading(false);
      }
    );

    const propertiesRef = collection(db, "households", HOUSEHOLD_ID, "properties");
    const unsubProperties = onSnapshot(
      propertiesRef,
      (snap) => {
        const map = {};
        snap.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
        setProperties(map);
      },
      (err) => setError(err)
    );

    return () => {
      unsubHousehold();
      unsubProperties();
    };
  }, [resolved, user]);

  // Once properties load, make sure the persisted/selected id is actually
  // valid; fall back to the first property alphabetically by address.
  useEffect(() => {
    if (!properties) return;
    const ids = Object.keys(properties);
    if (ids.length === 0) return;
    if (selectedPropertyId && properties[selectedPropertyId]) return;
    setSelectedPropertyIdState(ids[0]);
  }, [properties, selectedPropertyId]);

  function setSelectedPropertyId(id) {
    setSelectedPropertyIdState(id);
    localStorage.setItem(SELECTED_PROPERTY_KEY, id);
  }

  const selectedProperty = useMemo(
    () => (properties && selectedPropertyId ? properties[selectedPropertyId] : null),
    [properties, selectedPropertyId]
  );

  const value = {
    household,
    properties,
    propertyList: useMemo(
      () => (properties ? Object.values(properties) : []),
      [properties]
    ),
    selectedPropertyId,
    setSelectedPropertyId,
    selectedProperty,
    loading,
    error,
  };

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used inside HouseholdProvider");
  return ctx;
}
