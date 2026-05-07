import type { CreatePetOptions, Pet } from './shared/types.ts';
import { buildPet } from './server/handler.ts';

export type { CreatePetOptions, Pet, FsmState, Boundary, PersonalityConfig } from './shared/types.ts';

export function createPet(opts: CreatePetOptions): Pet {
  return buildPet(opts);
}
