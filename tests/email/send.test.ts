import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/server/email/send";

const message = {
  to: "ana@defendi.com",
  subject: "Assunto",
  html: "<p>oi</p>",
  text: "oi https://app.eneven.com.br/confirmar-email?token=abc",
};

describe("sendEmail", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sem ZEPTOMAIL_TOKEN não chama fetch e registra só assunto e link", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    await sendEmail(message);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0].join(" "));
    expect(line).toContain("Assunto");
    expect(line).toContain("https://app.eneven.com.br/confirmar-email?token=abc");
    expect(line).not.toContain("ana@defendi.com");
  });

  it("com token faz POST na API do ZeptoMail com o formato esperado", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "segredo-123");
    vi.stubEnv("EMAIL_FROM", "nao-responda@eneven.com.br");
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));

    await sendEmail(message);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://cpaas.zoho.com/v1.1/email");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Zoho-enczapikey segredo-123",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      from: { address: "nao-responda@eneven.com.br", name: "Eneven Agenda" },
      to: [{ email_address: { address: "ana@defendi.com" } }],
      subject: "Assunto",
      htmlbody: "<p>oi</p>",
      textbody: message.text,
    });
  });

  it("ZEPTOMAIL_URL troca o endereço da API", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "segredo-123");
    vi.stubEnv("EMAIL_FROM", "nao-responda@eneven.com.br");
    vi.stubEnv("ZEPTOMAIL_URL", "https://api.zeptomail.com/v1.1/email");
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));

    await sendEmail(message);

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.zeptomail.com/v1.1/email");
  });

  it.each([
    ["sem o prefixo", "segredo-123"],
    ["com o prefixo do painel", "Zoho-enczapikey segredo-123"],
    ["com o prefixo e espaços nas pontas", "  Zoho-enczapikey   segredo-123 \n"],
  ])("token %s vai no cabeçalho uma única vez com o prefixo", async (_name, token) => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", token);
    vi.stubEnv("EMAIL_FROM", "nao-responda@eneven.com.br");
    fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));

    await sendEmail(message);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Zoho-enczapikey segredo-123",
    );
  });

  it("endereço da API que não é https é recusado (o token não sai em texto puro)", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "segredo-123");
    vi.stubEnv("EMAIL_FROM", "nao-responda@eneven.com.br");
    vi.stubEnv("ZEPTOMAIL_URL", "http://cpaas.zoho.com/v1.1/email");

    await expect(sendEmail(message)).rejects.toThrow(/ZEPTOMAIL_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("em produção sem token lança erro e não registra o link no console", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZEPTOMAIL_TOKEN", "");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(sendEmail(message)).rejects.toThrow(/ZEPTOMAIL_TOKEN/);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("resposta fora de 2xx lança erro com o status", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "segredo-123");
    vi.stubEnv("EMAIL_FROM", "nao-responda@eneven.com.br");
    fetchMock.mockResolvedValue(new Response("nope", { status: 401 }));

    await expect(sendEmail(message)).rejects.toThrow(/401/);
  });

  it("com token mas sem EMAIL_FROM lança erro em vez de enviar", async () => {
    vi.stubEnv("ZEPTOMAIL_TOKEN", "segredo-123");
    vi.stubEnv("EMAIL_FROM", "");

    await expect(sendEmail(message)).rejects.toThrow(/EMAIL_FROM/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
