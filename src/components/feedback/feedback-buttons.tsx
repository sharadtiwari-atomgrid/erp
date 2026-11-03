"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { submitFeedback } from "./actions";
import { FEEDBACK_PRIORITIES } from "./options";

type Kind = "BUG" | "FEATURE";
type PageOption = { label: string; href: string };

/** Header buttons: "Report a bug" and "Feature request", each opening a small form. */
export function FeedbackButtons({ pages }: { pages: PageOption[] }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [thanks, setThanks] = useState("");
  return (
    <>
      <div className="hidden items-center gap-1 md:flex">
        <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-muted hover:text-ink" onClick={() => setKind("BUG")}>
          🐞 Report a bug
        </button>
        <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-muted hover:text-ink" onClick={() => setKind("FEATURE")}>
          💡 Feature request
        </button>
        {thanks && <span className="text-xs text-emerald-700">{thanks}</span>}
      </div>
      {kind && (
        <FeedbackDialog
          kind={kind}
          pages={pages}
          onClose={() => setKind(null)}
          onSent={() => {
            setKind(null);
            setThanks("Thanks, sent.");
            setTimeout(() => setThanks(""), 4000);
          }}
        />
      )}
    </>
  );
}

function FeedbackDialog({ kind, pages, onClose, onSent }: { kind: Kind; pages: PageOption[]; onClose: () => void; onSent: () => void }) {
  const pathname = usePathname();
  // Pre-select the page the person is on (longest matching nav link).
  const current = [...pages].sort((a, b) => b.href.length - a.href.length).find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`));
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  function replaceShot(file: File | null) {
    setShot((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return file ? { file, url: URL.createObjectURL(file) } : null;
    });
  }

  function takeImage(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("The screenshot must be an image.");
      return;
    }
    setError("");
    replaceShot(file);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("kind", kind);
    fd.delete("screenshotPicker");
    if (shot) fd.set("screenshot", shot.file, shot.file.name || "screenshot.png");
    setBusy(true);
    setError("");
    const res = await submitFeedback(fd).catch((err) => ({ ok: false as const, error: String(err) }));
    setBusy(false);
    if (res.ok) {
      replaceShot(null);
      onSent();
    }
    else setError(res.error);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onPaste={(e) => {
        const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
        if (item) {
          e.preventDefault();
          const f = item.getAsFile();
          if (f) takeImage(new File([f], `pasted-${Date.now()}.png`, { type: f.type || "image/png" }));
        }
      }}
      className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/30"
    >
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{kind === "BUG" ? "🐞 Report a bug" : "💡 Feature request"}</h2>
          <button type="button" aria-label="Close" className="rounded px-2 text-ink-faint hover:bg-muted hover:text-ink" onClick={() => dialogRef.current?.close()}>
            ✕
          </button>
        </div>
        <Field label="Title" htmlFor="fb-title" required>
          <Input id="fb-title" name="title" required maxLength={200} autoFocus placeholder={kind === "BUG" ? "What went wrong?" : "What would help?"} />
        </Field>
        <Field label="Details" htmlFor="fb-details" hint={kind === "BUG" ? "What you did, what you expected, what happened" : "What you'd like, and why"}>
          <Textarea id="fb-details" name="details" rows={4} maxLength={5000} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Page" htmlFor="fb-page">
            <Select id="fb-page" name="page" defaultValue={current?.label ?? ""}>
              <option value="">Not page-specific</option>
              {pages.map((p) => (
                <option key={p.href} value={p.label}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "BUG" && (
            <Field label="Priority" htmlFor="fb-priority">
              <Select id="fb-priority" name="priority" defaultValue="Annoying">
                {FEEDBACK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium">Screenshot</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-line bg-surface px-2.5 text-xs font-medium shadow-sm hover:bg-muted">
              Choose image
              <input type="file" name="screenshotPicker" accept="image/*" hidden onChange={(e) => takeImage(e.target.files?.[0])} />
            </label>
            <span className="text-xs text-ink-faint">or paste one here (Ctrl/⌘ V)</span>
            {shot && (
              <button
                type="button"
                className="text-xs text-red-700 hover:underline"
                onClick={() => replaceShot(null)}
              >
                Remove
              </button>
            )}
          </div>
          {shot && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={shot.url} alt="Screenshot preview" className="mt-2 max-h-40 rounded border border-line" />
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
