import type { Database } from "@/types/database";

type MemberRole = Database["public"]["Enums"]["member_role"];

export const roleLabels: Record<MemberRole, string> = {
  owner: "Vlasnik",
  admin: "Administrator",
  manager: "Menadžer",
  worker: "Radnik",
};
