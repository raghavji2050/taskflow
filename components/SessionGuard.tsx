"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearWorkspaceSelection } from "@/components/WorkspaceProvider";

const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/"];

/** How often to verify the user still exists server-side (ms). */
const PROFILE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const hadUser = useRef(false);
  const userIdRef = useRef<string | undefined>(session?.user?.id);
  const lastProfileCheckRef = useRef(0);
  const checkingRef = useRef(false);
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (session?.user?.id) hadUser.current = true;
    userIdRef.current = session?.user?.id;
  }, [session?.user?.id]);

  useEffect(() => {
    if (status !== "authenticated" || !userIdRef.current) return;

    const validate = async (force = false) => {
      const now = Date.now();
      if (
        !force &&
        (checkingRef.current || now - lastProfileCheckRef.current < PROFILE_CHECK_INTERVAL_MS)
      ) {
        return;
      }

      checkingRef.current = true;
      try {
        const res = await fetch("/api/user/profile");
        lastProfileCheckRef.current = Date.now();
        if (res.status === 401 || res.status === 404) {
          hadUser.current = false;
          clearWorkspaceSelection();
          await signOut({ redirect: false });
          routerRef.current.replace("/login");
          routerRef.current.refresh();
        }
      } finally {
        checkingRef.current = false;
      }
    };

    void validate(true);
    const interval = setInterval(() => void validate(false), PROFILE_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status === "loading") return;

    const isPublic = publicPaths.some(
      (p) => pathname === p || (p !== "/" && pathname.startsWith(p))
    );

    if (status === "authenticated" && !session?.user?.id && hadUser.current) {
      hadUser.current = false;
      clearWorkspaceSelection();
      void signOut({ redirect: false }).then(() => {
        routerRef.current.replace("/login");
        routerRef.current.refresh();
      });
      return;
    }

    if (status === "unauthenticated" && hadUser.current && !isPublic) {
      hadUser.current = false;
      routerRef.current.replace("/login");
      routerRef.current.refresh();
    }
  }, [session?.user?.id, status, pathname]);

  return children;
}
