"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-slate-600">The page hit an unexpected error. Your data never left your browser.</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Try again</button>
    </div>
  );
}
