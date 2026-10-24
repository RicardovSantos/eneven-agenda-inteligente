import { after } from "next/server";

/**
 * Roda `job` depois que a resposta foi enviada (`after` do Next), sem segurar
 * quem espera. Fora de uma requisição (testes, scripts) `after` lança e o
 * trabalho roda na hora. `job` deve tratar os próprios erros.
 */
export async function runAfterResponse(job: () => Promise<void>): Promise<void> {
  try {
    after(job);
  } catch {
    await job();
  }
}
