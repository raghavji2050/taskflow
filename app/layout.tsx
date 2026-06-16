import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConditionalNavbar } from "@/components/ConditionalNavbar";
import { Providers } from "@/components/providers";
import { rootMetadata } from "@/lib/metadata";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = rootMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="app-bg min-h-full font-sans text-[var(--foreground)] antialiased">
        <Providers>
          <ConditionalNavbar />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
