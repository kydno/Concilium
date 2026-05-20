import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import { APP_PAGE_TITLE, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: APP_PAGE_TITLE,
  description: APP_TAGLINE,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-serif">{children}</body>
    </html>
  );
}
