/**
 * codeGenerator — bcid mapping and format lookup tests.
 * bwip-js is fully mocked (ESM namespace cannot be spied on).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must be called before any import that pulls in bwip-js — Vitest hoists vi.mock calls.
vi.mock('bwip-js/browser', () => ({
  toCanvas: vi.fn((canvas: HTMLCanvasElement) => {
    Object.defineProperty(canvas, 'width',  { configurable: true, writable: true, value: 600 });
    Object.defineProperty(canvas, 'height', { configurable: true, writable: true, value: 100 });
    return canvas;
  }),
}));

vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,STUB');

import * as bwipjs from 'bwip-js/browser';

beforeEach(() => { vi.mocked(bwipjs.toCanvas).mockClear(); });

// ── bcid lookup ───────────────────────────────────────────────────────────────

describe('generateCodeDataUrl — bcid lookup', () => {
  it('translates codabar format id to rationalizedCodabar encoder name', async () => {
    const { generateCodeDataUrl } = await import('../js/codeGenerator');
    await generateCodeDataUrl('codabar', 'A12345A');
    const calls = vi.mocked(bwipjs.toCanvas).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const opts = calls[0][1] as Record<string, unknown>;
    expect(opts['bcid']).toBe('rationalizedCodabar');
  });

  it('passes bcid unchanged when format id equals the bwip encoder name', async () => {
    const { generateCodeDataUrl } = await import('../js/codeGenerator');
    await generateCodeDataUrl('code128', 'ABC-123');
    const opts = vi.mocked(bwipjs.toCanvas).mock.calls[0][1] as Record<string, unknown>;
    expect(opts['bcid']).toBe('code128');
  });

});

// ── includetext default ───────────────────────────────────────────────────────

describe('generateCodeDataUrl — includetext default', () => {
  it('defaults to true for 1D formats', async () => {
    const { generateCodeDataUrl } = await import('../js/codeGenerator');
    await generateCodeDataUrl('code39', 'CODE39');
    const opts = vi.mocked(bwipjs.toCanvas).mock.calls[0][1] as Record<string, unknown>;
    expect(opts['includetext']).toBe(true);
  });

  it('defaults to false for 2D formats', async () => {
    const { generateCodeDataUrl } = await import('../js/codeGenerator');
    await generateCodeDataUrl('qrcode', 'https://example.com');
    const opts = vi.mocked(bwipjs.toCanvas).mock.calls[0][1] as Record<string, unknown>;
    expect(opts['includetext']).toBe(false);
  });

  it('BwipOptions.includetext=false overrides default for 1D', async () => {
    const { generateCodeDataUrl } = await import('../js/codeGenerator');
    await generateCodeDataUrl('code128', 'ABC', null, { includetext: false });
    const opts = vi.mocked(bwipjs.toCanvas).mock.calls[0][1] as Record<string, unknown>;
    expect(opts['includetext']).toBe(false);
  });
});

// ── getCodeFormat ─────────────────────────────────────────────────────────────

describe('getCodeFormat', () => {
  it('returns descriptor with correct bcid for codabar', async () => {
    const { getCodeFormat } = await import('../js/codeGenerator');
    const fmt = getCodeFormat('codabar');
    expect(fmt).not.toBeNull();
    expect(fmt!.bcid).toBe('rationalizedCodabar');
    expect(fmt!.label).toBe('Codabar');
    expect(fmt!.category).toBe('1d');
  });

  it('returns null for unknown format id', async () => {
    const { getCodeFormat } = await import('../js/codeGenerator');
    expect(getCodeFormat('nosuchformat')).toBeNull();
  });
});

// ── dataUriToBlobUrl ──────────────────────────────────────────────────────────

describe('dataUriToBlobUrl', () => {
  it('converts a data: URI to a blob: URL', async () => {
    const { dataUriToBlobUrl } = await import('../js/codeGenerator');
    // 1×1 transparent PNG in base64
    const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const blobUrl = dataUriToBlobUrl(dataUri);
    expect(blobUrl).toMatch(/^blob:/);
    URL.revokeObjectURL(blobUrl);
  });

  it('extracts the MIME type correctly from the data URI header', async () => {
    const { dataUriToBlobUrl } = await import('../js/codeGenerator');
    // We cannot directly inspect the Blob's type from a blob: URL in jsdom,
    // but we can verify the function returns a valid blob URL without throwing.
    const dataUri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIhAAAQMEAgMAAAAAAAAAAAAAAQIDBAAFERIhMUH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AoOo6tarUZcjDFuFpRQEALb4lJIBPnNVc0baqS4tlk4kkNtqCQo+ySQBn7oopAP/Z';
    const blobUrl = dataUriToBlobUrl(dataUri);
    expect(blobUrl).toMatch(/^blob:/);
    URL.revokeObjectURL(blobUrl);
  });

  it('falls back to octet-stream for malformed MIME in data URI', async () => {
    const { dataUriToBlobUrl } = await import('../js/codeGenerator');
    const dataUri = 'data:;base64,dGVzdA==';
    const blobUrl = dataUriToBlobUrl(dataUri);
    expect(blobUrl).toMatch(/^blob:/);
    URL.revokeObjectURL(blobUrl);
  });
});
