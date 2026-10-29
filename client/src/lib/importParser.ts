/**
 * importParser.ts  — v2
 *
 * Supports messy, free-form TXT as well as structured CSV/Excel.
 *
 * TXT rules (new):
 *  • A new character block starts whenever a NAME field is found
 *    (isim: / name: / karakter:).  Blank lines are NOT separators.
 *  • Values like "15 (+3)" → stripped to "15"
 *  • "Can 36/41" or "HP: 36/41" → stored as "36/41"
 *  • Section-only headers (lines ending with bare ":") are skipped.
 *  • Lines under "Envanter:", "Reaksiyonlar:", "Huylar:" are collected
 *    and appended as notes (not stats).
 *
 * CSV / Excel rules: unchanged — header row with name/class/level/STR/…
 */

import * as XLSX from 'xlsx';

export interface ParsedStat {
  name: string;
  value: string;
}

/** A single inventory item parsed from an Envanter / Inventory section */
export interface ParsedItem {
  name: string;
  notes: string; // e.g. "1d8 künt hasar, iki elli"
}

export interface ParsedCharacter {
  name: string;
  class: string;
  level: number;
  stats: ParsedStat[];
  items: ParsedItem[];     // inventory items → saved as session Items
  traits: string[];
  notes: string[];         // free-form lines (reactions, traits, misc…)
  rawLines?: string[];
}

// ── Key aliases (Turkish + English) ──────────────────────────────────────────
const NAME_KEYS  = ['isim', 'name', 'karakter', 'ad', 'character name', 'character'];
const CLASS_KEYS = ['sınıf', 'sinif', 'class', 'meslek', 'tip', 'karakter sınıfı'];
const LEVEL_KEYS = ['seviye', 'level', 'lvl', 'lv', 'karakter seviyesi'];
const HP_KEYS    = ['can', 'hp', 'hit points', 'canpuanı', 'can puanı'];
const AC_KEYS    = ['zırh', 'zirh', 'ac', 'armor class', 'savunma'];

// Section headers: inventory items get their own array; the rest go to notes
const ITEM_SECTIONS  = ['envanter', 'inventory', 'eşyalar', 'esyalar', 'ekipman', 'equipment'];
const TRAIT_SECTIONS = ['huylar', 'traits', 'özellikler', 'ozellikler', 'kişilik', 'kisilik'];
const OTHER_NOTE_SECTIONS = ['reaksiyonlar', 'reactions', 'yetenekler', 'notlar', 'notes'];

function matchKey(raw: string, aliases: string[]): boolean {
  const n = raw.toLowerCase().trim();
  return aliases.some((a) => n === a || n.startsWith(a));
}

/** Strip trailing parenthetical modifier: "15 (+3)" → "15", "12 (+1)" → "12" */
function stripModifier(val: string): string {
  return val.replace(/\s*\([+-]?\d+[^)]*\)\s*$/, '').trim();
}

// ── Single character block parser ─────────────────────────────────────────────
function parseBlock(lines: string[]): ParsedCharacter {
  const char: ParsedCharacter = { name: '', class: '', level: 1, stats: [], items: [], traits: [], notes: [] };
  let inNoteSection = false;
  let inItemSection = false;
  let inTraitSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const colonIdx = line.indexOf(':');

    // ── Line has no colon ────────────────────────────────────────────────────
    if (colonIdx === -1) {
      if (inItemSection) {
        // Plain item name with no description — e.g. "Kalkan"
        char.items.push({ name: line, notes: '' }); continue;
      }
      if (inTraitSection) { char.traits.push(line); continue; }
      // e.g. "Can 36/41" — try splitting on first whitespace
      const spIdx = line.search(/\s/);
      if (spIdx > 0) {
        const possibleKey = line.slice(0, spIdx);
        const possibleVal = line.slice(spIdx + 1).trim();
        if (matchKey(possibleKey, HP_KEYS) && possibleVal) {
          char.stats.push({ name: 'HP', value: possibleVal }); continue;
        }
        if (matchKey(possibleKey, AC_KEYS) && possibleVal) {
          char.stats.push({ name: 'AC', value: possibleVal }); continue;
        }
      }
      if (inNoteSection) char.notes.push(line);
      continue;
    }

    const rawKey = line.slice(0, colonIdx).trim();
    const rawVal = line.slice(colonIdx + 1).trim();

    // ── Section header only (e.g. "Envanter:") ───────────────────────────────
    if (!rawVal) {
      inItemSection  = ITEM_SECTIONS.some((s)  => rawKey.toLowerCase().startsWith(s));
      inTraitSection = !inItemSection && TRAIT_SECTIONS.some((s) => rawKey.toLowerCase().startsWith(s));
      inNoteSection  = !inItemSection && !inTraitSection && OTHER_NOTE_SECTIONS.some((s) => rawKey.toLowerCase().startsWith(s));
      continue;
    }

    if (TRAIT_SECTIONS.some((s) => rawKey.toLowerCase().startsWith(s))) {
      rawVal.split(/[,;|]+/).map((trait) => trait.trim()).filter(Boolean).forEach((trait) => char.traits.push(trait));
      inTraitSection = false;
      inItemSection = false;
      inNoteSection = false;
      continue;
    }

    // ── Inside an inventory / equipment section ───────────────────────────────
    // key:value format here means "ItemName: description" — NOT a stat
    if (inItemSection) {
      char.items.push({ name: rawKey, notes: rawVal }); continue;
    }
    if (inTraitSection) { char.traits.push(`${rawKey}: ${rawVal}`); continue; }

    // Reset note section when we hit a real key:value line outside item sections
    inNoteSection = false;

    const val = stripModifier(rawVal);

    if (matchKey(rawKey, NAME_KEYS))  { char.name  = rawVal; continue; }
    if (matchKey(rawKey, CLASS_KEYS)) { char.class = rawVal; continue; }
    if (matchKey(rawKey, LEVEL_KEYS)) { char.level = parseInt(val, 10) || 1; continue; }
    if (matchKey(rawKey, HP_KEYS))    { char.stats.push({ name: 'HP', value: val }); continue; }
    if (matchKey(rawKey, AC_KEYS))    { char.stats.push({ name: 'AC', value: val }); continue; }

    // Generic stat — e.g. "str: 15 (+3)" → STR: 15
    if (val && val !== '-') {
      char.stats.push({ name: rawKey.toUpperCase().trim(), value: val });
    }
  }

  return char;
}

