import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { FeedbackButtons } from "@/components/feedback/feedback-buttons";
import { AppNav } from "@/components/layout/app-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BranchSwitcher } from "@/components/layout/branch-switcher";
import { getBranchScope } from "@/lib/branch";
import { requireUser } from "@/lib/auth";
import { NAVIGATION } from "@/lib/navigation";
import { getBranchOptions, getCompany } from "@/lib/options";
import { can } from "@/lib/permissions";

/** Sidebar navigation filtered by the signed-in user's role. */
export async function Sidebar() {
  const user = await requireUser();
  const company = await getCompany();
  const groups = NAVIGATION.map((g) => ({
    label: g.label,
    color: g.color,
    items: g.items.filter((i) => can(user, i.module)).map(({ label, href }) => ({ label, href })),
  })).filter((g) => g.items.length > 0);
  return <AppNav groups={groups} companyName={company.name} />;
}

/** Header branch selector; lists are filtered to the selected branch. */
export async function BranchMenu() {
  const [scope, branches] = await Promise.all([getBranchScope(), getBranchOptions()]);
  if (branches.length === 0) return null;
  return <BranchSwitcher branches={branches} value={scope.branchId ?? ""} locked={scope.locked} />;
}

export async function UserMenu() {
  const user = await requireUser();
  // Page picker for bug reports / feature requests: the navigation labels this user can open.
  const pages = NAVIGATION.flatMap((g) =>
    g.items.filter((i) => can(user, i.module)).map((i) => ({ label: g.label === "B2B views" ? `B2B ${i.label.toLowerCase()}` : i.label, href: i.href })),
  ).filter((p, i, all) => all.findIndex((x) => x.label === p.label) === i);
  return (
    <div className="flex items-center gap-3">
      <FeedbackButtons pages={pages} />
      <Link href="/settings/feedback" className="hidden rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-muted hover:text-ink lg:inline">
        {can(user, "settings") ? "Bugs & requests" : "My bugs & requests"}
      </Link>
      <div className="text-right leading-tight">
        <p className="text-sm font-medium text-ink">{user.name}</p>
        <p className="text-xs text-ink-faint">{user.roleName}</p>
      </div>
      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
        {user.name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()}
      </span>
      <ThemeToggle />
      <form action={logout}>
        <button type="submit" className="rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-muted hover:text-ink">
          Sign out
        </button>
      </form>
    </div>
  );
}

export function SidebarSkeleton() {
  return <aside className="hidden h-screen w-60 shrink-0 bg-sidebar lg:block" />;
}

export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded bg-line" />
      <div className="h-4 w-72 rounded bg-line/70" />
      <div className="h-64 rounded-lg bg-surface ring-1 ring-line" />
    </div>
  );
}
