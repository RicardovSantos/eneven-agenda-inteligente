import type { Metadata } from "next";
import { DemoBooking } from "./simulacao";

export const metadata: Metadata = {
  title: "Conheça a agenda | Eneven",
  robots: { index: false, follow: false },
};

/** Demonstração sem banco ou envio de mensagens. */
export default function DemoPage() {
  return <DemoBooking />;
}
