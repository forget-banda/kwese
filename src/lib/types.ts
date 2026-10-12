export type Role = "admin" | "bursar" | "general";

export type Actor = {
  id: number;
  username: string;
  role: Role;
  mustChangePassword?: boolean;
};
