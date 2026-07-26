// One-time, locally-run migration: home-affordability-data.xml + transactions.xml
// -> Firestore. Uses the Admin SDK (service account key), which bypasses
// firestore.rules entirely -- this script is the ONLY thing that ever writes
// the initial household document. Run with: npm run migrate (from repo root).
//
// Never deployed, never committed. Reads two files that are themselves
// gitignored (Design Docs/*.xml) using a service account key that is also
// gitignored (secrets/*.json).
//
// Design decisions, see BUILD_SPEC.md Data Model section for the "why":
// - Every leaf value becomes { value, needsReview, note, ...anyOtherXmlAttrs }
//   so the UI can render blue/yellow/green/red coding straight from the data,
//   with no separate hardcoded lookup table in the frontend.
// - <note field="x"> elements are matched back onto field x's leaf. <note>
//   elements with no field attribute are collected as a container's `_notes`
//   array (general commentary, e.g. dataCoverageGap's long-form notes).
// - household.defaultAssumptions is synthesized from 707-s-laurel's own
//   loan/propertyTax/carryingCosts (the fully-specced reference property),
//   since the source XML expresses inheritance via inheritsFrom="default"
//   attributes rather than a separate defaults block. Only rate-like fields
//   (not price-derived ones) are copied forward.

const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const HOUSEHOLD_ID = "schubatis";
const DESIGN_DOCS = path.resolve(__dirname, "..", "Design Docs");
const SERVICE_ACCOUNT_PATH = path.resolve(
  __dirname,
  "..",
  "secrets",
  "budget-70742-firebase-adminsdk-fbsvc-2497d68413.json"
);

// ---------- XML parsing helpers ----------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true,
  allowBooleanAttributes: true,
});

function attrsOf(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (k.startsWith("@_")) out[k.slice(2)] = obj[k];
  }
  return out;
}

function toBool(v) {
  return v === true || v === "true";
}

function leafFromScalar(v, note) {
  return { value: v, needsReview: false, note: note || "" };
}

function leafFromAttrObj(obj, note) {
  const attrs = attrsOf(obj);
  const value = obj["#text"] !== undefined ? obj["#text"] : null;
  const needsReview = toBool(attrs.needsReview);
  const result = { value, needsReview, note: note || "" };
  for (const k of Object.keys(attrs)) {
    if (k === "needsReview") continue;
    result[k] = attrs[k];
  }
  return result;
}

// Collects <note field="x">...</note> (matched to sibling field x) and plain
// <note>...</note> (general commentary) from one container's raw children.
function collectNotes(raw) {
  let noteNodes = raw.note;
  const fieldNotes = {};
  const generalNotes = [];
  if (noteNodes === undefined) return { fieldNotes, generalNotes };
  if (!Array.isArray(noteNodes)) noteNodes = [noteNodes];
  for (const n of noteNodes) {
    if (typeof n === "string" || typeof n === "number") {
      generalNotes.push(String(n));
      continue;
    }
    const attrs = attrsOf(n);
    const text = n["#text"] !== undefined ? String(n["#text"]) : "";
    if (attrs.field) {
      fieldNotes[attrs.field] = fieldNotes[attrs.field]
        ? `${fieldNotes[attrs.field]}\n\n${text}`
        : text;
    } else {
      generalNotes.push(text);
    }
  }
  return { fieldNotes, generalNotes };
}

// Recursively transforms a parsed XML node into the { value, needsReview,
// note } leaf shape (for scalars/attributed leaves) or a plain nested object
// (for containers), attaching field-matched notes as it goes.
function transformNode(node, noteForThis) {
  if (node === null || node === undefined) return null;
  if (Array.isArray(node)) return node.map((n) => transformNode(n));
  if (typeof node !== "object") return leafFromScalar(node, noteForThis);

  if ("#text" in node) return leafFromAttrObj(node, noteForThis);

  const nonAttrKeys = Object.keys(node).filter((k) => !k.startsWith("@_"));
  if (nonAttrKeys.length === 0) {
    // Attribute-only self-closing element, e.g. <adam stars="5" note=""/>
    return attrsOf(node);
  }
  return transformContainer(node, noteForThis);
}

function transformContainer(raw, noteForThis) {
  const { fieldNotes, generalNotes } = collectNotes(raw);
  const result = {};
  for (const key of Object.keys(raw)) {
    if (key === "note") continue;
    if (key.startsWith("@_")) {
      result[key.slice(2)] = raw[key];
      continue;
    }
    result[key] = transformNode(raw[key], fieldNotes[key]);
  }
  if (generalNotes.length) result._notes = generalNotes;
  if (noteForThis) result._notes = [...(result._notes || []), noteForThis];
  return result;
}

// ---------- household-level transform ----------

