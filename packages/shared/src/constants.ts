export const DEFAULT_HANDOFF_CONFIDENCE_THRESHOLD = 0.3;
export const DEFAULT_MAX_FAILED_ATTEMPTS = 3;
export const DEFAULT_HANDOFF_MESSAGE = "እባክዎ ይጠብቁ፣ ወደ ወኪላችን እያስተላለፍዎት ነው።"; // "Please wait, transferring you to our agent."
export const DEFAULT_GREETING = "ሰላም! እንዴት ልረዳዎት እችላለሁ?"; // "Hello! How can I help you?"
export const DEFAULT_AGENT_LANGUAGE = "am" as const;
export const DEFAULT_LLM_PROVIDER = "openai" as const;
export const DEFAULT_LLM_MODEL = "gpt-4o";
export const DEFAULT_STT_PROVIDER = "google" as const;
export const DEFAULT_TTS_PROVIDER = "google" as const;
export const DEFAULT_TTS_VOICE = "am-ET-Wavenet-A";

export const CALL_STATUSES = [
  "ringing",
  "in_progress",
  "ai_handling",
  "queued",
  "human_handling",
  "completed",
  "failed",
  "missed",
] as const;

export const MEMBER_ROLES = ["owner", "admin", "agent", "viewer"] as const;
