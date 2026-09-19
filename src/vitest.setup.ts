// Frontend test setup (jsdom project only).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest globals are disabled, so explicitly unmount trees rendered through
// Testing Library after each test.
afterEach(() => {
  cleanup();
});
