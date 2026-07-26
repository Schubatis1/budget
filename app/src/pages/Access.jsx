import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db, HOUSEHOLD_ID } from "../lib/firebase";
import { useHousehold } from "../lib/HouseholdContext";
import { useAuth } from "../lib/AuthContext";

// Per BUILD_SPEC.md screen #12: doesn't need to be fancy. Any allowlisted
// household member can manage the list here (there's no separate "owner"
// role in the data model -- meta only tracks allowlistedUids) -- reasonable
// for a two-or-three-person household tool. The Firestore rules already
// permit this: an allowlisted UID can update the household doc, including
// this array, same as any other household field.
export default function Access() {
  const { household } = useHousehold();
  const { user } = useAuth();
  const [newUid, setNewUid] = useState("");
  const [busy, setBusy] = useState(false);

  const uids = household.meta?.allowlistedUids || [];
  const householdRef = doc(db, "households", HOUSEHOLD_ID);

  async function addUid() {
    const trimmed = newUid.trim();
    if (!trimmed || uids.includes(trimmed)) return;
    setBusy(true);
    try {
      await updateDoc(householdRef, { "meta.allowlistedUids": [...uids, trimmed] });
      setNewUid("");
    } finally {
      setBusy(false);
    }
  }

  async function removeUid(uid) {
    if (uid === user.uid) {
      const confirmed = window.confirm(
        "This is your own account. Removing it will lock you out immediately. Continue?"
      );
      if (!confirmed) return;
    }
    setBusy(true);
    try {
      await updateDoc(householdRef, { "meta.allowlistedUids": uids.filter((u) => u !== uid) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-screen">
      <h2>Access management</h2>

      <div className="card">
        <h3>Who's allowlisted</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 12 }}>
          Only these Firebase user IDs can read or write this household's data -- checked on
          every request by the Firestore Security Rules, not just at login.
        </p>
        <div className="access-uid-list">
          {uids.map((uid) => (
            <div key={uid} className="access-uid-row">
              <code>{uid}</code>
              {uid === user.uid && <span className="status-badge inherited">you</span>}
              <button className="btn-secondary" disabled={busy} onClick={() => removeUid(uid)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Add someone</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 12 }}>
          Have them sign up on the login screen with their own email. Once signed up (but before
          being added), they'll see an "Access not yet granted" screen showing their user ID --
          paste it here.
        </p>
        <div className="editable-field-row">
          <input
            type="text"
            placeholder="Firebase user ID"
            value={newUid}
            onChange={(e) => setNewUid(e.target.value)}
            style={{ width: 320 }}
          />
          <button className="btn-primary" disabled={busy || !newUid.trim()} onClick={addUid}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
