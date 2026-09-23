import "@testing-library/jest-dom";

// jsdom does not implement scrollIntoView, which the chat log calls.
Element.prototype.scrollIntoView = () => {};
