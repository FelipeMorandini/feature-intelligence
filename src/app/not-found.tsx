import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
      <h1 className="text-lg font-semibold text-neutral-900">Request not found</h1>
      <p className="mt-2 text-sm text-neutral-600">It may have been mistyped, or it no longer exists.</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Back to backlog
      </Link>
    </div>
  );
}
