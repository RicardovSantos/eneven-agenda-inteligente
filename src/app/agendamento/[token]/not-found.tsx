import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/booking/not-found-screen";

export const metadata: Metadata = {
  title: "Agendamento não encontrado",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Token inválido: nada sobre o agendamento é revelado. */
export default function ManageNotFound() {
  return (
    <NotFoundScreen
      title="Não encontramos esse agendamento."
      text="Confira o link que você recebeu. Se precisar, fale com o estabelecimento."
    />
  );
}
