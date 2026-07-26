// One-time-run correctness check for firestore.rules, executed against the
// Firestore emulator (never against production). Run via `npm run rules:test`
// from the repo root, which starts the emulator, runs this file, then tears
// the emulator down.
//
// The single most important case, per BUILD_SPEC.md: an authenticated user
// who is NOT on the household's allowlist must be denied, on the household
// doc and on every nested subcollection. A rules file that only checks
// `request.auth != null` would pass every "signed in" test but fail this one.

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const fs = require("fs");
const path = require("path");
const { setDoc, doc, getDoc, collection, getDocs } = require("firebase/firestore");

const HOUSEHOLD_ID = "test-household";
const OWNER_UID = "owner-uid";
const INTRUDER_UID = "intruder-uid";

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: "budget-70742-rules-test",
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "..", "firestore.rules"), "utf8"),
    },
  });

  // Seed a household doc + one property + one transaction, bypassing rules
  // (security-rule-free context), the same way the real migration script
  // (which uses the Admin SDK) does.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "households", HOUSEHOLD_ID), {
      meta: { allowlistedUids: [OWNER_UID] },
    });
    await setDoc(doc(db, "households", HOUSEHOLD_ID, "properties", "some-house"), {
      address: "123 Test St",
    });
    await setDoc(doc(db, "households", HOUSEHOLD_ID, "transactions", "txn-1"), {
      description: "test transaction",
    });
  });

  let failures = [];
  function check(label, ok) {
    console.log(`${ok ? "PASS" : "FAIL"} - ${label}`);
    if (!ok) failures.push(label);
  }

  // --- Owner (allowlisted) context: should succeed ---
  const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();
  check(
    "allowlisted owner can read the household doc",
    await assertSucceeds(getDoc(doc(ownerDb, "households", HOUSEHOLD_ID))).then(() => true).catch(() => false)
  );
  check(
    "allowlisted owner can read the properties subcollection",
    await assertSucceeds(getDocs(collection(ownerDb, "households", HOUSEHOLD_ID, "properties"))).then(() => true).catch(() => false)
  );
  check(
    "allowlisted owner can read the transactions subcollection",
    await assertSucceeds(getDocs(collection(ownerDb, "households", HOUSEHOLD_ID, "transactions"))).then(() => true).catch(() => false)
  );

  // --- Intruder: authenticated with a real Firebase Auth session, but NOT
  // on the allowlist. THIS is the case the spec calls out as the single most
  // important one to verify. ---
  const intruderDb = testEnv.authenticatedContext(INTRUDER_UID).firestore();
  check(
    "authenticated-but-not-allowlisted user CANNOT read the household doc",
    await assertFails(getDoc(doc(intruderDb, "households", HOUSEHOLD_ID))).then(() => true).catch(() => false)
  );
  check(
    "authenticated-but-not-allowlisted user CANNOT read the properties subcollection",
    await assertFails(getDocs(collection(intruderDb, "households", HOUSEHOLD_ID, "properties"))).then(() => true).catch(() => false)
  );
  check(
    "authenticated-but-not-allowlisted user CANNOT read the transactions subcollection",
    await assertFails(getDocs(collection(intruderDb, "households", HOUSEHOLD_ID, "transactions"))).then(() => true).catch(() => false)
  );
  check(
    "authenticated-but-not-allowlisted user CANNOT write to the household doc",
    await assertFails(setDoc(doc(intruderDb, "households", HOUSEHOLD_ID), { meta: { allowlistedUids: [INTRUDER_UID] } })).then(() => true).catch(() => false)
  );

  // --- Fully unauthenticated: should also be denied ---
  const anonDb = testEnv.unauthenticatedContext().firestore();
  check(
    "unauthenticated user CANNOT read the household doc",
    await assertFails(getDoc(doc(anonDb, "households", HOUSEHOLD_ID))).then(() => true).catch(() => false)
  );

  await testEnv.cleanup();

  if (failures.length > 0) {
    console.error(`\n${failures.length} rule test(s) failed:`);
    failures.forEach((f) => console.error(` - ${f}`));
    process.exit(1);
  } else {
    console.log("\nAll Firestore rules tests passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
