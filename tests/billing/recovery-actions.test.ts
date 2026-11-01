import { afterEach, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => vi.fn());
const recover = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/guard", () => ({ requireSuperAdminSession: guard }));
vi.mock("@/server/billing/recover-subscription", () => ({ recoverSubscription: recover, abandonTestSubscription: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { recoverSubscriptionAction } from "@/app/admin/cobranca/actions";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("exige superadministrador antes de processar a recuperação", async () => {
  guard.mockRejectedValue(new Error("forbidden"));
  await expect(recoverSubscriptionAction("", new FormData())).rejects.toThrow("forbidden");
  expect(recover).not.toHaveBeenCalled();
});

it("bloqueia em produção mesmo para superadministrador", async () => {
  guard.mockResolvedValue({ userId: "admin" });
  vi.stubEnv("NODE_ENV", "production");
  expect(await recoverSubscriptionAction("", new FormData())).toBe("Indisponível em produção.");
  expect(recover).not.toHaveBeenCalled();
});
