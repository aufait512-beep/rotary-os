export type ProgramItem = {
  id: string;
  templateId: string;
  eventId: string;
  meetingName: string;
  date: string;
  dinnerTime: string;
  meetingTime: string;
  location: string;
  room: string;
  topic: string;
  speaker: string;
  fellowshipChair: string;
  sergeantAtArms: string;
  upcomingRangeMode: string;
  upcomingStartDate: string;
  upcomingEndDate: string;
  upcomingInsertPosition: string;
};

export const PROGRAMS_STORAGE_KEY = "rotary-os-programs";

export const emptyProgramItem: Omit<ProgramItem, "id"> = {
  templateId: "",
  eventId: "",
  meetingName: "",
  date: "",
  dinnerTime: "",
  meetingTime: "",
  location: "",
  room: "",
  topic: "",
  speaker: "",
  fellowshipChair: "",
  sergeantAtArms: "",
  upcomingRangeMode: "2_months",
  upcomingStartDate: "",
  upcomingEndDate: "",
  upcomingInsertPosition: "template",
};

export function readProgramsFromStorage(): ProgramItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawPrograms = window.localStorage.getItem(PROGRAMS_STORAGE_KEY);
    if (!rawPrograms) {
      return [];
    }

    const parsedPrograms = JSON.parse(rawPrograms);
    if (!Array.isArray(parsedPrograms)) {
      return [];
    }

    return parsedPrograms.map(normalizeProgramItem);
  } catch {
    return [];
  }
}

export function writeProgramsToStorage(programs: ProgramItem[]) {
  window.localStorage.setItem(PROGRAMS_STORAGE_KEY, JSON.stringify(programs));
}

export function sortProgramsByDate(programs: ProgramItem[]) {
  return [...programs].sort((firstProgram, secondProgram) =>
    firstProgram.date.localeCompare(secondProgram.date)
  );
}

function normalizeProgramItem(program: Partial<ProgramItem>): ProgramItem {
  return {
    id: program.id ?? crypto.randomUUID(),
    templateId: program.templateId ?? "",
    eventId: program.eventId ?? "",
    meetingName: program.meetingName ?? "",
    date: program.date ?? "",
    dinnerTime: program.dinnerTime ?? "",
    meetingTime: program.meetingTime ?? "",
    location: program.location ?? "",
    room: program.room ?? "",
    topic: program.topic ?? "",
    speaker: program.speaker ?? "",
    fellowshipChair: program.fellowshipChair ?? "",
    sergeantAtArms: program.sergeantAtArms ?? "",
    upcomingRangeMode: program.upcomingRangeMode ?? "2_months",
    upcomingStartDate: program.upcomingStartDate ?? "",
    upcomingEndDate: program.upcomingEndDate ?? "",
    upcomingInsertPosition: program.upcomingInsertPosition ?? "template",
  };
}
