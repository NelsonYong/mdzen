import { createPet } from '@mdzen/pet';
import { DOC_ROOT } from './config.ts';

export const pet = createPet({
  workspaceRoot: DOC_ROOT,
  llm: {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
  },
});
