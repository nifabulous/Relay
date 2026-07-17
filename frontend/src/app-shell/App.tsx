import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./AppShell";
import { OverviewPage } from "../features/overview/OverviewPage";
import { ExplorePage, BankDirectoryPage, SchemesPage, GlossaryPage } from "../features/explore/ExplorePage";

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
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="learn" element={<div>Learn (coming soon)</div>} />
            <Route path="explore" element={<ExplorePage />} />
            <Route path="explore/banks" element={<BankDirectoryPage />} />
            <Route path="explore/schemes" element={<SchemesPage />} />
            <Route path="explore/glossary" element={<GlossaryPage />} />
            <Route path="operate" element={<div>Operate (coming soon)</div>} />
            <Route path="*" element={<Navigate to="" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
