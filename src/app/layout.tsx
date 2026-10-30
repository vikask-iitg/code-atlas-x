import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { themeInitScript } from "@/components/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://codeatlasx.vercel.app";
const TITLE = "CodeAtlasX: See how your code fits together";
const DESCRIPTION =
  "Turn any codebase into an interactive architecture diagram in under a minute. Drop a zip or folder, or paste a GitHub URL, and get grouped components, labelled relationships and data stores, each traced back to real files. Free, no sign-up.";

// Link previews (Open Graph / Twitter). The preview images come from
// opengraph-image.png and twitter-image.png in this folder.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s · CodeAtlasX" },
  description: DESCRIPTION,
  applicationName: "CodeAtlasX",
  keywords: [
    "architecture diagram",
    "codebase visualizer",
    "code visualization",
    "dependency graph",
    "software architecture",
    "GitHub repo visualizer",
    "onboarding",
    "developer tools",
  ],
  authors: [{ name: "Vikas Kumar Khurendra", url: "https://github.com/vikask-iitg" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "CodeAtlasX",
    title: TITLE,
    description: "Drop a zip or folder, or paste a GitHub URL, and get an interactive architecture diagram of your code in under a minute. Free, no sign-up.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: "Interactive architecture diagrams for any codebase: zip, folder or GitHub repo. Free, no sign-up.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#7c4dff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
