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
  {
    name: "2027-2028",
    displayName: "27-28年度",
    startDate: "2027-07-01",
    endDate: "2028-06-30",
    isActive: false,
  },
  {
    name: "2028-2029",
    displayName: "28-29年度",
    startDate: "2028-07-01",
    endDate: "2029-06-30",
    isActive: false,
  },
  {
    name: "2029-2030",
    displayName: "29-30年度",
    startDate: "2029-07-01",
    endDate: "2030-06-30",
    isActive: false,
  },
  {
    name: "2030-2031",
    displayName: "30-31年度",
    startDate: "2030-07-01",
    endDate: "2031-06-30",
    isActive: false,
  },
  {
    name: "2031-2032",
    displayName: "31-32年度",
    startDate: "2031-07-01",
    endDate: "2032-06-30",
    isActive: false,
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