function buildHousehold(root) {
  const model = root.homeAffordabilityModel;
  const h = model.household;

  const household = {
    meta: {
      asOf: model["@_asOf"] || null,
      version: model["@_version"] || null,
      allowlistedUids: [], // bootstrap manually in the Firebase console per BUILD_SPEC.md
    },
    // Not present in the source XML -- added later directly in Firestore via
    // the app's own Household Budget screen. Included here with the same
    // values so a future re-run of this one-time script (which does a full
    // .set(), not a merge) doesn't silently wipe it.
    familySize: {
      adults: { value: 2, needsReview: false, note: "" },
      children: { value: 0, needsReview: false, note: "" },
    },
    income: transformContainer(h.income),
    payrollDeductions: transformContainer(h.payrollDeductions),
    payStubActuals: h.payStubActuals ? transformContainer(h.payStubActuals) : null,
    payStubActualsLauren: h.payStubActualsLauren ? transformContainer(h.payStubActualsLauren) : null,
    taxes: transformContainer(h.taxes),
    assetsAndDebts: transformContainer(h.assetsAndDebts),
    householdBudget: transformContainer(h.householdBudget),
    secondHomeCarryingCost: transformContainer(h.secondHomeCarryingCost),
    dataCoverageGap: transformContainer(h.dataCoverageGap),
    closingCostDetail: transformContainer(h.closingCostDetail),
    brokerageLiquidation: transformContainer(h.brokerageLiquidation),
    budgetLineTaxonomy: buildBudgetLineTaxonomy(h.budgetLineTaxonomy),
    standingNotes: normalizeNoteList(h.standingNotes && h.standingNotes.note),
  };

  return household;
}

function normalizeNoteList(noteNodes) {
  if (!noteNodes) return [];
  const arr = Array.isArray(noteNodes) ? noteNodes : [noteNodes];
  return arr.map((n) => (typeof n === "object" ? n["#text"] : n)).map(String);
}

function buildBudgetLineTaxonomy(raw) {
  if (!raw) return null;
  const lines = raw.validBudgetLines.line;
  const lineArr = Array.isArray(lines) ? lines : [lines];
  const validBudgetLines = lineArr.map((l) => ({
    group: attrsOf(l).group || null,
    name: l["#text"],
  }));

  const maps = raw.rawCategoryDefaults.map;
  const mapArr = Array.isArray(maps) ? maps : [maps];
  const rawCategoryDefaults = {};
  for (const m of mapArr) {
    const a = attrsOf(m);
    rawCategoryDefaults[a.raw] = a.default;
  }

  return { validBudgetLines, rawCategoryDefaults };
}

// ---------- properties transform ----------

function buildProperties(root) {
  const propsRaw = root.homeAffordabilityModel.properties.property;
  const propArr = Array.isArray(propsRaw) ? propsRaw : [propsRaw];

  const properties = {};
  for (const p of propArr) {
    const attrs = attrsOf(p);
    const id = attrs.id;
    const transformed = transformContainer(p);
    delete transformed.id; // redundant with the Firestore doc ID

    // Fix up ratings.adam/lauren.stars from raw strings to number|null.
    if (transformed.ratings) {
      for (const person of ["adam", "lauren"]) {
        const r = transformed.ratings[person];
        if (r && typeof r === "object" && "stars" in r) {
          const starsStr = r.stars;
          r.stars = starsStr === "" || starsStr === undefined ? null : Number(starsStr);
        }
      }
    }

    properties[id] = transformed;
  }
  return properties;
}

// household.defaultAssumptions: copied from 707-s-laurel (the fully-specced
// reference property) at migration time, per BUILD_SPEC.md's inheritance
// note -- a one-time copy, not a live reference, so later edits to any
// individual property never retroactively change because this changed.
function buildDefaultAssumptions(properties) {
  const ref = properties["707-s-laurel"];
  if (!ref) {
    console.warn("WARNING: 707-s-laurel not found; defaultAssumptions will be empty.");
    return { loan: {}, propertyTax: {}, carryingCosts: {}, _notes: ["Reference property missing at migration time."] };
  }
  const pick = (obj, keys) => {
    const out = {};
    for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
    return out;
  };
  return {
    loan: pick(ref.loan, ["downPaymentPct", "interestRateAnnual", "termYears", "pmiMonthly"]),
    propertyTax: pick(ref.propertyTax, [
      "taxableValuePctOfPrice",
      "millageHomesteadPRE",
      "millageNonHomestead",
      "schoolExemptionMills",
    ]),
    carryingCosts: pick(ref.carryingCosts, [
      "homeownersInsuranceAnnual",
      "maintenanceReservePctOfValueAnnual",
      "utilitiesMonthly",
      "buyerClosingCostsPctOfPrice",
    ]),
    _notes: [
      "Copied from 707 S Laurel (the fully-specced reference property) at migration time (one-time copy, not a live reference). Editing these household defaults does not retroactively change any existing property -- see BUILD_SPEC.md's inheritance note.",
    ],
  };
}

// ---------- transactions transform ----------

