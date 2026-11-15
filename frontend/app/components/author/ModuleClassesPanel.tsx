"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { updateAssignment } from "../../lib/api/assignments";
import { ApiError, apiFetch } from "../../lib/api/client";

type ClassUse = { classId: string; name: string; moduleVersion: number; startedCount: number };
type Usage = { latestVersion: number; classes: ClassUse[] };

/**
 * Classes keep the version they were assigned, so a publish alone changes nothing for students.
 * This panel shows which of your classes use the module and moves them to the latest version.
 */
export function ModuleClassesPanel({ token, moduleId }: { token: string; moduleId: string }) {
  const qc = useQueryClient();
  const [done, setDone] = useState("");
  const usage = useQuery({
    queryKey: ["module-classes", token, moduleId],
    queryFn: ({ signal }) => apiFetch<Usage>(`/curriculum/modules/${encodeURIComponent(moduleId)}/classes`, { token, signal }),
    retry: false,
  });
  const latest = usage.data?.latestVersion ?? 0;
  const behind = (usage.data?.classes ?? []).filter((c) => c.moduleVersion < latest);
  const move = useMutation({
    mutationFn: async (classes: ClassUse[]) => {
      for (const c of classes) await updateAssignment(token, c.classId, moduleId, { moduleVersion: latest });
      return classes.length;
    },
    onSuccess: (n) => {
      setDone(`${n} class${n === 1 ? "" : "es"} now use${n === 1 ? "s" : ""} version ${latest}. Students see it the next time they open the module.`);
      qc.invalidateQueries({ queryKey: ["module-classes", token, moduleId] });
      qc.invalidateQueries({ queryKey: ["assignments"] });
    },
  });

  if (usage.isPending || !usage.data || latest === 0) return null;
  return (
    <section aria-labelledby="usage-h" className="card mt-6">
      <h2 id="usage-h" className="text-lg">Classes using this module</h2>
      {usage.data.classes.length === 0 ? (
        <p className="mt-1 text-muted">None of your classes use it yet. Assign it from a class&apos;s Assignments page.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Each class keeps the version it was given until you move it, so publishing alone doesn&apos;t change what students see.
            Students keep the steps they finished.
          </p>
          <ul className="mt-3 grid gap-2">
            {usage.data.classes.map((c) => (
              <li key={c.classId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3">
                <span>
                  <strong>{c.name}</strong>{" "}
                  <span className="text-sm text-muted">· version {c.moduleVersion}{c.startedCount ? ` · ${c.startedCount} started` : ""}</span>
                </span>
                {c.moduleVersion < latest ? (
                  <button type="button" className="btn btn-secondary" disabled={move.isPending} onClick={() => { setDone(""); move.mutate([c]); }}>
                    Move to version {latest}<span className="sr-only"> for {c.name}</span>
                  </button>
                ) : <span className="badge">Up to date</span>}
              </li>
            ))}
          </ul>
          {behind.length > 1 ? (
            <button type="button" className="btn btn-primary mt-3" disabled={move.isPending} onClick={() => { setDone(""); move.mutate(behind); }}>
              {move.isPending ? "Moving…" : `Move all ${behind.length} classes to version ${latest}`}
            </button>
          ) : null}
        </>
      )}
      <div aria-live="polite">{done ? <p className="callout mt-3 font-bold">{done}</p> : null}</div>
      {move.isError ? <p role="alert" className="mt-3 font-bold text-danger">{move.error instanceof ApiError ? move.error.message : "A class could not be moved. Try again."}</p> : null}
    </section>
  );
}
