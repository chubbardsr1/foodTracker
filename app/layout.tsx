import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Food Tracker",
  description: "Track meals, calories, protein, fat, and net carbohydrates each day.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Food Tracker", statusBarStyle: "default" },
  openGraph: {
    title: "Daily Food Tracker",
    description: "Meals, macros, made simple.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Daily Food Tracker" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Daily Food Tracker",
    description: "Meals, macros, made simple.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head><meta name="theme-color" content="#f7f5ef" /></head>
      <body>{children}</body>
    </html>
  );
}
