import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ProjectsPage } from './ProjectsPage';
import { IntakePage } from '@/features/intake/IntakePage';
import { ReviewPage } from '@/features/review/ReviewPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { EmptyState } from '@/components/ui';
import { MOCK_AI } from '@/ai/client';

export function App() {
  return (
    <BrowserRouter>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/new" element={<IntakePage />} />
        <Route path="/p/:id/review" element={<ReviewPage />} />
        <Route path="/p/:id" element={<DashboardPage />} />
        <Route
          path="*"
          element={
            <EmptyState title="Page not found" action={<Link className="text-blue-700 underline" to="/">Back to projects</Link>} />
          }
        />
      </Routes>
      {MOCK_AI && (
        <div className="pointer-events-none fixed bottom-2 left-1/2 z-50 -translate-x-1/2 rounded bg-slate-900/80 px-2 py-1 text-xs text-white">
          Mock AI
        </div>
      )}
    </BrowserRouter>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-slate-900">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3.5" fill="#dc2626" />
        <path d="M12 2v6.5M12 15.5V22M2 12h6.5M15.5 12H22" stroke="currentColor" strokeWidth="2" />
      </svg>
      ClearPath
    </Link>
  );
}
