import { createPet } from "@seren/pet";
import { DOC_ROOT } from "./config.ts";

export const pet = createPet({
  workspaceRoot: DOC_ROOT,
  // llm: {
  //   apiKey: process.env.OPENAI_API_KEY,
  //   baseURL: process.env.OPENAI_BASE_URL,
  //   model: process.env.OPENAI_MODEL,
  // },
  llm: {
    apiKey: "bc926e1d-486d-42af-aff2-731fcfa2887e",
    baseURL: "http://code.ugreencloud.com:8000/v1",
    model: "ugreen-ai-model",
  },
});
