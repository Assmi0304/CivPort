export interface Comment {
  id: string;
  userId: string;
  userNickname: string;
  text: string;
  createdAt: number;
}

export type IssueCategory = "pothole" | "streetlight" | "garbage" | "water_leak" | "other";
export type IssueSeverity = "low" | "medium" | "high";
export type IssueStatus = "reported" | "verified" | "in_progress" | "resolved";

export interface CivicIssue {
  id: string;
  reporterHandle: string;
  photoUrl: string;
  description: string;
  clean_description: string;
  category: string;
  severity: string;
  is_authentic: boolean;
  is_spam: boolean;
  hidden: boolean;
  area: string;
  lat: number;
  lng: number;
  createdAt: number;
  status: string;
  upvotes: number;
  upvotedBy?: string[];
  comments?: Comment[];
}

