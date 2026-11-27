// Hur ljudet för rätt svar följer sviten. Ren logik, utan ljudkod.

/** 10, 20, 30 … är milstolpar. Returnerar nivån (1 för 10, 2 för 20 …), annars 0. */
export const milestoneLevel = (n: number) => (n >= 10 && n % 10 === 0 ? n / 10 : 0)

/** Ljudets nivå (0–4) efter `combo` rätt i rad innan det här svaret. Nivån stiger ett steg var
 *  femte rätt upp till 4. Därefter stannar den inte på toppen utan går i vågor – ned till 1 och
 *  upp till 4 igen – så att en lång svit fortsätter att låta olika i stället för konstant ljust. */
export function streakTier(combo: number): number {
  const block = Math.floor(Math.max(0, combo) / 5)
  if (block <= 4) return block
  return [3, 2, 1, 2, 3, 4][(block - 5) % 6]
}
