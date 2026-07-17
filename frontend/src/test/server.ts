import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW server instance shared across the test suite.
 *
 * Started/restopped in the test setup file (beforeAll/beforeEach/afterAll).
 * Tests can call `server.use(...)` to register one-off handlers that override
 * the defaults in `handlers.ts`.
 */
export const server = setupServer(...handlers);
