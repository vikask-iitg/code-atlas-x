import { Suspense } from "react";
import ShareView from "@/components/ShareView";

export default function SharePage() {
  return (
    <Suspense fallback={<div className="mt-40 text-center text-sm text-muted">Loading diagram…</div>}>
      <ShareView />
    </Suspense>
  );
}
