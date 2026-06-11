/**
 * contentStreamEditor — true PDF text editing via content-stream operator surgery.
 *
 * Locates text-showing operators (Tj, TJ, ', ") by tracking the text matrix
 * through the page's content stream, then blanks or replaces them in place.
 * Unlike the overlay approach, the original text is genuinely removed from
 * the document (no longer extractable, no longer under a cover rectangle).
 *
 * Prototype limitations (see docs/plans/pdf-text-editing-research.plan.md):
 * - ops wrapped in `cm` transforms are located in text space, not device space
 * - Form XObject content streams are not recursed
 * - replacements use a standard fallback font (Helvetica), not the embedded subset
 */
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
} from '@cantoo/pdf-lib';

export interface CsToken {
  type:
    | 'number'
    | 'string'
    | 'hexstring'
    | 'name'
    | 'array'
    | 'dict'
    | 'comment'
    | 'inline-image'
    | 'operator';
  /** Exact serializable source text of the token. */
  raw: string;
  /** Numeric value (number tokens only). */
  value?: number;
  /** Parsed children (array tokens only). */
  items?: CsToken[];
}

export interface CsOp {
  operator: string;
  operands: CsToken[];
}

export interface TextOpInfo {
  /** Index into the ops array returned by groupOps. */
  opIndex: number;
  operator: string;
  /** Text-space origin (PDF coords, baseline) at the moment the op executes. */
  origin: { x: number; y: number };
  fontKey: string;
  fontSize: number;
}

const WHITESPACE = new Set([' ', '\t', '\r', '\n', '\f', '\0']);
const DELIMITERS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);

function isRegular(ch: string): boolean {
  return !WHITESPACE.has(ch) && !DELIMITERS.has(ch);
}

/** Tokenize a decoded PDF content stream. */
export function tokenizeContentStream(src: string): CsToken[] {
  const tokens: CsToken[] = [];
  let i = 0;

  const readLiteralString = (): string => {
    const start = i;
    i++; // consume '('
    let depth = 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '\\') i += 2;
      else {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        i++;
      }
    }
    return src.slice(start, i);
  };

  const readUntilBalanced = (open: string, close: string): string => {
    const start = i;
    let depth = 0;
    while (i < src.length) {
      if (src.startsWith(open, i)) {
        depth++;
        i += open.length;
      } else if (src.startsWith(close, i)) {
        depth--;
        i += close.length;
        if (depth === 0) break;
      } else if (src[i] === '(') {
        readLiteralString();
      } else {
        i++;
      }
    }
    return src.slice(start, i);
  };

  while (i < src.length) {
    const ch = src[i];

    if (WHITESPACE.has(ch)) {
      i++;
      continue;
    }

    if (ch === '%') {
      const start = i;
      while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++;
      tokens.push({ type: 'comment', raw: src.slice(start, i) });
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'string', raw: readLiteralString() });
      continue;
    }

    if (ch === '<') {
      if (src[i + 1] === '<') {
        tokens.push({ type: 'dict', raw: readUntilBalanced('<<', '>>') });
      } else {
        const start = i;
        while (i < src.length && src[i] !== '>') i++;
        i++; // consume '>'
        tokens.push({ type: 'hexstring', raw: src.slice(start, i) });
      }
      continue;
    }

    if (ch === '[') {
      i++; // consume '['
      const items: CsToken[] = [];
      // Recursive parse until matching ']' at this level
      while (i < src.length && src[i] !== ']') {
        if (WHITESPACE.has(src[i])) {
          i++;
          continue;
        }
        const inner = tokenizeOne();
        if (inner) items.push(inner);
      }
      i++; // consume ']'
      tokens.push({
        type: 'array',
        raw: `[${items.map(t => t.raw).join(' ')}]`,
        items,
      });
      continue;
    }

    if (ch === '/') {
      const start = i;
      i++;
      while (i < src.length && isRegular(src[i])) i++;
      tokens.push({ type: 'name', raw: src.slice(start, i) });
      continue;
    }

    if (/[0-9+\-.]/.test(ch)) {
      const start = i;
      i++;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      const raw = src.slice(start, i);
      tokens.push({ type: 'number', raw, value: parseFloat(raw) });
      continue;
    }

    // Regular-character run → operator (or inline image)
    const start = i;
    while (i < src.length && isRegular(src[i])) i++;
    const word = src.slice(start, i);
    if (word === 'BI') {
      // Inline image: pass through raw up to and including 'EI'
      const eiIdx = src.indexOf('EI', i);
      const end = eiIdx === -1 ? src.length : eiIdx + 2;
      tokens.push({ type: 'inline-image', raw: src.slice(start, end) });
      i = end;
    } else {
      tokens.push({ type: 'operator', raw: word });
    }
  }

  // Inner single-token parser used by array parsing (shares `i` via closure)
  function tokenizeOne(): CsToken | null {
    const c = src[i];
    if (c === '(') return { type: 'string', raw: readLiteralString() };
    if (c === '<') {
      const start = i;
      while (i < src.length && src[i] !== '>') i++;
      i++;
      return { type: 'hexstring', raw: src.slice(start, i) };
    }
    if (c === '/') {
      const start = i;
      i++;
      while (i < src.length && isRegular(src[i])) i++;
      return { type: 'name', raw: src.slice(start, i) };
    }
    if (/[0-9+\-.]/.test(c)) {
      const start = i;
      i++;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      const raw = src.slice(start, i);
      return { type: 'number', raw, value: parseFloat(raw) };
    }
    // operator-like word inside an array (rare) — consume to stay safe
    const start = i;
    i++;
    while (i < src.length && isRegular(src[i])) i++;
    return { type: 'operator', raw: src.slice(start, i) };
  }

  return tokens;
}

