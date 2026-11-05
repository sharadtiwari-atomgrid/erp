import { Suspense, type ReactNode } from "react";
import { PageSkeleton, Sidebar, SidebarSkeleton } from "@/components/layout/app-chrome";

// Every page in the app reads the signed-in session, so none can be prerendered
// into an instant static shell. Opt out of Next's instant-navigation insights.
export const instant = false;

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <Suspense fallback={<SidebarSkeleton />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-col">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
