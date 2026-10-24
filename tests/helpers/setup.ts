import { afterEach } from "vitest";
import { closeTestDbs } from "./test-db";

// Cada teste cria o próprio banco PGlite; fechar ao fim de cada um evita
// acumular dezenas de bancos (memória) por worker e travar a suíte sob carga.
afterEach(async () => {
  await closeTestDbs();
});
