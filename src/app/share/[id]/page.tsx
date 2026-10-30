import { Suspense } from "react";
import type { Metadata } from "next";
import ShareView from "@/components/ShareView";

// Shared diagrams get their own preview title; they're private, so keep them out of search.
export const metadata: Metadata = {
  title: "Shared architecture diagram",
  description: "A view-only architecture diagram made with CodeAtlasX. Open it to explore components, relationships and data stores.",
  openGraph: { title: "Shared architecture diagram · CodeAtlasX", description: "Open to explore this codebase's components, relationships and data stores, or map your own." },
  robots: { index: false, follow: false },
};

export default function SharePage() {
  return (
    <Suspense fallback={<div className="mt-40 text-center text-sm text-muted">Loading diagram…</div>}>
      <ShareView />
    </Suspense>
  );
}
