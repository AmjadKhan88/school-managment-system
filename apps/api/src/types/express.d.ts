declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      schoolId: string;
      branchId: string | null;
      email: string;
      fullName: string;
      roles: string[];
      permissions: Set<string>; // "module:ACTION"
    }
    interface Request {
      user?: AuthUser;
    }
  }
}
export {};
