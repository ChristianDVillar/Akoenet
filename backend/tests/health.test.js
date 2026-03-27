const request = require("supertest");
const { createApp } = require("../src/app");

describe("Health endpoint", () => {
  it("responds with ok true", async () => {
    const app = createApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
