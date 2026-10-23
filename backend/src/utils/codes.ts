/**
 * Ahununu Logistics tracks meetings, decisions and action items the same
 * way it tracks shipments: every record gets a human-readable manifest
 * code, e.g. MTG-2026-0148, DEC-2026-0091, ACT-2026-0392.
 */
import { prisma } from "../lib/prisma";

export function makeCode(prefix: "MTG" | "DEC" | "ACT", sequence: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Parses the numeric sequence suffix from a code like "ACT-2026-0045"
 */
function parseSequence(code: string, prefix: string, year: number): number {
  const regex = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const match = code.match(regex);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Finds the highest sequence number existing for this prefix and year.
 */
async function getMaxSequence(prefix: "MTG" | "DEC" | "ACT", year: number): Promise<number> {
  const prefixYear = `${prefix}-${year}-`;
  let maxSeq = 0;

  if (prefix === "ACT") {
    const items = await prisma.actionItem.findMany({
      where: { code: { startsWith: prefixYear } },
      select: { code: true },
    });
    for (const item of items) {
      const seq = parseSequence(item.code, prefix, year);
      if (seq > maxSeq) maxSeq = seq;
    }
    const count = await prisma.actionItem.count();
    if (count > maxSeq) maxSeq = count;
  } else if (prefix === "MTG") {
    const items = await prisma.meeting.findMany({
      where: { code: { startsWith: prefixYear } },
      select: { code: true },
    });
    for (const item of items) {
      const seq = parseSequence(item.code, prefix, year);
      if (seq > maxSeq) maxSeq = seq;
    }
    const count = await prisma.meeting.count();
    if (count > maxSeq) maxSeq = count;
  } else if (prefix === "DEC") {
    const items = await prisma.decision.findMany({
      where: { code: { startsWith: prefixYear } },
      select: { code: true },
    });
    for (const item of items) {
      const seq = parseSequence(item.code, prefix, year);
      if (seq > maxSeq) maxSeq = seq;
    }
    const count = await prisma.decision.count();
    if (count > maxSeq) maxSeq = count;
  }

  return maxSeq;
}

async function codeExists(prefix: "MTG" | "DEC" | "ACT", code: string): Promise<boolean> {
  if (prefix === "ACT") {
    const found = await prisma.actionItem.findUnique({ where: { code }, select: { id: true } });
    return !!found;
  }
  if (prefix === "MTG") {
    const found = await prisma.meeting.findUnique({ where: { code }, select: { id: true } });
    return !!found;
  }
  if (prefix === "DEC") {
    const found = await prisma.decision.findUnique({ where: { code }, select: { id: true } });
    return !!found;
  }
  return false;
}

/**
 * Returns the next available unique code for MTG, DEC, or ACT.
 * Queries existing records to find the true highest sequence number for the current year,
 * ensuring no collisions even after deletions or skipped numbers.
 * Also verifies uniqueness in a loop to guarantee 100% collision-free codes.
 */
export async function getNextCode(prefix: "MTG" | "DEC" | "ACT"): Promise<string> {
  const year = new Date().getFullYear();
  let seq = (await getMaxSequence(prefix, year)) + 1;
  let code = makeCode(prefix, seq);

  while (await codeExists(prefix, code)) {
    seq++;
    code = makeCode(prefix, seq);
  }
  return code;
}

/**
 * Returns N consecutive unique codes for MTG, DEC, or ACT.
 */
export async function getNextCodes(prefix: "MTG" | "DEC" | "ACT", count: number): Promise<string[]> {
  if (count <= 0) return [];
  const year = new Date().getFullYear();
  let seq = (await getMaxSequence(prefix, year)) + 1;
  const codes: string[] = [];

  while (codes.length < count) {
    const candidate = makeCode(prefix, seq);
    seq++;
    if (!(await codeExists(prefix, candidate)) && !codes.includes(candidate)) {
      codes.push(candidate);
    }
  }

  return codes;
}
