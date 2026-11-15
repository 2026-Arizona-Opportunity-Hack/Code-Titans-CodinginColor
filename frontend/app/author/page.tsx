"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Authoring moved into the Curriculum page. Old links and bookmarks land there.
export default function AuthorPage() {
  const router = useRouter();
  useEffect(() => router.replace("/instructor/curriculum/"), [router]);
  return <p role="status" className="p-8 text-muted">Opening Curriculum…</p>;
}
