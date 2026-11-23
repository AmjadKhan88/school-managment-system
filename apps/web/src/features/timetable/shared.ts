import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const LEAVE_LABEL: Record<string, string> = {
  SICK: "Sick leave",
  CASUAL: "Casual leave",
  ANNUAL: "Annual leave",
  EMERGENCY: "Emergency",
  FAMILY: "Family event",
  MATERNITY: "Maternity leave",
  UNPAID: "Unpaid leave",
  OTHER: "Other",
};

export interface Period {
  id: string;
  sortOrder: number;
  name: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}
export interface Room {
  id: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
}
export interface Setup {
  workingDays: number[];
  periods: Period[];
  rooms: Room[];
}

export const useSetup = (sessionId: string) =>
  useQuery({
    queryKey: ["timetable", "setup", sessionId],
    enabled: !!sessionId,
    queryFn: async () =>
      (
        await api.get<{ data: Setup }>("/timetable/setup", {
          params: { sessionId },
        })
      ).data.data,
  });

/** Room names, to suggest the same names wherever a room is typed. Quietly empty for people without timetable permission. */
export const useRooms = () =>
  useQuery({
    queryKey: ["timetable", "rooms"],
    retry: false,
    queryFn: async () =>
      (await api.get<{ data: Room[] }>("/timetable/rooms")).data.data,
  });
