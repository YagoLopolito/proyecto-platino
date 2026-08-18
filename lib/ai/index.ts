import "server-only";

export { generateAiGamePlan, generateTrophyHint } from "./client";
export { AiProviderError, AiSchemaValidationError } from "./errors";
export { aiGamePlanSchema, parseAiGamePlan, type AiGamePlan } from "./schema";
export {
  buildAiPlanUserPrompt,
  AI_PLAN_SYSTEM_PROMPT,
  type AiPlanInput,
  type AiPlanTrophyInput,
  type AiPlanGuideInput,
  type TrophyHintInput,
} from "./prompt";
