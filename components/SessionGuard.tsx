"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { clearWorkspaceSelection } from "@/components/WorkspaceProvider";

const publicPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/"];

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const hadUser = useRef(false);

  useEffect(() => {
    if (session?.user?.id) hadUser.current = true;
  }, [session?.user?.id]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const validate = async () => {
      const res = await fetch("/api/user/profile");
      if (res.status === 401 || res.status === 404) {
        hadUser.current = false;
        clearWorkspaceSelection();
        await signOut({ redirect: false });
        router.replace("/login");
        router.refresh();
      }
    };

    void validate();
    const interval = setInterval(validate, 30_000);
    return () => clearInterval(interval);
  }, [status, session?.user?.id, router]);

  useEffect(() => {
    if (status === "loading") return;

    const isPublic = publicPaths.some(
      (p) => pathname === p || (p !== "/" && pathname.startsWith(p))
    );

    if (status === "authenticated" && !session?.user?.id && hadUser.current) {
      hadUser.current = false;
      clearWorkspaceSelection();
      void signOut({ redirect: false }).then(() => {
        router.replace("/login");
        router.refresh();
      });
      return;
    }

    if (status === "unauthenticated" && hadUser.current && !isPublic) {
      hadUser.current = false;
      router.replace("/login");
      router.refresh();
    }
  }, [session?.user?.id, status, pathname, router]);

  return children;
}
