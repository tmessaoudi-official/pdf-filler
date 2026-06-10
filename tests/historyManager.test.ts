import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HistoryManager, AddElementCmd, ClearAllCmd, TextEditCmd,
} from '../src/historyManager';
import { TextElement } from '../src/textElement';
import { PDFElement } from '../src/pdfElement';

function makeMgr() {
  const onChange = vi.fn();
  return { mgr: new HistoryManager(50, onChange), onChange };
}

function makeEl() {
  return new TextElement(0, 0, 'p1');
}

describe('HistoryManager', () => {
  it('executes and records command', () => {
    const { mgr } = makeMgr();
    const arr: ReturnType<typeof makeEl>[] = [];
    const el = makeEl();
    mgr.execute(new AddElementCmd(arr, el));
    expect(arr).toHaveLength(1);
    expect(mgr.canUndo()).toBe(true);
    expect(mgr.canRedo()).toBe(false);
  });

  it('undo removes element, redo adds it back', () => {
    const { mgr } = makeMgr();
    const arr: ReturnType<typeof makeEl>[] = [];
    const el = makeEl();
    mgr.execute(new AddElementCmd(arr, el));
    mgr.undo();
    expect(arr).toHaveLength(0);
    expect(mgr.canRedo()).toBe(true);
    mgr.redo();
    expect(arr).toHaveLength(1);
  });

  it('ClearAllCmd: undo restores all elements', () => {
    const { mgr } = makeMgr();
    const arr = [makeEl(), makeEl(), makeEl()];
    const savedIds = arr.map(e => e.id);
    mgr.execute(new ClearAllCmd(arr));
    expect(arr).toHaveLength(0);
    mgr.undo();
    expect(arr.map(e => e.id)).toEqual(savedIds);
  });

  it('caps undo stack at maxSize', () => {
    const { mgr } = makeMgr();
    const arr: ReturnType<typeof makeEl>[] = [];
    for (let i = 0; i < 60; i++) mgr.execute(new AddElementCmd(arr, makeEl()));
    // Verify all IDs are unique
    const ids = arr.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Undo all — should only undo 50 (maxSize)
    let count = 0;
    while (mgr.canUndo()) { mgr.undo(); count++; }
    expect(count).toBe(50);
  });

  it('clear() empties both stacks', () => {
    const { mgr } = makeMgr();
    const arr: ReturnType<typeof makeEl>[] = [];
    mgr.execute(new AddElementCmd(arr, makeEl()));
    mgr.clear();
    expect(mgr.canUndo()).toBe(false);
    expect(mgr.canRedo()).toBe(false);
  });
});

describe('TextEditCmd', () => {
  beforeEach(() => { PDFElement._nextId = 1; });

  it('execute sets new text', () => {
    const el = makeEl();
    el.text = 'hello';
    const arr = [el];
    const cmd = new TextEditCmd(arr, el.id, 'hello', 'hello world');
    cmd.execute();
    expect(el.text).toBe('hello world');
  });

  it('undo restores previous text', () => {
    const el = makeEl();
    el.text = 'hello';
    const arr = [el];
    const cmd = new TextEditCmd(arr, el.id, 'hello', 'hello world');
    cmd.execute();
    cmd.undo();
    expect(el.text).toBe('hello');
  });

  it('no-op if element not found', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = [];
    const cmd = new TextEditCmd(arr, 999, 'old', 'new');
    expect(() => cmd.execute()).not.toThrow();
    expect(() => cmd.undo()).not.toThrow();
  });
});
