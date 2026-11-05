import { Suspense, type ReactNode } from "react";
import { BranchMenu, PageSkeleton, Sidebar, SidebarSkeleton, UserMenu } from "@/components/layout/app-chrome";

// Every page in the app reads the signed-in session, so none can be prerendered
// into an instant static shell. Opt out of Next's instant-navigation insights.
export const instant = false;

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6 print:hidden">
          <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded bg-muted" />}>
            <BranchMenu />
          </Suspense>
          <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded bg-muted" />}>
            <UserMenu />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
