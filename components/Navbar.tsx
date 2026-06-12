"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { CheckSquare, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { NotificationBell } from "@/components/NotificationBell";
import { getInitials } from "@/lib/utils";

export function Navbar() {
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/60 bg-white/70 backdrop-blur-xl dark:border-zinc-800/60 dark:bg-zinc-950/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href={session ? "/dashboard" : "/"} className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
            <CheckSquare className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <span className="text-base font-semibold tracking-tight">TaskFlow</span>
        </Link>

        <div className="flex items-center gap-1.5">
          {mounted && (
            <Button variant="ghost" size="sm" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="h-8 w-8 p-0" aria-label="Toggle theme">
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}

          {session ? (
            <div className="ml-1 flex items-center gap-1.5">
              <NotificationBell />
              <Link href="/settings">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Settings">
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
              {session.user?.role === "ADMIN" && (
                <Link href="/admin"><Button variant="ghost" size="sm" className="text-xs">Admin</Button></Link>
              )}
              <div className="hidden items-center gap-2 sm:flex">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-bold text-white">
                  {getInitials(session.user?.name ?? "U")}
                </div>
                <span className="text-sm text-zinc-600 dark:text-zinc-300">{session.user?.name}</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => signOut({ callbackUrl: "/login" })} className="h-8">
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          ) : (
            <>
              <Link href="/login"><Button variant="ghost" size="sm">Login</Button></Link>
              <Link href="/register"><Button size="sm">Get Started</Button></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
