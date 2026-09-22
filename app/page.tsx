import { UploadForm } from "@/components/UploadForm";

export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-6 text-center">
            <h1 className="font-display text-5xl sm:text-6xl leading-none">
              <span className="text-[var(--crate-red)]">CRATE</span>{" "}
              <span className="text-[var(--ink)]">LINK</span>
            </h1>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Send a file. It expires on its own.
            </p>
          </div>

          <div className="tear-line mx-8" />

          <div className="px-6 sm:px-8 py-8">
            <UploadForm />
          </div>
        </div>
      </div>
    </main>
  );
}