/** Serialize tokens back into a content stream (whitespace-normalized). */
export function serializeTokens(tokens: CsToken[]): string {
  return tokens.map(t => t.raw).join(' ');
}

/** Group a token list into operator + operands records. */
export function groupOps(tokens: CsToken[]): CsOp[] {
  const ops: CsOp[] = [];
  let operands: CsToken[] = [];
  for (const tok of tokens) {
    if (tok.type === 'operator') {
      ops.push({ operator: tok.raw, operands });
      operands = [];
    } else if (tok.type === 'inline-image') {
      ops.push({ operator: 'INLINE_IMAGE', operands: [tok] });
      operands = [];
    } else if (tok.type !== 'comment') {
      operands.push(tok);
    }
  }
  return ops;
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function translateMatrix(tx: number, ty: number, m: Matrix): Matrix {
  // [1 0 0 1 tx ty] × m
  return [
    m[0],
    m[1],
    m[2],
    m[3],
    tx * m[0] + ty * m[2] + m[4],
    tx * m[1] + ty * m[3] + m[5],
  ];
}

const SHOW_OPS = new Set(['Tj', 'TJ', "'", '"']);

/** Walk ops tracking PDF text state; return every text-showing op with its origin. */
export function locateTextOps(ops: CsOp[]): TextOpInfo[] {
  const found: TextOpInfo[] = [];
  let textMatrix: Matrix = [...IDENTITY];
  let lineMatrix: Matrix = [...IDENTITY];
  let fontKey = '';
  let fontSize = 0;
  let leading = 0;

  const num = (t: CsToken | undefined): number => t?.value ?? 0;

  ops.forEach((op, opIndex) => {
    switch (op.operator) {
      case 'BT':
        textMatrix = [...IDENTITY];
        lineMatrix = [...IDENTITY];
        break;
      case 'Tf':
        fontKey = op.operands[0]?.raw ?? '';
        fontSize = num(op.operands[1]);
        break;
      case 'TL':
        leading = num(op.operands[0]);
        break;
      case 'TD':
        leading = -num(op.operands[1]);
        lineMatrix = translateMatrix(num(op.operands[0]), num(op.operands[1]), lineMatrix);
        textMatrix = [...lineMatrix];
        break;
      case 'Td':
        lineMatrix = translateMatrix(num(op.operands[0]), num(op.operands[1]), lineMatrix);
        textMatrix = [...lineMatrix];
        break;
      case 'Tm': {
        const m = op.operands.slice(0, 6).map(t => t.value ?? 0);
        lineMatrix = m as Matrix;
        textMatrix = [...lineMatrix];
        break;
      }
      case 'T*':
        lineMatrix = translateMatrix(0, -leading, lineMatrix);
        textMatrix = [...lineMatrix];
        break;
      default:
        break;
    }

    if (SHOW_OPS.has(op.operator)) {
      if (op.operator === "'" || op.operator === '"') {
        lineMatrix = translateMatrix(0, -leading, lineMatrix);
        textMatrix = [...lineMatrix];
      }
      // Vertical scale of the text matrix: image of unit vector (0,1)
      const vScale = Math.hypot(textMatrix[2], textMatrix[3]) || 1;
      found.push({
        opIndex,
        operator: op.operator,
        origin: { x: textMatrix[4], y: textMatrix[5] },
        fontKey,
        fontSize: fontSize * vScale,
      });
    }
  });

  return found;
}

/** Decode and concatenate all content streams of a page. */
function getPageContent(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();
  if (!contents) return '';

  const streams: PDFRawStream[] = [];
  if (contents instanceof PDFRawStream) {
    streams.push(contents);
  } else if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i++) {
      const resolved = doc.context.lookup(contents.get(i));
      if (resolved instanceof PDFRawStream) streams.push(resolved);
    }
  }

  let out = '';
  for (const s of streams) {
    const bytes = decodePDFRawStream(s).decode();
    let chunk = '';
    for (let i = 0; i < bytes.length; i++) chunk += String.fromCharCode(bytes[i]);
    out += chunk + '\n';
  }
  return out;
}

