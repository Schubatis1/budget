import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // `resolved` is deliberately separate from `user` so callers can tell
  // "we don't know yet" apart from "we know there's no one signed in" --
  // per BUILD_SPEC.md: show nothing (no financial data, no cached values)
  // until Firebase has actually confirmed the session one way or the other.
  const [user, setUser] = useState(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setResolved(true);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, resolved, signOut: () => signOut(auth) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
