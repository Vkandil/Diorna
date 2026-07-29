export const AI_DEFAULT_REQUEST_TIMEOUT_SECONDS = 120;
export const AI_DEFAULT_REPAIR_TIMEOUT_SECONDS = 60;
export const AI_DEFAULT_MAX_TOKENS = 6500;

export const AI_REQUEST_TIMEOUT_RANGE = { min: 30, max: 300 } as const;
export const AI_REPAIR_TIMEOUT_RANGE = { min: 15, max: 180 } as const;
export const AI_MAX_TOKENS_RANGE = { min: 1000, max: 12_000 } as const;

export type AiMapNoteOrganization = "tags" | "folder" | "both";