// ── TXT parser ────────────────────────────────────────────────────────────────
function parseTxt(text: string): ParsedCharacter[] {
  const allLines = text.split('\n');

  // Find line indices where a new character starts (NAME field present)
  const nameLineIndices: number[] = [];
  allLines.forEach((line, i) => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      if (matchKey(key, NAME_KEYS)) nameLineIndices.push(i);
    }
  });

  // No name field found anywhere → single unnamed block, return warning
  if (nameLineIndices.length === 0) {
    const char = parseBlock(allLines);
    char.rawLines = allLines.map((l) => l.trim()).filter(Boolean);
    return [char];
  }

  // Split at each name line
  const blocks: string[][] = [];
  for (let b = 0; b < nameLineIndices.length; b++) {
    const start = nameLineIndices[b];
    const end = b < nameLineIndices.length - 1 ? nameLineIndices[b + 1] : allLines.length;
    blocks.push(allLines.slice(start, end));
  }

  return blocks.map(parseBlock).filter((c) => c.name);
}

async function extractPdfText(file: File): Promise<string> {
  const [pdfjs, pdfWorker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = '';

      for (const item of content.items) {
        if (!('str' in item)) continue;
        const text = item.str.trim();
        if (text) line += `${line ? ' ' : ''}${text}`;
        if (item.hasEOL && line) {
          lines.push(line);
          line = '';
        }
      }

      if (line) lines.push(line);
      pages.push(lines.join('\n'));
    }
  } finally {
    await document.destroy();
  }

  const text = pages.join('\n').trim();
  if (!text) {
    throw new Error('PDF dosyasında seçilebilir metin bulunamadı. Taranmış PDF dosyaları desteklenmiyor.');
  }
  return text;
}

// ── CSV / Excel parser ─────────────────────────────────────────────────────────
function parseSheet(rows: Record<string, unknown>[]): ParsedCharacter[] {
  return rows.map((row) => {
    const char: ParsedCharacter = { name: '', class: '', level: 1, stats: [], items: [], traits: [], notes: [] };

    for (const [rawKey, rawVal] of Object.entries(row)) {
      const val = stripModifier(String(rawVal ?? '').trim());
      if (!val || val === 'undefined') continue;

      if (matchKey(rawKey, NAME_KEYS))  { char.name  = val; continue; }
      if (matchKey(rawKey, CLASS_KEYS)) { char.class = val; continue; }
      if (matchKey(rawKey, LEVEL_KEYS)) { char.level = parseInt(val, 10) || 1; continue; }
      if (matchKey(rawKey, HP_KEYS))    { char.stats.push({ name: 'HP', value: val }); continue; }
      if (matchKey(rawKey, AC_KEYS))    { char.stats.push({ name: 'AC', value: val }); continue; }
      // CSV columns named "envanter", "inventory", etc. → pipe-separated item list
      if (ITEM_SECTIONS.some((s) => rawKey.toLowerCase().startsWith(s))) {
        val.split('|').map((p) => p.trim()).filter(Boolean).forEach((itemName) => {
          char.items.push({ name: itemName, notes: '' });
        });
        continue;
      }
      if (TRAIT_SECTIONS.some((s) => rawKey.toLowerCase().startsWith(s))) {
        val.split(/[,;|]+/).map((trait) => trait.trim()).filter(Boolean).forEach((trait) => char.traits.push(trait));
        continue;
      }

      char.stats.push({ name: rawKey.toUpperCase().trim(), value: val });
    }

    return char;
  }).filter((c) => c.name);
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function parseFile(file: File): Promise<ParsedCharacter[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt')) {
    const text = await file.text();
    return parseTxt(text);
  }

  if (name.endsWith('.pdf')) {
    return parseTxt(await extractPdfText(file));
  }

  if (name.endsWith('.csv')) {
    const text = await file.text();
    const wb = XLSX.read(text, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    return parseSheet(rows);
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    return parseSheet(rows);
  }

  throw new Error(`Desteklenmeyen dosya türü: ${file.name.split('.').pop()}`);
}
