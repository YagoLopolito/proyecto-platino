import "server-only";

export {
  generateAiGamePlan,
  generateAiRecommendations,
  generateTrophyHint,
  generateGameDescription,
  generateTimeEstimates,
} from "./client";
export { AiProviderError, AiSchemaValidationError } from "./errors";
export { aiGamePlanSchema, parseAiGamePlan, type AiGamePlan } from "./schema";
export { aiRecommendationsSchema, parseAiRecommendations, type AiRecommendations } from "./schema";
export {
  buildAiPlanUserPrompt,
  AI_PLAN_SYSTEM_PROMPT,
  type AiPlanInput,
  type AiPlanTrophyInput,
  type AiPlanGuideInput,
  type TrophyHintInput,
  type GameDescriptionInput,
  TIME_ESTIMATES_SYSTEM_PROMPT,
  buildTimeEstimatesUserPrompt,
  type TimeEstimatesInput,
  AI_RECOMMENDATIONS_SYSTEM_PROMPT,
  buildAiRecommendationsUserPrompt,
  type AiRecommendationsInput,
  type AiRecommendationLibraryInput,
  type AiRecommendationPlatinumInput,
} from "./prompt";
