import type { Metadata } from "next";
import { NotFoundScreen } from "@/components/booking/not-found-screen";

export const metadata: Metadata = {
  title: "Estabelecimento não encontrado",
  robots: { index: false },
};

/** Slug inexistente ou reservado: 404 com a marca Eneven. */
export default function SlugNotFound() {
  return (
    <NotFoundScreen
      title="Não encontramos esse estabelecimento."
      text="Confira o link que você recebeu ou peça um novo ao estabelecimento."
    />
  );
}
