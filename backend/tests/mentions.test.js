const { parseChannelMentions } = require("../src/lib/mentions");

describe("parseChannelMentions", () => {
  test("finds usernames and everyone", () => {
    const r = parseChannelMentions("hi @alice and @everyone @bob");
    expect(r.everyone).toBe(true);
    expect(r.usernames.sort()).toEqual(["alice", "bob"].sort());
  });

  test("dedupes usernames", () => {
    const r = parseChannelMentions("@alice @alice");
    expect(r.usernames).toEqual(["alice"]);
  });
});
