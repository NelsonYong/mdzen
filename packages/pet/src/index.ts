export type { CreatePetOptions, Pet } from './shared/types.ts';

export function createPet(opts: import('./shared/types.ts').CreatePetOptions): import('./shared/types.ts').Pet {
  void opts;
  throw new Error('not implemented yet');
}
