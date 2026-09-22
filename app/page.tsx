import { UploadForm } from "@/components/UploadForm";
import { RecentLinks } from "@/components/RecentLinks";

export default function Home() {
  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-8 sm:px-12 pt-8 pb-5 text-center">
            <h1 className="font-display text-5xl sm:text-6xl leading-none">
              <span className="text-[var(--crate-red)]">CRATE</span>{" "}
              <span className="text-[var(--ink)]">LINK</span>
            </h1>
            <p className="mt-2.5 text-sm text-[var(--ink-soft)]">
              Send a file. It expires on its own.
            </p>
          </div>

          <div className="tear-line mx-10" />

          <div className="px-8 sm:px-12 py-7">
            <UploadForm />
          </div>
        </div>
      </div>
      <RecentLinks />
    </main>
  );
}
