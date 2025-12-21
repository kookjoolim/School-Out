export interface DismissalRecord {
  id: string;
  studentName: string;
  grade: number;
  dismissalMethod: string;
  timestamp: number;
  message: string;
}

export interface Student {
  id: string;
  name: string;
  grade: number;
}

export type UserRole = 'STUDENT' | 'TEACHER';
export type TeacherView = 'DASHBOARD' | 'ROSTER';

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
