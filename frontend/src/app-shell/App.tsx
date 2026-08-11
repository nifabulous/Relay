import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { AppShell } from "./AppShell";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { NotFoundPage } from "./NotFoundPage";
import { OverviewPage } from "../features/overview/OverviewPage";

// Route-level code splitting — Learn, Explore, and Operate are separate chunks
const ExplorePage = lazy(() => import("../features/explore/ExplorePage").then(m => ({ default: m.ExplorePage })));
const BankDirectoryPage = lazy(() => import("../features/explore/ExplorePage").then(m => ({ default: m.BankDirectoryPage })));
const SchemesPage = lazy(() => import("../features/explore/ExplorePage").then(m => ({ default: m.SchemesPage })));
const GlossaryPage = lazy(() => import("../features/explore/ExplorePage").then(m => ({ default: m.GlossaryPage })));
const PreparePaymentPage = lazy(() => import("../features/operate/prepare/PreparePaymentPage").then(m => ({ default: m.PreparePaymentPage })));
const ToolIndexPage = lazy(() => import("../features/operate/tools/ToolIndexPage").then(m => ({ default: m.ToolIndexPage })));
const FeePage = lazy(() => import("../features/operate/tools/FeePage").then(m => ({ default: m.FeePage })));
const ScreeningPage = lazy(() => import("../features/operate/tools/ScreeningPage").then(m => ({ default: m.ScreeningPage })));
const ValueDatePage = lazy(() => import("../features/operate/tools/ValueDatePage").then(m => ({ default: m.ValueDatePage })));
const StpPage = lazy(() => import("../features/operate/tools/StpPage").then(m => ({ default: m.StpPage })));
const TrackingPage = lazy(() => import("../features/operate/tracking/TrackingPage").then(m => ({ default: m.TrackingPage })));
const LearnIndexPage = lazy(() => import("../features/learn/LearnIndexPage").then(m => ({ default: m.LearnIndexPage })));
const LearnModulePage = lazy(() => import("../features/learn/LearnModulePage").then(m => ({ default: m.LearnModulePage })));
const CaseDeskRoute = lazy(() => import("../features/learn/cases/CaseDeskRoute").then(m => ({ default: m.CaseDeskRoute })));
const PracticePage = lazy(() => import("../features/learn/practice/PracticePage").then(m => ({ default: m.PracticePage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: Infinity,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/app">
        <AppErrorBoundary>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<OverviewPage />} />
              <Route path="learn" element={<Suspense fallback={null}><LearnIndexPage /></Suspense>} />
            {/* MUST precede learn/:moduleId so 'cases' is never captured as a
                module id. React Router v6 ranks static segments above dynamic
                ones, but the explicit ordering is a regression guard. */}
            <Route path="learn/cases/:caseId" element={<Suspense fallback={null}><CaseDeskRoute /></Suspense>} />
            {/* Static segment must precede learn/:moduleId so 'practice' is
                never captured as a module id. */}
            <Route path="learn/practice" element={<Suspense fallback={null}><PracticePage /></Suspense>} />
            <Route path="learn/:moduleId" element={<Suspense fallback={null}><LearnModulePage /></Suspense>} />
              <Route path="explore" element={<Suspense fallback={null}><ExplorePage /></Suspense>} />
              <Route path="explore/banks" element={<Suspense fallback={null}><BankDirectoryPage /></Suspense>} />
              <Route path="explore/schemes" element={<Suspense fallback={null}><SchemesPage /></Suspense>} />
              <Route path="explore/glossary" element={<Suspense fallback={null}><GlossaryPage /></Suspense>} />
            <Route path="operate" element={<Suspense fallback={null}><PreparePaymentPage /></Suspense>} />
            <Route path="operate/prepare" element={<Suspense fallback={null}><PreparePaymentPage /></Suspense>} />
            <Route path="operate/tools" element={<Suspense fallback={null}><ToolIndexPage /></Suspense>} />
            <Route path="operate/fees" element={<Suspense fallback={null}><FeePage /></Suspense>} />
            <Route path="operate/screening" element={<Suspense fallback={null}><ScreeningPage /></Suspense>} />
            <Route path="operate/value-date" element={<Suspense fallback={null}><ValueDatePage /></Suspense>} />
            <Route path="operate/stp" element={<Suspense fallback={null}><StpPage /></Suspense>} />
            <Route path="operate/tracking" element={<Suspense fallback={null}><TrackingPage /></Suspense>} />
              {/* Terminal, not a redirect. `Navigate to=""` used to sit here and
                  was a no-op — it rendered, navigated nowhere, and left the
                  outlet empty for every unmatched URL. A redirect to Overview
                  would fix the blank page but hide the broken link that caused
                  it; a page makes it reportable. See NotFoundPage. */}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
