import type { CrossReference } from '../types/directives.js';
import type { TextContent } from '../types/schema.js';

export interface ReferenceResolveContext {
  sourceFile: string;
  section: string;
}

export interface ReferenceResolver {
  resolve(reference: CrossReference, context: ReferenceResolveContext): Promise<TextContent[]>;
}

export class UnimplementedReferenceResolver implements ReferenceResolver {
  async resolve(_reference: CrossReference, _context: ReferenceResolveContext): Promise<TextContent[]> {
    throw new Error('Reference resolver is not implemented in Phase 1 scaffold.');
  }
}
