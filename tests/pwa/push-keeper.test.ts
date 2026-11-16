import { describe, expect, it, vi } from "vitest";
import { healPushDevice, type HealDeps } from "@/lib/push-keeper";

const sub = { endpoint: "https://web.push.apple.com/x" } as PushSubscriptionJSON;
function deps(over: Partial<HealDeps> = {}): HealDeps & { renew: ReturnType<typeof vi.fn> } {
  return { permission: () => "granted", current: async () => sub, status: async () => "ok", renew: vi.fn(async () => undefined), ...over } as HealDeps & { renew: ReturnType<typeof vi.fn> };
}

describe("healPushDevice", () => {
  it("renova sozinho quando o servidor diz que o aparelho parou", async () => {
    const d = deps({ status: async () => "stale" });
    expect(await healPushDevice(d)).toBe("renewed");
    expect(d.renew).toHaveBeenCalledOnce();
  });

  it("não mexe em aparelho saudável", async () => {
    const d = deps();
    expect(await healPushDevice(d)).toBe("ok");
    expect(d.renew).not.toHaveBeenCalled();
  });

  it("não recadastra quem removeu o aparelho da lista de propósito", async () => {
    const d = deps({ status: async () => "unknown" });
    expect(await healPushDevice(d)).toBe("ok");
    expect(d.renew).not.toHaveBeenCalled();
  });

  it("não faz nada sem permissão, sem suporte ou sem ter cadastrado antes", async () => {
    for (const permission of ["denied", "default", "unsupported"] as const) {
      const d = deps({ permission: () => permission, status: async () => "stale" });
      expect(await healPushDevice(d)).toBe("skipped");
      expect(d.renew).not.toHaveBeenCalled();
    }
    const none = deps({ current: async () => null, status: async () => "stale" });
    expect(await healPushDevice(none)).toBe("skipped");
    expect(none.renew).not.toHaveBeenCalled();
  });

  it("sem rede ou sessão vencida tenta de novo na próxima abertura, sem renovar", async () => {
    const d = deps({ status: async () => { throw new Error("offline"); } });
    expect(await healPushDevice(d)).toBe("skipped");
    expect(d.renew).not.toHaveBeenCalled();
    expect(await healPushDevice(deps({ current: async () => { throw new Error("sw"); } }))).toBe("skipped");
  });

  it("se o navegador exigir um toque (iOS), pede para o usuário reativar", async () => {
    const d = deps({ status: async () => "stale", renew: vi.fn(async () => { throw new Error("precisa de gesto"); }) });
    expect(await healPushDevice(d)).toBe("needs-tap");
  });
});