function buildTransactions(root) {
  const txnsRaw = root.transactions.txn;
  const txnArr = Array.isArray(txnsRaw) ? txnsRaw : [txnsRaw];

  return txnArr.map((t) => {
    const attrs = attrsOf(t);
    const description = t["#text"] !== undefined ? String(t["#text"]) : "";
    return {
      date: attrs.date,
      description,
      amount: Number(attrs.amount),
      signedAmount: Number(attrs.signedAmount),
      type: attrs.type || null,
      rawCategory: attrs.rawCategory || null,
      budgetLine: attrs.budgetLine || null,
      person: attrs.person || null,
      source: attrs.source || null,
      // Preserved by presence, not by literal value -- BUILD_SPEC.md notes
      // oneTimeExcluded appears as both "wedding" and "true" in the source
      // data, and a recompute must treat any non-null value as "excluded",
      // not compare against a specific string.
      oneTimeExcluded: attrs.oneTimeExcluded !== undefined ? attrs.oneTimeExcluded : null,
      linkedCardPaymentExcluded: toBool(attrs.linkedCardPaymentExcluded),
      rewardsCreditExcluded: toBool(attrs.rewardsCreditExcluded),
    };
  });
}

// ---------- main ----------

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(`Service account key not found at ${SERVICE_ACCOUNT_PATH}`);
    process.exit(1);
  }

  const householdXmlPath = path.join(DESIGN_DOCS, "home-affordability-data.xml");
  const transactionsXmlPath = path.join(DESIGN_DOCS, "transactions.xml");

  console.log("Parsing XML...");
  const householdRoot = parser.parse(fs.readFileSync(householdXmlPath, "utf8"));
  const transactionsRoot = parser.parse(fs.readFileSync(transactionsXmlPath, "utf8"));

  console.log("Transforming household data...");
  const household = buildHousehold(householdRoot);
  const properties = buildProperties(householdRoot);
  household.defaultAssumptions = buildDefaultAssumptions(properties);

  console.log("Transforming transactions...");
  const transactions = buildTransactions(transactionsRoot);
  console.log(`Parsed ${Object.keys(properties).length} properties, ${transactions.length} transactions.`);

  if (process.env.DRY_RUN) {
    console.log("\n--- DRY RUN: household.income ---");
    console.log(JSON.stringify(household.income, null, 2));
    console.log("\n--- DRY RUN: household.dataCoverageGap (checks _notes handling) ---");
    console.log(JSON.stringify(household.dataCoverageGap, null, 2));
    console.log("\n--- DRY RUN: household.defaultAssumptions ---");
    console.log(JSON.stringify(household.defaultAssumptions, null, 2));
    console.log("\n--- DRY RUN: properties['1102-n-lafayette'] (checks ratings + needsReview) ---");
    console.log(JSON.stringify(properties["1102-n-lafayette"], null, 2));
    console.log("\n--- DRY RUN: properties['707-s-laurel'].loan ---");
    console.log(JSON.stringify(properties["707-s-laurel"].loan, null, 2));
    console.log("\n--- DRY RUN: first 3 transactions ---");
    console.log(JSON.stringify(transactions.slice(0, 3), null, 2));
    console.log("\n--- DRY RUN: household.budgetLineTaxonomy sample ---");
    console.log(JSON.stringify(household.budgetLineTaxonomy.validBudgetLines.slice(0, 3), null, 2));
    console.log(JSON.stringify(household.budgetLineTaxonomy.rawCategoryDefaults, null, 2));
    console.log("\nDry run complete -- nothing written to Firestore.");
    process.exit(0);
  }

  initializeApp({
    credential: cert(require(SERVICE_ACCOUNT_PATH)),
  });
  const db = getFirestore();

  const householdRef = db.collection("households").doc(HOUSEHOLD_ID);

  console.log(`Writing household document households/${HOUSEHOLD_ID} ...`);
  await householdRef.set(household);

  console.log(`Writing ${Object.keys(properties).length} properties...`);
  for (const [id, data] of Object.entries(properties)) {
    await householdRef.collection("properties").doc(id).set(data);
    console.log(`  - properties/${id}`);
  }

  console.log(`Writing ${transactions.length} transactions in batches of 400...`);
  const BATCH_SIZE = 400;
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = transactions.slice(i, i + BATCH_SIZE);
    for (const txn of slice) {
      const ref = householdRef.collection("transactions").doc();
      batch.set(ref, txn);
    }
    await batch.commit();
    console.log(`  - committed ${Math.min(i + BATCH_SIZE, transactions.length)}/${transactions.length}`);
  }

  console.log("\nMigration complete.");
  console.log(
    `\nNEXT STEP (per BUILD_SPEC.md): households/${HOUSEHOLD_ID}.meta.allowlistedUids is empty.` +
      " Sign up in the app's login screen, then add your UID (and your wife's, once she signs up)" +
      " to that array via the Firebase console -- Firestore Data tab -- before either of you can read anything."
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
