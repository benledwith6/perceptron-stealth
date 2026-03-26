import type { Metadata } from "next";
import LandingPageClient from "./LandingPageClient";

export const metadata: Metadata = {
  title: "Official AI — Your AI Twin, Posting for You",
  description:
    "Upload a few photos. Get studio-quality social media videos featuring your face and voice. No filming. No editing. No crew.",
  alternates: {
    canonical: "/",
  },
};

export default function LandingPage() {
  return <LandingPageClient />;
}
