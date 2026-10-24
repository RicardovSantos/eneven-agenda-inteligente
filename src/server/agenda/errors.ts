export type BookingErrorCode =
  | "slot_taken"
  | "outside_window"
  | "invalid_selection"
  | "invalid_transition"
  | "not_found";

export const SLOT_TAKEN_MESSAGE = "Esse horário acabou de ser reservado. Escolha outro.";

const MESSAGES: Record<BookingErrorCode, string> = {
  slot_taken: SLOT_TAKEN_MESSAGE,
  outside_window: "Fora do prazo para remarcar ou cancelar. Fale com o estabelecimento.",
  invalid_selection: "Serviço ou profissional indisponível.",
  invalid_transition: "Não é possível mudar o status deste agendamento.",
  not_found: "Agendamento não encontrado.",
};

export class BookingError extends Error {
  readonly code: BookingErrorCode;

  constructor(code: BookingErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = "BookingError";
    this.code = code;
  }
}
