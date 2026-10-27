export type WizardService = {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
};

export type WizardProfessional = {
  id: string;
  name: string;
  color: string | null;
  /** Ligado ao usuário proprietário (por `userId`, não pela posição). */
  isOwner: boolean;
};
