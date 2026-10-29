import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInviteEmail,
  buildResetEmail,
  buildVerifyEmail,
  escapeHtml,
  inviteLink,
} from "@/server/email/templates";

afterEach(() => vi.unstubAllEnvs());

describe("escapeHtml", () => {
  it("escapa os cinco caracteres especiais", () => {
    expect(escapeHtml(`<b>"A" & 'B'</b>`)).toBe(
      "&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;",
    );
  });
});

describe("buildVerifyEmail", () => {
  const link = "https://app.eneven.com.br/confirmar-email?token=abc123";

  it("usa o assunto, o título, o botão e as notas do texto aprovado", () => {
    vi.stubEnv("APP_URL", "https://app.eneven.com.br/");
    const mail = buildVerifyEmail({
      name: "Ana Souza",
      businessName: "Studio Defendi",
      link,
    });

    expect(mail.subject).toBe("Confirme seu e-mail na Eneven Agenda");
    expect(mail.html).toContain("Confirme seu e-mail");
    expect(mail.html).toContain(
      "Olá, Ana. Confirme seu e-mail para liberar o link de agendamento de Studio Defendi.",
    );
    expect(mail.html).toContain("Confirmar e-mail");
    expect(mail.html).toContain(
      "O link vale por 48 horas. Se você não criou esta conta, ignore este e-mail.",
    );
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain("https://app.eneven.com.br/brand/logo-email.png");
    expect(mail.html).not.toContain("/brand/logo.png");
    expect(mail.html).toMatch(/<img src="[^"]*logo-email\.png" width="160"/);
    expect(mail.html).toContain("Eneven Agendamentos Inteligentes");
    expect(mail.html).toContain("linear-gradient(90deg,#3E07D2,#9429F7,#F581FB)");
  });

  it("tem versão em texto puro com o link", () => {
    const mail = buildVerifyEmail({ name: "Ana", businessName: "Studio", link });
    expect(mail.text).toContain("Olá, Ana.");
    expect(mail.text).toContain(link);
    expect(mail.text).toContain("O link vale por 48 horas.");
    expect(mail.text).not.toMatch(/<[a-z]/i);
  });

  it("escapa nomes com HTML (sem tag injetada)", () => {
    const mail = buildVerifyEmail({
      name: "<b>Ana</b> Souza",
      businessName: `<script>alert(1)</script> & "Cia"`,
      link,
    });
    expect(mail.html).not.toContain("<b>Ana</b>");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(mail.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Cia&quot;");
    // Texto puro não escapa (não é HTML).
    expect(mail.text).toContain("<b>Ana</b>");
  });

  it("escapa o link dentro do atributo href", () => {
    const mail = buildVerifyEmail({
      name: "Ana",
      businessName: "Studio",
      link: `https://x.com/a?b=1&c="2"`,
    });
    expect(mail.html).toContain(`href="https://x.com/a?b=1&amp;c=&quot;2&quot;"`);
  });
});

describe("buildResetEmail", () => {
  it("usa o assunto, o título, o botão e as notas do texto aprovado", () => {
    const link = "https://app.eneven.com.br/recuperar-senha/tok";
    const mail = buildResetEmail({ email: "ana@defendi.com", link });

    expect(mail.subject).toBe("Redefinir sua senha da Eneven Agenda");
    expect(mail.html).toContain("Redefinir senha");
    expect(mail.html).toContain(
      "Recebemos um pedido para criar uma nova senha para ana@defendi.com.",
    );
    expect(mail.html).toContain("Criar nova senha");
    expect(mail.html).toContain(
      "O link vale por 1 hora. Se não foi você, ignore este e-mail: sua senha continua a mesma.",
    );
    expect(mail.text).toContain(link);
  });
});

describe("buildInviteEmail", () => {
  it("inviteLink aponta para /convite/{token}", () => {
    vi.stubEnv("APP_URL", "https://app.eneven.com.br/");
    expect(inviteLink("abc_-123")).toBe("https://app.eneven.com.br/convite/abc_-123");
  });

  it("usa o assunto com o nome do estabelecimento, o link e escapa nomes no html", () => {
    const link = "https://app.eneven.com.br/convite/tok";
    const mail = buildInviteEmail({
      name: "Rita <b>Souza</b>",
      tenantName: `Studio "Bela" & <i>Cia</i>`,
      role: "reception",
      link,
    });
    expect(mail.subject).toBe(`Studio "Bela" & <i>Cia</i> convidou você para a agenda`);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain("Studio &quot;Bela&quot; &amp; &lt;i&gt;Cia&lt;/i&gt;");
    expect(mail.html).toContain("Rita");
    expect(mail.html).not.toContain("<i>Cia</i>");
    expect(mail.html).not.toContain("<b>Souza</b>");
    expect(mail.html).toContain("O link vale por 7 dias.");
    expect(mail.text).toContain(link);
  });

  it("descreve o papel (recepção ou profissional)", () => {
    const base = { name: "Rita", tenantName: "Studio", link: "https://x.com/convite/t" };
    expect(buildInviteEmail({ ...base, role: "reception" }).text).toContain("recepção");
    expect(buildInviteEmail({ ...base, role: "staff" }).text).toContain("profissional");
  });

  it("convite de proprietário: assunto próprio", () => {
    const mail = buildInviteEmail({
      name: "Dona Ana",
      tenantName: "Studio",
      role: "owner",
      link: "https://x.com/convite/t",
    });
    expect(mail.subject).toBe("Sua agenda na Eneven está pronta");
    expect(mail.text).toContain("Studio");
  });

  it("não deixa quebra de linha no assunto", () => {
    const mail = buildInviteEmail({
      name: "R",
      tenantName: "Studio\r\nBcc: x@y.com",
      role: "staff",
      link: "https://x.com/convite/t",
    });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});
