import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Page not found</h1>
        <ButtonLink href="/dashboard" className="mt-6">
          Back to dashboard
        </ButtonLink>
      </div>
    </main>
  );
}
