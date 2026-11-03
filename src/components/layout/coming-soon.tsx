import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

/** Placeholder for a section that is planned but not built yet. */
export function ComingSoon({ title, division, children }: { title: string; division: string; children: ReactNode }) {
  return (
    <>
      <PageHeader title={title} description={division} />
      <Card className="px-6 py-12 text-center">
        <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-lg text-brand-700" aria-hidden>
          ⏳
        </span>
        <p className="text-sm font-medium text-ink">This section is coming soon</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{children}</p>
      </Card>
    </>
  );
}
