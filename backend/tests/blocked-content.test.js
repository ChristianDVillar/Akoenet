describe("blocked-content", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  it("allows plain text when filter is disabled", () => {
    process.env.BLOCKED_WORDS_ENABLED = "false";
    const { textContainsBlockedLanguage } = require("../src/lib/blocked-content");
    expect(textContainsBlockedLanguage("anything goes here")).toBe(false);
  });

  it("allows empty string", () => {
    process.env.BLOCKED_WORDS_ENABLED = "true";
    const { textContainsBlockedLanguage } = require("../src/lib/blocked-content");
    expect(textContainsBlockedLanguage("")).toBe(false);
    expect(textContainsBlockedLanguage("   ")).toBe(false);
  });
});
