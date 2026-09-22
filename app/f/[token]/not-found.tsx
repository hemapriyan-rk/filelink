export default function TokenNotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">DROPLINK</h1>
      <div>
        <p className="font-medium">Link Expired</p>
        <p className="text-sm text-neutral-400 mt-1">This file is no longer available.</p>
      </div>
    </main>
  );
}
