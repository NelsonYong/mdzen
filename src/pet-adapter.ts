import { createPet } from '@mdzen/pet';
import { DOC_ROOT } from './config.ts';

export const pet = createPet({
  workspaceRoot: DOC_ROOT,
});
