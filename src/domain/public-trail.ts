export interface ParticipantDisplay {
  firstName: string | null;
  lastInitial: string | null;
  area: string | null;
  displayConsent: boolean;
}

export function publicLabel(person: ParticipantDisplay): string {
  if (!person.displayConsent || !person.firstName || !person.lastInitial || !person.area) {
    return "A friend";
  }
  return `${person.firstName} ${person.lastInitial}. · ${person.area}`;
}
