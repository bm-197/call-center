// ─── Call Types ───

export type CallDirection = "inbound" | "outbound";

export type CallStatus =
  | "ringing"
  | "in_progress"
  | "ai_handling"
  | "queued"
  | "human_handling"
  | "completed"
  | "failed"
  | "missed";

export type HandoffReason =
  | "low_confidence"
  | "max_failed_attempts"
  | "customer_request"
  | "agent_rule";

// ─── Agent Types ───

export type AgentLanguage = "am" | "en" | "am+en";
export type AgentStatus = "draft" | "active" | "paused";
export type LLMProvider = "openai" | "google";
export type STTProvider = "google" | "whisper";
export type TTSProvider = "google";

// ─── Knowledge Base Types ───

export type KBSourceType = "file" | "url" | "text" | "faq";
export type KBStatus = "pending" | "processing" | "completed" | "failed";

// ─── Organization Types ───

export type MemberRole = "owner" | "admin" | "agent" | "viewer";
export type InvitationStatus = "pending" | "accepted" | "expired";

// ─── SSE Event Types ───

export type SSEEvent =
  | { type: "call:incoming"; data: { callId: string; callerNumber: string; agentName: string } }
  | { type: "call:status"; data: { callId: string; status: CallStatus } }
  | { type: "call:handoff"; data: { callId: string; reason: HandoffReason; transcript: TranscriptEntry[] } }
  | { type: "call:ended"; data: { callId: string; duration: number } }
  | { type: "queue:update"; data: { waiting: number; active: number } }
  | { type: "transcript:live"; data: { callId: string; entry: TranscriptEntry } };

export interface TranscriptEntry {
  speaker: "caller" | "agent" | "human_agent";
  text: string;
  timestamp: number;
}
