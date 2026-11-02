import { ButtonLink } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-600">403</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-ink-soft">Ask an administrator to change your role if you need it.</p>
        <ButtonLink href="/dashboard" className="mt-6">
          Back to dashboard
        </ButtonLink>
      </div>
    </main>
  );
}
