import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function LoginFormWithNext({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-brand-600 text-lg font-bold text-white">A</span>
          <h1 className="mt-4 text-xl font-semibold text-ink">Sign in to Atomgrid</h1>
          <p className="mt-1 text-sm text-ink-soft">Orders, inventory, manufacturing and logistics in one place.</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-6 shadow-sm">
          <Suspense fallback={<div className="h-56 animate-pulse rounded bg-muted" />}>
            <LoginFormWithNext searchParams={searchParams as Promise<{ next?: string }>} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
