import type { Metadata } from "next";
import { appPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = appPageMetadata(
  "Sign in",
  "Sign in to your TaskFlow account."
);

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
