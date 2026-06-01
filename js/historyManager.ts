import { ElementFactory } from './elementFactory';
import type { PDFElement } from './pdfElement';

export interface Command {
  execute(): void;
  undo(): void;
}

export class AddElementCmd implements Command {
  constructor(private elements: PDFElement[], private el: PDFElement) {}
  execute() { this.elements.push(this.el); }
  undo() {
    const i = this.elements.indexOf(this.el);
    if (i !== -1) this.elements.splice(i, 1);
  }
}

export class RemoveElementCmd implements Command {
  private index: number;
  constructor(private elements: PDFElement[], private el: PDFElement) {
    this.index = elements.indexOf(el);
  }
  execute() {
    const i = this.elements.indexOf(this.el);
    if (i !== -1) this.elements.splice(i, 1);
  }
  undo() { this.elements.splice(Math.max(0, this.index), 0, this.el); }
}

export class ClearAllCmd implements Command {
  private saved: PDFElement[];
  constructor(private elements: PDFElement[]) {
    this.saved = [...elements];
  }
  execute() { this.elements.splice(0); }
  undo() { this.elements.splice(0, 0, ...this.saved); }
}

export class MoveResizeCmd implements Command {
  constructor(
    private el: PDFElement,
    private before: Record<string, unknown>,
    private after: Record<string, unknown>
  ) {}
  execute() { Object.assign(this.el, this.after); }
  undo()    { Object.assign(this.el, this.before); }
}

// Full-snapshot command for text-edit checkpoints and importState
export class SnapshotCmd implements Command {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private before: Array<Record<string, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private after: Array<Record<string, any>> | null = null;

  constructor(private elements: PDFElement[]) {
    this.before = elements.map(el => ({ ...el.toJSON() }));
  }

  captureAfter() {
    this.after = this.elements.map(el => ({ ...el.toJSON() }));
  }

  execute() {
    if (!this.after) return;
    const restored = this.after.map(d => ElementFactory.fromJSON(d)).filter(Boolean) as PDFElement[];
    this.elements.splice(0, this.elements.length, ...restored);
  }

  undo() {
    const restored = this.before.map(d => ElementFactory.fromJSON(d)).filter(Boolean) as PDFElement[];
    this.elements.splice(0, this.elements.length, ...restored);
  }
}

export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  constructor(
    private maxSize: number,
    private onChange: (canUndo: boolean, canRedo: boolean) => void
  ) {}

  execute(cmd: Command): void {
    cmd.execute();
    this._push(cmd);
  }

  record(cmd: Command): void {
    this._push(cmd);
  }

  private _push(cmd: Command): void {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
    this.onChange(true, false);
  }

  undo(): boolean {
    if (!this.undoStack.length) return false;
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChange(this.undoStack.length > 0, true);
    return true;
  }

  redo(): boolean {
    if (!this.redoStack.length) return false;
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.execute();
    this.undoStack.push(cmd);
    this.onChange(true, this.redoStack.length > 0);
    return true;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange(false, false);
  }
}
