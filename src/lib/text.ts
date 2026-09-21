/** Enforce a hard character cap on outreach notes without cutting mid-word.
 *  Prefers to end on a sentence boundary; otherwise trims to the last whole
 *  word and strips trailing punctuation/whitespace. */
export function capNote(text: string, max = 280): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  let end = -1;
  for (const p of [".", "!", "?"]) end = Math.max(end, cut.lastIndexOf(p));
  if (end >= 200) return cut.slice(0, end + 1).trim();
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?—-]+$/, "").trim();
}
