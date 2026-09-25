// The /vitest entry registers the matchers and their types with vitest.
import "@testing-library/jest-dom/vitest";

// jsdom does not implement scrollIntoView, which the chat log calls.
Element.prototype.scrollIntoView = () => {};
