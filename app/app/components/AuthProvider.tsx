"use client";

import { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { AppUserProfile } from "@/lib/auth";
import { supabase } from "@/src/lib/supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: AppUserProfile | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from("app_users")
      .select("user_id, email, display_name, role, member_id, is_active")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    setProfile(data ? {
      userId: data.user_id,
      email: data.email ?? "",
      displayName: data.display_name ?? "",
      role: data.role,
      memberId: data.member_id ?? "",
      isActive: data.is_active !== false,
    } : null);
  }

  async function refreshProfile() {
    if (!session?.user.id) return;
    await loadProfile(session.user.id);
  }

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user.id) await loadProfile(data.session.user.id);
      setIsLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(true);
      window.setTimeout(() => {
        void (async () => {
          if (nextSession?.user.id) await loadProfile(nextSession.user.id);
          else setProfile(null);
          setIsLoading(false);
        })();
      }, 0);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signInWithGoogle() {
    const redirectTo = typeof window === "undefined" ? undefined : `${window.location.origin}/`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    isLoading,
    signInWithGoogle,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
