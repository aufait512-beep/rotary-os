export type EventItem = {
  id: string;
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
  title: "",
  eventType: "",
  meetingNo: "",
  date: "",
  weekday: "",
  dinnerTime: "",
  meetingTime: "",
  endTime: "",
  location: "",
  room: "",
  topic: "",
  speaker: "",
  note: "",
};

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
    firstEvent.date.localeCompare(secondEvent.date)
  );
}
