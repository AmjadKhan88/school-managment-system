export interface SessionInfo { id: string; name: string; isActive?: boolean }
export interface AuthUser {
  id: string; fullName: string; email: string;
  school: { id: string; name: string; logoUrl: string | null };
  roles: { slug: string; name: string }[];
  permissions: string[]; // "module:ACTION"
  activeSession: SessionInfo | null;
  sessions: SessionInfo[];
}
