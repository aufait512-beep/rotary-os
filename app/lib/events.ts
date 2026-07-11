export type EventItem = {
  id: string;
  rotaryYearId: string;
  title: string;
  eventType: string;
  meetingNo: string;
  date: string;
  weekday: string;
  dinnerTime: string;
  meetingTime: string;
  endTime: string;
  location: string;
  room: string;
  topic: string;
  speaker: string;
  fellowshipChair: string;
  sergeantAtArms: string;
  description: string;
  note: string;
};

export const EVENTS_STORAGE_KEY = "rotary-os-events";

export const emptyEventItem: Omit<EventItem, "id"> = {
  rotaryYearId: "",
  title: "",
  eventType: "",
  meetingNo: "",
  date: "",
  weekday: "",
  dinnerTime: "18:30",
  meetingTime: "19:15",
  endTime: "20:10",
  location: "",
  room: "",
  topic: "",
  speaker: "",
  fellowshipChair: "",
  sergeantAtArms: "",
  description: "",
  note: "",
};

export const defaultEventTimes = {
  dinnerTime: "18:30",
  meetingTime: "19:15",
  endTime: "20:10",
};

export const defaultRotaryYears: Omit<RotaryYear, "id" | "createdAt">[] = [
  {
    name: "2026-2027",
    displayName: "26-27年度",
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    isActive: true,
  },
];

export function readEventsFromStorage(): EventItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawEvents = window.localStorage.getItem(EVENTS_STORAGE_KEY);
    if (!rawEvents) {
      return [];
    }

    const parsedEvents = JSON.parse(rawEvents);
    if (!Array.isArray(parsedEvents)) {
      return [];
    }

    return parsedEvents;
  } catch {
    return [];
  }
}

export function writeEventsToStorage(events: EventItem[]) {
  window.localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
}

export function sortEventsByDate(events: EventItem[]) {
  return [...events].sort((firstEvent, secondEvent) =>
    `${firstEvent.date} ${firstEvent.meetingTime}`.localeCompare(
      `${secondEvent.date} ${secondEvent.meetingTime}`
    )
  );
}

export type RotaryYear = {
  id: string;
  name: string;
  displayName: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
};
