import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1>Page not found</h1>
      <p className="mt-3 text-zinc-600">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className="mt-6 inline-block rounded-full bg-brand-700 px-5 py-2.5 text-sm font-medium text-white">Back to dashboard</Link>
    </main>
  );
}
