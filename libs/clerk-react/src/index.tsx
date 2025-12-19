import React, { createContext, useContext, useState, type PropsWithChildren } from "react";

interface ClerkContext {
  isSignedIn: boolean;
  userId?: string;
  organization?: { id?: string } | null;
  user?: {
    fullName?: string;
    primaryEmailAddress?: { emailAddress?: string } | null;
    publicMetadata?: Record<string, unknown>;
  } | null;
  signIn: () => void;
  signOut: () => void;
  getToken: () => Promise<string | null>;
}

const StubClerkContext = createContext<ClerkContext>({
  isSignedIn: false,
  signIn: () => undefined,
  signOut: () => undefined,
  getToken: async () => null
});

export function ClerkProvider({ children }: PropsWithChildren<{ publishableKey?: string; afterSignOutUrl?: string }>) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const contextValue: ClerkContext = {
    isSignedIn,
    userId: isSignedIn ? "stub-user" : undefined,
    organization: isSignedIn ? { id: "org" } : null,
    user: isSignedIn
      ? {
          fullName: "Stub User",
          primaryEmailAddress: { emailAddress: "stub@example.com" },
          publicMetadata: { orgId: "org" }
        }
      : null,
    signIn: () => setIsSignedIn(true),
    signOut: () => setIsSignedIn(false),
    getToken: async () => null
  };

  return <StubClerkContext.Provider value={contextValue}>{children}</StubClerkContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(StubClerkContext);
  return {
    isSignedIn: ctx.isSignedIn,
    userId: ctx.userId,
    getToken: ctx.getToken,
    signOut: ctx.signOut
  };
}

export function useUser() {
  const ctx = useContext(StubClerkContext);
  return { user: ctx.user };
}

export function useOrganization() {
  const ctx = useContext(StubClerkContext);
  return { organization: ctx.organization };
}

export function SignedIn({ children }: PropsWithChildren) {
  const ctx = useContext(StubClerkContext);
  if (!ctx.isSignedIn) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: PropsWithChildren) {
  const ctx = useContext(StubClerkContext);
  if (ctx.isSignedIn) return null;
  return <>{children}</>;
}

export function SignInButton({ children, ...rest }: PropsWithChildren<Record<string, unknown>>) {
  const ctx = useContext(StubClerkContext);
  const handleClick = () => ctx.signIn();
  return (
    <button type="button" onClick={handleClick} {...rest}>
      {children ?? "Sign in"}
    </button>
  );
}

export function UserButton({ afterSignOutUrl, ...rest }: Record<string, unknown>) {
  const ctx = useContext(StubClerkContext);
  const handleClick = () => ctx.signOut();
  return (
    <button type="button" onClick={handleClick} {...rest}>
      {ctx.userId ?? "User"}
    </button>
  );
}
