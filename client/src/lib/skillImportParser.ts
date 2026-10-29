import type { SkillActionType, SkillInput } from '@dnd/shared';

interface PositionedText {
  text: string;
  x: number;
  y: number;
}

function actionTypeFrom(value: string): SkillActionType {
  const normalized = value.toLocaleLowerCase();
  if (/bonus\s*action/.test(normalized)) return 'BONUS_ACTION';
  if (/reaction/.test(normalized)) return 'REACTION';
  if (/free\s*action/.test(normalized)) return 'FREE';
  if (/\baction\b/.test(normalized)) return 'ACTION';
  return 'OTHER';
}

function parseUsage(values: string[]) {
  const text = values.join(' ');
  const ratio = text.match(/\b(\d+)\s*\/\s*(\d+)\b/);
  if (ratio) {
    const usesCurrent = Number(ratio[1]);
    const usesMax = Number(ratio[2]);
    return usesMax === 0 ? { usesMax: 0, usesCurrent: 0 } : {
      usesMax,
      usesCurrent: Math.min(usesCurrent, usesMax),
    };
  }
  return { usesMax: 0, usesCurrent: 0 };
}

function parsePage(items: PositionedText[]): SkillInput[] {
  const headerY = Math.max(...items.filter((item) => item.text.trim().toLowerCase() === 'effect').map((item) => item.y), -Infinity);
  if (!Number.isFinite(headerY)) return [];

  const lines = new Map<number, PositionedText[]>();
  for (const item of items) {
    if (item.y >= headerY - 1) continue;
    const key = Math.round(item.y * 2) / 2;
    const line = lines.get(key) ?? [];
    line.push(item);
    lines.set(key, line);
  }

  const orderedLines = [...lines.entries()]
    .map(([y, lineItems]) => ({ y, items: lineItems.sort((a, b) => a.x - b.x) }))
    .sort((a, b) => b.y - a.y);
  const rows = orderedLines
    .map((line) => ({
      name: line.items.filter((item) => item.x < 110).map((item) => item.text.trim()).filter(Boolean).join(' '),
      y: line.y,
    }))
    .filter((row) => row.name);

  return rows.map((row, rowIndex) => {
    const top = rowIndex === 0 ? headerY : (rows[rowIndex - 1].y + row.y) / 2;
    const bottom = rowIndex === rows.length - 1 ? -Infinity : (row.y + rows[rowIndex + 1].y) / 2;
    const rowItems = orderedLines
      .filter((line) => line.y < top && line.y >= bottom)
      .flatMap((line) => line.items);
    const cellText = (from: number, to: number) => rowItems
      .filter((item) => item.x >= from && item.x < to)
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join(' ');
    const effect = cellText(110, 395);
    const skillType = cellText(395, 450);
    const parsedRange = cellText(450, 497);
    const range = parsedRange === '0' ? '' : parsedRange;
    const trailingValues = rowItems.filter((item) => item.x >= 497).map((item) => item.text.trim());
    const allUsageValues = [...trailingValues, cellText(450, 530)];

    return {
      name: row.name,
      subtitle: null,
      description: effect,
      skillType: skillType || null,
      range: range || null,
      actionType: actionTypeFrom(trailingValues.join(' ')),
      ...parseUsage(allUsageValues),
    };
  }).filter((skill) => skill.name && skill.description);
}

/** Reads digital-text skill tables with the name/effect/type/range/usage/action layout. */
export async function parseSkillsPdf(file: File): Promise<SkillInput[]> {
  const [pdfjs, pdfWorker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  try {
    const skills: SkillInput[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.flatMap((item) => {
        if (!('str' in item) || !item.str.trim()) return [];
        return [{ text: item.str, x: item.transform[4], y: item.transform[5] }];
      });
      skills.push(...parsePage(items));
    }

    if (!skills.length) {
      throw new Error('PDF içinde skill tablosu bulunamadı. Metin seçilebilir ve tablo sütunları ad, etki, tür, menzil, kullanım ve aksiyon olmalı.');
    }
    return skills;
  } finally {
    await document.destroy();
  }
}
