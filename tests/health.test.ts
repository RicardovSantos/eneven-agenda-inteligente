import { GET } from "@/app/api/health/route";

it("responde ok", async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
