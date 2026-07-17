import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";

/**
 * Dedicated QueryClient for tests.
 *
 * `retry: false` keeps async error states deterministic (no silent retries
 * that delay assertions), and `gcTime: Infinity` prevents cached queries from
 * being garbage-collected mid-test. Exported so tests can call helpers like
 * `queryClient.clear()` when they need a clean cache.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: Infinity,
    },
  },
});

/**
 * Wraps a React element with a QueryClientProvider and renders it with
 * Testing Library. Use this instead of `render` directly for any component
 * that relies on React Query.
 */
export function renderRelay(ui: ReactElement) {
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return render(ui, { wrapper });
}
