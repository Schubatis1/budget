import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import HouseMark from "../components/HouseMark";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <HouseMark size={52} />
          <div className="wordmark">
            home<span className="accent">·</span>budget
          </div>
        </div>

        <p className="login-explainer">
          This is a private tool for one household. Signing in with a real
          account (not a pasted API key) is what actually keeps the data
          private -- a Firebase project config is not a secret and would be
          visible in the browser regardless of how it's entered. Access is
          controlled by an explicit allowlist checked on every read and
          write.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div>
            <label className="field-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          className="login-mode-toggle"
          type="button"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
        >
          {mode === "signin"
            ? "First time setting this up? Create an account"
            : "Already have an account? Sign in"}
        </button>

        {mode === "signup" && (
          <p className="login-fineprint">
            Creating an account here does not grant access by itself -- the
            household owner still has to add your user ID to the allowlist
            in the Firebase console before anything will load.
          </p>
        )}
      </div>
    </div>
  );
}

function friendlyAuthError(err) {
  switch (err.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "That email already has an account -- try signing in instead.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    default:
      return err.message || "Something went wrong. Try again.";
  }
}
