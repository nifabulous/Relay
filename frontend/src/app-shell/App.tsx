import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { AppShell } from "./AppShell";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { OverviewPage } from "../features/overview/OverviewPage";

// Route-level code splitting — Learn, Explore, and Operate are separate chunks
const ExplorePage = lazy(() => import("../features/explore/ExplorePage").then(m => ({ default: m.ExplorePage })));
const BankDirectoryPage = lazy(() => import("../features/explore/ExplorePage").then(m => ({ default: m.BankDirectoryPage })));
const SchemesPage = lazy(() => import("../features/explore/ExplorePage").then(m => ({ default: m.SchemesPage })));
const GlossaryPage = lazy(() => import("../features/explore/ExplorePage").then(m => ({ default: m.GlossaryPage })));
const PreparePaymentPage = lazy(() => import("../features/operate/prepare/PreparePaymentPage").then(m => ({ default: m.PreparePaymentPage })));

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
              <Route path="learn" element={<div>Learn (coming soon)</div>} />
              <Route path="explore" element={<Suspense fallback={null}><ExplorePage /></Suspense>} />
              <Route path="explore/banks" element={<Suspense fallback={null}><BankDirectoryPage /></Suspense>} />
              <Route path="explore/schemes" element={<Suspense fallback={null}><SchemesPage /></Suspense>} />
              <Route path="explore/glossary" element={<Suspense fallback={null}><GlossaryPage /></Suspense>} />
              <Route path="operate" element={<Suspense fallback={null}><PreparePaymentPage /></Suspense>} />
              <Route path="operate/prepare" element={<Suspense fallback={null}><PreparePaymentPage /></Suspense>} />
              <Route path="*" element={<Navigate to="" replace />} />
            </Route>
          </Routes>
        </AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
