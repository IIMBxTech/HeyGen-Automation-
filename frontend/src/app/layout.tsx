import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HeyGen Translation Helper",
  description: "A dashboard for processing and translating HeyGen videos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="flex h-screen overflow-hidden" suppressHydrationWarning>
        {/* Sidebar */}
        <aside className="w-64 glass-panel border-r border-white/10 flex flex-col z-10">
          <div className="p-6">
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              HeyGen Helper
            </h1>
          </div>
          <nav className="flex-1 px-4 space-y-2">
            <Link 
              href="/"
              className="block px-4 py-3 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium"
            >
              Video Dashboard
            </Link>
            <Link 
              href="/glossary"
              className="block px-4 py-3 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium"
            >
              Glossary Management
            </Link>
            <Link 
              href="/logs"
              className="block px-4 py-3 rounded-lg hover:bg-white/5 transition-colors text-sm font-medium"
            >
              Log Book
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 h-full overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
