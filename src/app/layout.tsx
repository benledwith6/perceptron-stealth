import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://officialai.com";

export const metadata: Metadata = {
  title: {
    default: "Official AI — Your AI Marketing Teammate",
    template: "%s | Official AI",
  },
  description:
    "Create AI-powered video content with your face and voice using Kling 2.6 and Seedance 2.0. No filming required. Your AI twin, posting for you.",
  keywords: [
    "AI video generation",
    "social media automation",
    "AI marketing",
    "video content creation",
    "AI avatar",
    "voice cloning",
    "content automation",
    "Official AI",
  ],
  authors: [{ name: "Official AI" }],
  creator: "Official AI",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Official AI",
    title: "Official AI — Your AI Twin, Posting for You",
    description:
      "Upload a few photos. Get studio-quality social media videos featuring your face and voice. No filming. No editing. No crew.",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Official AI - AI-powered video content creation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Official AI — Your AI Twin, Posting for You",
    description:
      "Upload a few photos. Get studio-quality social media videos featuring your face and voice. No filming. No editing. No crew.",
    images: [`${siteUrl}/og-image.png`],
    creator: "@officialai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="theme-color" content="#050508" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="min-h-screen bg-[#050508] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
