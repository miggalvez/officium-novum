import type { TextContent } from '@officium-novum/parser';

/**
 * Formula names at the head of the Laudes `#Incipit` that together constitute
 * the "secreto Pater / Ave" block recited at Lauds when it is prayed
 * separately from Matins. Under 1911 / Divino Afflatu these remain in the
 * composed output; the 1955 and 1960 simplified rubrics already suppress them
 * via the `(sed rubrica 196 aut rubrica 1955 aut rubrica altovadensis
 * omittuntur)` condition on the enclosing branch, so no filter is needed
 * there.
 *
 * The names are matched case-insensitively against the `formulaRef.name`
 * field exactly as the parser produces it from `$rubrica Secreto a Laudibus`,
 * `$Pater noster`, and `$Ave Maria` tokens in `horas/Ordinarium/Laudes.txt`.
 */
const LAUDS_SECRETO_FORMULA_NAMES: ReadonlySet<string> = new Set(
  ['rubrica secreto a laudibus', 'pater noster', 'ave maria']
);

/**
 * Drop the secreto Pater / Ave block from the Laudes incipit.
 *
 * Per ADR-010, this runs only when the caller has explicitly set
 * `ComposeOptions.joinLaudsToMatins = true` — i.e. the caller has just
 * prayed Matins (which emits the Pater / Ave / Credo aloud at its own
 * opening) and is continuing into Lauds, so the Lauds secreto recitation
 * would duplicate what was already said.
 *
 * The walker recurses through `conditional.content` because Phase 1's
 * resolver collapses the `Laudes.txt` `#Incipit` into nested conditionals
 * gated on `rubrica cisterciensis`, `^Trident`, etc.; the secreto formula
 * refs live 4 levels deep. Empty conditionals left over after filtering
 * are retained unchanged — the downstream flattener and emitter handle them
 * gracefully.
 */
export function stripLaudsSecretoPrayers(
  content: readonly TextContent[]
): readonly TextContent[] {
  return content
    .map((node) => filterNode(node))
    .filter((node): node is TextContent => node !== undefined);
}

function filterNode(node: TextContent): TextContent | undefined {
  if (node.type === 'formulaRef') {
    const key = node.name.trim().toLowerCase();
    if (LAUDS_SECRETO_FORMULA_NAMES.has(key)) {
      return undefined;
    }
    return node;
  }
  if (node.type === 'conditional') {
    const filteredChildren = stripLaudsSecretoPrayers(node.content);
    return { ...node, content: [...filteredChildren] };
  }
  return node;
}
