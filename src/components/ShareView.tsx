"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Diagram } from "@/lib/types";
import { Viewer } from "@/components/Viewer";
import { decodeDiagram } from "@/lib/shareCodec";

export default function ShareView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Self-contained links carry the diagram in the URL fragment.
    if (id === "inline") {
      const data = location.hash.slice(1);
      (data ? decodeDiagram(data) : Promise.reject(new Error("empty")))
        .then(setDiagram)
        .catch(() => setError("This share link is damaged or incomplete."));
      return;
    }
    fetch(`/api/share/${id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Could not load this diagram.");
        setDiagram(j.diagram);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <div className="mx-auto mt-32 max-w-md p-6 text-center" role="alert">
        <h1 className="text-lg font-semibold">{error}</h1>
        <Link href="/" className="mt-4 inline-block text-accent hover:underline">
          Create your own diagram →
        </Link>
      </div>
    );
  if (!diagram) return <div className="mt-40 text-center text-sm text-muted">Loading diagram…</div>;
  return <Viewer diagram={diagram} readOnly onNew={() => router.push("/")} />;
}
