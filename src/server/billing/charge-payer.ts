/** Dados do pagador que a Mercado Pago exige para emitir boleto. Vão direto para ela e não são guardados aqui. */
export type BoletoPayer = {
  name: string;
  document: string;
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
};

const STATES = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);

const digits = (value: string) => value.replace(/\D/g, "");

function cpfValid(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(cpf[length])) return false;
  }
  return true;
}

function cnpjValid(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  for (const length of [12, 13]) {
    let sum = 0;
    let weight = length - 7;
    for (let i = 0; i < length; i++) {
      sum += Number(cnpj[i]) * weight--;
      if (weight < 2) weight = 9;
    }
    const check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (check !== Number(cnpj[length])) return false;
  }
  return true;
}

export type PayerErrors = Partial<Record<keyof BoletoPayer, string>>;

/** Limpa e valida; devolve os dados no formato da Mercado Pago ou os erros por campo. */
export function parseBoletoPayer(
  input: Record<string, unknown>,
): { ok: true; payer: BoletoPayer & { documentType: "CPF" | "CNPJ" } } | { ok: false; errors: PayerErrors } {
  const text = (key: keyof BoletoPayer, max: number) =>
    typeof input[key] === "string" ? (input[key] as string).trim().replace(/\s+/g, " ").slice(0, max) : "";
  const errors: PayerErrors = {};
  const name = text("name", 80);
  if (name.split(" ").filter(Boolean).length < 2) errors.name = "Informe o nome completo.";
  const document = digits(text("document", 20));
  const documentType = document.length === 14 ? "CNPJ" : "CPF";
  if (!(documentType === "CNPJ" ? cnpjValid(document) : cpfValid(document))) errors.document = "CPF ou CNPJ inválido.";
  const zipCode = digits(text("zipCode", 12));
  if (!/^\d{8}$/.test(zipCode)) errors.zipCode = "CEP inválido.";
  const street = text("street", 80);
  if (!street) errors.street = "Informe a rua.";
  const number = text("number", 10);
  if (!number) errors.number = "Informe o número.";
  const neighborhood = text("neighborhood", 60);
  if (!neighborhood) errors.neighborhood = "Informe o bairro.";
  const city = text("city", 60);
  if (!city) errors.city = "Informe a cidade.";
  const state = text("state", 2).toUpperCase();
  if (!STATES.has(state)) errors.state = "Escolha o estado.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, payer: { name, document, documentType, zipCode, street, number, neighborhood, city, state } };
}
