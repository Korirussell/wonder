"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSession } from "@/lib/auth-client";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  username?: string | null;
  displayUsername?: string | null;
  isAnonymous?: boolean | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isPending: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isPending: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSession();

  const value = useMemo<AuthContextValue>(() => {
    const rawUser = session.data?.user as AuthUser | null | undefined;

    return {
      user: rawUser
        ? {
            id: rawUser.id,
            email: rawUser.email,
            name: rawUser.name,
            image: rawUser.image,
            username: rawUser.username,
            displayUsername: rawUser.displayUsername,
            isAnonymous: rawUser.isAnonymous,
          }
        : null,
      isPending: session.isPending,
    };
  }, [session.data?.user, session.isPending]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
