export interface DismissalRecord {
  id: string;
  studentName: string;
  grade: number;
  dismissalMethod: string; // e.g., 'School Bus', 'Parent Car'
  timestamp: number; // Unix timestamp based on user input time
  message: string; // AI generated message
}

export type UserRole = 'STUDENT' | 'TEACHER';

export interface Notification {
  id: string;
  title: string;
  body: string;
  visible: boolean;
}

export interface Source {
  title: string;
  uri: string;
}

export interface LunchData {
  menuText: string;
  sources: Source[];
}