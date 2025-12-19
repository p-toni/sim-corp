import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton, useAuth, useOrganization, useUser } from "@clerk/clerk-react";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo } from "react";
import { setAuthTokenProvider } from "./api";

export interface AuthInfo {
  mode: "dev" | "clerk";
  userId?: string;
  orgId?: string;
  displayName?: string;
  isSignedIn: boolean;
  hasClerk: boolean;
}

const AuthContext = createContext<AuthInfo>({
  mode: "dev",
  userId: "dev-user",
  orgId: "org",
  displayName: "Dev User",
  isSignedIn: true,
  hasClerk: false
});

export function useAuthInfo(): AuthInfo {
  return useContext(AuthContext);
}

function readEnv(key: string, fallback?: string): string | undefined {
  if (typeof process !== "undefined" && process.env?.[key]) return process.env[key];
  if (typeof import.meta !== "undefined" && (import.meta as { env?: Record<string, string> }).env) {
    const metaKey = `VITE_${key}`;
    const value = (import.meta as { env?: Record<string, string> }).env?.[metaKey];
    return value ?? fallback;
  }
  return fallback;
}

function DevAuthProvider({ children }: PropsWithChildren): JSX.Element {
  const userId = readEnv("DEV_USER_ID", "dev-user");
  const orgId = readEnv("DEV_ORG_ID", "org");
  useEffect(() => {
    setAuthTokenProvider(async () => null);
  }, []);
  return (
    <AuthContext.Provider
      value={{
        mode: "dev",
        userId: userId ?? "dev-user",
        orgId: orgId ?? "org",
        displayName: "Dev User",
        isSignedIn: true,
        hasClerk: false
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function ClerkAuthProvider({ children }: PropsWithChildren): JSX.Element {
  const { isSignedIn, getToken, userId } = useAuth();
  const { user } = useUser();
  const { organization } = useOrganization();
  const orgId = useMemo(() => organization?.id ?? (user?.publicMetadata as { orgId?: string })?.orgId, [
    organization?.id,
    user?.publicMetadata
  ]);

  useEffect(() => {
    setAuthTokenProvider(async () => {
      if (!isSignedIn) return null;
      return getToken();
    });
  }, [getToken, isSignedIn]);

  const displayName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? undefined;

  return (
    <AuthContext.Provider
      value={{
        mode: "clerk",
        userId: userId ?? undefined,
        orgId: orgId ? String(orgId) : undefined,
        displayName,
        isSignedIn: Boolean(isSignedIn),
        hasClerk: true
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
  const publishableKey = readEnv("CLERK_PUBLISHABLE_KEY");
  if (publishableKey) {
    return (
      <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
        <ClerkAuthProvider>{children}</ClerkAuthProvider>
      </ClerkProvider>
    );
  }
  return <DevAuthProvider>{children}</DevAuthProvider>;
}

export function AuthControls(): JSX.Element {
  return (
    <div className="auth-controls">
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">Sign in</SignInButton>
      </SignedOut>
    </div>
  );
}
