import { UploadForm } from "@/components/UploadForm";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">DROPLINK</h1>
        <p className="text-sm text-neutral-400 mt-1">Temporary File Transfer</p>
      </div>
      <UploadForm />
    </main>
  );
}
