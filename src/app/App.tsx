// Placeholder shell. Routing (/, /new, /p/:id/review, /p/:id) arrives with T13.
export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-3 px-6">
      <h1 className="text-4xl font-bold tracking-tight">Linchpin</h1>
      <p className="text-lg text-slate-600">Find the task your project is waiting on.</p>
      <p className="text-sm text-slate-500">
        Scaffold ready. Mock AI: {import.meta.env.VITE_MOCK_AI === '1' ? 'on' : 'off'}.
      </p>
    </main>
  );
}
