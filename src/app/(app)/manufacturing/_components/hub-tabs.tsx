import Link from "next/link";
import { cn } from "@/lib/cn";

const TABS = [
  { key: "units", label: "Production units", href: "/manufacturing/hub" },
  { key: "machines", label: "Machines", href: "/manufacturing/hub/machines" },
  { key: "boms", label: "Bills of materials", href: "/manufacturing/hub/boms" },
] as const;

/** Tab strip shared by the hub settings pages. */
export function HubTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="mb-4 flex gap-1 border-b border-line text-sm" aria-label="Hub settings">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 font-medium",
            active === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
