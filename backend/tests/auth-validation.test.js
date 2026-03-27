const request = require("supertest");
const { createApp } = require("../src/app");

describe("Auth validation", () => {
  it("rejects invalid login payload before DB access", async () => {
    const app = createApp();
    const res = await request(app).post("/auth/login").send({ email: "bad-format" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("rejects /auth/me when token missing", async () => {
    const app = createApp();
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing token");
  });
});
