import { memo } from "react";
import type {
  CalendarEventAccount,
  CalendarEventSource,
} from "./CalendarEventCreateDialog";

export type CalendarFamilyMember = {
  id: string;
  displayName: string;
  color: string;
};

export type FamilyParticipant = CalendarFamilyMember & {
  email?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function resolveFamilyParticipants(
  members: CalendarFamilyMember[],
  sources: CalendarEventSource[],
  accounts: CalendarEventAccount[],
): FamilyParticipant[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return members.map((member) => {
    const source = sources.find(
      (candidate) =>
        candidate.personId === member.id &&
        emailPattern.test(candidate.externalCalendarId),
    );
    const primarySource = sources.find(
      (candidate) =>
        candidate.personId === member.id &&
        candidate.externalCalendarId === "primary",
    );
    const primaryEmail = primarySource
      ? accountById.get(primarySource.connectedAccountId)?.email
      : undefined;
    return {
      ...member,
      email: source?.externalCalendarId ?? primaryEmail ?? undefined,
    };
  });
}

export function participantEmails(
  participants: FamilyParticipant[],
  selectedIds: string[],
  organizerEmail?: string,
): string[] {
  const organizer = organizerEmail?.toLocaleLowerCase();
  return Array.from(
    new Set(
      participants
        .filter(
          (participant) =>
            selectedIds.includes(participant.id) &&
            participant.email &&
            participant.email.toLocaleLowerCase() !== organizer,
        )
        .map((participant) => participant.email!),
    ),
  );
}

type Props = {
  participants: FamilyParticipant[];
  organizerEmail?: string;
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
};

export const FamilyParticipantPicker = memo(function FamilyParticipantPicker({
  participants,
  organizerEmail,
  selectedIds,
  onChange,
}: Props): JSX.Element {
  const organizer = organizerEmail?.toLocaleLowerCase();

  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="text-sm font-semibold text-slate-700">
        Participants <span className="font-normal">(optional)</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {participants.map((participant) => {
          const isOrganizer =
            Boolean(participant.email) &&
            participant.email?.toLocaleLowerCase() === organizer;
          const disabled = !participant.email || isOrganizer;
          const selected = selectedIds.includes(participant.id);
          const explanation = isOrganizer
            ? "Organizer"
            : !participant.email
              ? "No email connected"
              : undefined;
          return (
            <label
              key={participant.id}
              className={`flex min-h-[40px] items-center gap-2 rounded-full border px-3 text-sm font-semibold ${
                disabled
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  : selected
                    ? "cursor-pointer border-slate-500 text-slate-900"
                    : "cursor-pointer border-slate-300 bg-white text-slate-700"
              }`}
              style={
                selected && !disabled
                  ? { backgroundColor: participant.color }
                  : undefined
              }
              title={explanation}
            >
              <input
                type="checkbox"
                aria-label={participant.displayName}
                checked={selected && !disabled}
                disabled={disabled}
                onChange={() =>
                  onChange(
                    selected
                      ? selectedIds.filter((id) => id !== participant.id)
                      : [...selectedIds, participant.id],
                  )
                }
              />
              <span>{participant.displayName}</span>
              {explanation ? (
                <span className="text-[11px] font-medium">{explanation}</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
});
