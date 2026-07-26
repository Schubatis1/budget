import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// This is a Firebase Web API key -- Google explicitly designs it to be
// public (it identifies which Firebase project a client talks to, it is
// not a secret) and it is always visible in the browser network tab
// regardless of how it's stored. It is safe to commit here. The actual
// access control is Firestore Security Rules + Firebase Authentication --
// see firestore.rules and BUILD_SPEC.md's auth section for why.
const firebaseConfig = {
  apiKey: "AIzaSyCVeUbVmTki8v9aFP-5yDaQXufgKzcgL-c",
  authDomain: "budget-70742.firebaseapp.com",
  projectId: "budget-70742",
  storageBucket: "budget-70742.firebasestorage.app",
  messagingSenderId: "1093567850524",
  appId: "1:1093567850524:web:51c314493243ba55e4d7d9",
  measurementId: "G-W78MLB1WKK",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const HOUSEHOLD_ID = "schubatis";