/** Replace the page's Contents with a single new uncompressed stream. */
function setPageContent(doc: PDFDocument, pageIndex: number, content: string): void {
  const page = doc.getPage(pageIndex);
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i) & 0xff;
  const stream = doc.context.stream(bytes);
  const ref = doc.context.register(stream);
  page.node.set(PDFName.of('Contents'), ref);
}

/** Blank the string payload of a show op in place (keeps state side-effects like T*). */
function blankShowOp(op: CsOp): void {
  if (op.operator === 'TJ') {
    const arr = op.operands[0];
    if (arr && arr.type === 'array') {
      arr.raw = '[]';
      arr.items = [];
    }
    return;
  }
  // Tj, ', " — the string is the last operand
  const str = op.operands[op.operands.length - 1];
  if (str && (str.type === 'string' || str.type === 'hexstring')) {
    str.raw = '()';
    str.type = 'string';
  }
}

interface EditTarget {
  ops: CsOp[];
  target: TextOpInfo;
}

function findTarget(
  doc: PDFDocument,
  pageIndex: number,
  point: { x: number; y: number },
  tolerance: number
): EditTarget | null {
  const content = getPageContent(doc, pageIndex);
  if (!content) return null;
  const ops = groupOps(tokenizeContentStream(content));
  const textOps = locateTextOps(ops);

  let best: TextOpInfo | null = null;
  let bestDist = Infinity;
  for (const t of textOps) {
    const dist = Math.hypot(t.origin.x - point.x, t.origin.y - point.y);
    if (dist <= tolerance && dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best ? { ops, target: best } : null;
}

/**
 * Locate the text-show op nearest to `point` without modifying anything.
 * Lets callers test whether a true edit is possible before offering it.
 */
export async function findTextOpAt(
  doc: PDFDocument,
  pageIndex: number,
  point: { x: number; y: number },
  tolerance = 5
): Promise<TextOpInfo | null> {
  return findTarget(doc, pageIndex, point, tolerance)?.target ?? null;
}

function serializeOps(ops: CsOp[]): string {
  return ops
    .map(op =>
      op.operator === 'INLINE_IMAGE'
        ? op.operands[0].raw
        : [...op.operands.map(t => t.raw), op.operator].join(' ')
    )
    .join('\n');
}

/**
 * Truly delete the text op nearest to `point` (PDF coords, baseline origin).
 * Returns false when no show op lies within `tolerance`.
 */
export async function deleteTextAt(
  doc: PDFDocument,
  pageIndex: number,
  point: { x: number; y: number },
  tolerance = 5
): Promise<boolean> {
  const found = findTarget(doc, pageIndex, point, tolerance);
  if (!found) return false;

  blankShowOp(found.ops[found.target.opIndex]);
  setPageContent(doc, pageIndex, serializeOps(found.ops));
  return true;
}

/**
 * Truly replace the text op nearest to `point`: the original string is removed
 * from the content stream and `newText` is drawn at the same baseline origin
 * with the detected size, using a standard fallback font.
 */
export async function replaceTextAt(
  doc: PDFDocument,
  pageIndex: number,
  point: { x: number; y: number },
  newText: string,
  tolerance = 5
): Promise<boolean> {
  const found = findTarget(doc, pageIndex, point, tolerance);
  if (!found) return false;

  blankShowOp(found.ops[found.target.opIndex]);
  setPageContent(doc, pageIndex, serializeOps(found.ops));

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.getPage(pageIndex);
  page.drawText(newText, {
    x: found.target.origin.x,
    y: found.target.origin.y,
    size: found.target.fontSize || 12,
    font,
  });
  return true;
}
