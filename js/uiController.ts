import type { PDFElement } from './pdfElement';
import type { TextElement } from './textElement';
import type { ShapeElement } from './shapeElement';
import type { ToolMode } from './pdfEditorApp';

export interface UIRefs {
  fileInput: HTMLInputElement;
  addTextBtn: HTMLButtonElement;
  addSignatureBtn: HTMLButtonElement;
  downloadBtn: HTMLButtonElement;
  prevPageBtn: HTMLButtonElement;
  nextPageBtn: HTMLButtonElement;
  pageInfo: HTMLElement;
  canvas: HTMLCanvasElement;
  container: HTMLElement;
  signatureModal: HTMLElement;
  signatureCanvas: HTMLCanvasElement;
  fontSizeInput: HTMLInputElement;
  textColorInput: HTMLInputElement;
  sigLineWidthInput: HTMLInputElement;
  sigColorInput: HTMLInputElement;
  zoomOutBtn: HTMLButtonElement;
  zoomInBtn: HTMLButtonElement;
  zoomDisplay: HTMLElement;
  fitBtn: HTMLButtonElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  fontFamily: HTMLSelectElement;
  boldBtn: HTMLButtonElement;
  italicBtn: HTMLButtonElement;
  modeBadge: HTMLElement;
  clearSaveBtn: HTMLButtonElement;
  firstPage: HTMLButtonElement;
  lastPage: HTMLButtonElement;
  pageInput: HTMLInputElement;
  pageTotal: HTMLElement;
  toast: HTMLElement;
  arrowBtn: HTMLButtonElement;
  rectBtn: HTMLButtonElement;
  circleBtn: HTMLButtonElement;
  freehandBtn: HTMLButtonElement;
  shapeColor: HTMLInputElement;
  shapeWidth: HTMLInputElement;
  fontSizeDownBtn: HTMLButtonElement;
  fontSizeUpBtn: HTMLButtonElement;
  clearAllBtn: HTMLButtonElement;
  helpBtn: HTMLButtonElement;
  helpModal: HTMLElement;
  colorSwatches: HTMLElement;
  addImageBtn: HTMLButtonElement;
  addImageInput: HTMLInputElement;
  highlightBtn: HTMLButtonElement;
  findBtn: HTMLButtonElement;
  findBar: HTMLElement;
  findInput: HTMLInputElement;
  findPrev: HTMLButtonElement;
  findNext: HTMLButtonElement;
  findHighlight: HTMLButtonElement;
  findClose: HTMLButtonElement;
  findCount: HTMLElement;
  watermarkBtn: HTMLButtonElement;
  watermarkModal: HTMLElement;
  wmEnabled: HTMLInputElement;
  wmText: HTMLInputElement;
  wmColor: HTMLInputElement;
  wmFontSize: HTMLInputElement;
  wmFontSizeDisplay: HTMLElement;
  wmOpacity: HTMLInputElement;
  wmOpacityDisplay: HTMLElement;
  wmAngle: HTMLInputElement;
  wmAngleDisplay: HTMLElement;
  wmPreviewText: HTMLElement;
  wmApply: HTMLButtonElement;
  wmCancel: HTMLButtonElement;
  pageThumbnailContainer: HTMLElement;
  addPdfInput: HTMLInputElement;
  commentBtn: HTMLButtonElement;
  redactBtn: HTMLButtonElement;
  exportImgBtn: HTMLButtonElement;
  exportPageBtn: HTMLButtonElement;
}

export class UIController {
  refs: UIRefs;
  private _toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.refs = {
      fileInput:        document.getElementById('fileInput')        as HTMLInputElement,
      addTextBtn:       document.getElementById('addTextBtn')       as HTMLButtonElement,
      addSignatureBtn:  document.getElementById('addSignatureBtn')  as HTMLButtonElement,
      downloadBtn:      document.getElementById('downloadBtn')      as HTMLButtonElement,
      prevPageBtn:      document.getElementById('prevPage')         as HTMLButtonElement,
      nextPageBtn:      document.getElementById('nextPage')         as HTMLButtonElement,
      pageInfo:         document.getElementById('pageInfo')         as HTMLElement,
      canvas:           document.getElementById('pdfCanvas')        as HTMLCanvasElement,
      container:        document.getElementById('canvasContainer')  as HTMLElement,
      signatureModal:   document.getElementById('signatureModal')   as HTMLElement,
      signatureCanvas:  document.getElementById('signatureCanvas')  as HTMLCanvasElement,
      fontSizeInput:    document.getElementById('fontSize')         as HTMLInputElement,
      textColorInput:   document.getElementById('textColor')        as HTMLInputElement,
      sigLineWidthInput:document.getElementById('sigLineWidth')     as HTMLInputElement,
      sigColorInput:    document.getElementById('sigColor')         as HTMLInputElement,
      zoomOutBtn:       document.getElementById('zoomOutBtn')       as HTMLButtonElement,
      zoomInBtn:        document.getElementById('zoomInBtn')        as HTMLButtonElement,
      zoomDisplay:      document.getElementById('zoomDisplay')      as HTMLElement,
      fitBtn:           document.getElementById('fitBtn')           as HTMLButtonElement,
      undoBtn:          document.getElementById('undoBtn')          as HTMLButtonElement,
      redoBtn:          document.getElementById('redoBtn')          as HTMLButtonElement,
      fontFamily:       document.getElementById('fontFamily')       as HTMLSelectElement,
      boldBtn:          document.getElementById('boldBtn')          as HTMLButtonElement,
      italicBtn:        document.getElementById('italicBtn')        as HTMLButtonElement,
      modeBadge:        document.getElementById('modeBadge')        as HTMLElement,
      clearSaveBtn:     document.getElementById('clearSaveBtn')     as HTMLButtonElement,
      firstPage:        document.getElementById('firstPage')        as HTMLButtonElement,
      lastPage:         document.getElementById('lastPage')         as HTMLButtonElement,
      pageInput:        document.getElementById('pageInput')        as HTMLInputElement,
      pageTotal:        document.getElementById('pageTotal')        as HTMLElement,
      toast:            document.getElementById('toast')            as HTMLElement,
      arrowBtn:         document.getElementById('arrowBtn')         as HTMLButtonElement,
      rectBtn:          document.getElementById('rectBtn')          as HTMLButtonElement,
      circleBtn:        document.getElementById('circleBtn')        as HTMLButtonElement,
      freehandBtn:      document.getElementById('freehandBtn')      as HTMLButtonElement,
      shapeColor:       document.getElementById('shapeColor')       as HTMLInputElement,
      shapeWidth:       document.getElementById('shapeWidth')       as HTMLInputElement,
      fontSizeDownBtn:  document.getElementById('fontSizeDownBtn')  as HTMLButtonElement,
      fontSizeUpBtn:    document.getElementById('fontSizeUpBtn')    as HTMLButtonElement,
      clearAllBtn:      document.getElementById('clearAllBtn')      as HTMLButtonElement,
      helpBtn:          document.getElementById('helpBtn')          as HTMLButtonElement,
      helpModal:        document.getElementById('helpModal')        as HTMLElement,
      colorSwatches:    document.getElementById('colorSwatches')    as HTMLElement,
      addImageBtn:      document.getElementById('addImageBtn')      as HTMLButtonElement,
      addImageInput:    document.getElementById('addImageInput')    as HTMLInputElement,
      highlightBtn:     document.getElementById('highlightBtn')     as HTMLButtonElement,
      findBtn:          document.getElementById('findBtn')          as HTMLButtonElement,
      findBar:          document.getElementById('findBar')          as HTMLElement,
      findInput:        document.getElementById('findInput')        as HTMLInputElement,
      findPrev:         document.getElementById('findPrev')         as HTMLButtonElement,
      findNext:         document.getElementById('findNext')         as HTMLButtonElement,
      findHighlight:    document.getElementById('findHighlight')    as HTMLButtonElement,
      findClose:        document.getElementById('findClose')        as HTMLButtonElement,
      findCount:        document.getElementById('findCount')        as HTMLElement,
      watermarkBtn:     document.getElementById('watermarkBtn')     as HTMLButtonElement,
      watermarkModal:   document.getElementById('watermarkModal')   as HTMLElement,
      wmEnabled:        document.getElementById('wmEnabled')        as HTMLInputElement,
      wmText:           document.getElementById('wmText')           as HTMLInputElement,
      wmColor:          document.getElementById('wmColor')          as HTMLInputElement,
      wmFontSize:       document.getElementById('wmFontSize')       as HTMLInputElement,
      wmFontSizeDisplay:document.getElementById('wmFontSizeDisplay')as HTMLElement,
      wmOpacity:        document.getElementById('wmOpacity')        as HTMLInputElement,
      wmOpacityDisplay: document.getElementById('wmOpacityDisplay') as HTMLElement,
      wmAngle:          document.getElementById('wmAngle')          as HTMLInputElement,
      wmAngleDisplay:   document.getElementById('wmAngleDisplay')   as HTMLElement,
      wmPreviewText:    document.getElementById('wmPreviewText')    as HTMLElement,
      wmApply:          document.getElementById('wmApply')          as HTMLButtonElement,
      wmCancel:         document.getElementById('wmCancel')         as HTMLButtonElement,
      pageThumbnailContainer: document.getElementById('pageThumbnailContainer') as HTMLElement,
      addPdfInput:      document.getElementById('addPdfInput')      as HTMLInputElement,
      commentBtn:       document.getElementById('commentBtn')       as HTMLButtonElement,
      redactBtn:        document.getElementById('redactBtn')        as HTMLButtonElement,
      exportImgBtn:     document.getElementById('exportImgBtn')     as HTMLButtonElement,
      exportPageBtn:    document.getElementById('exportPageBtn')    as HTMLButtonElement,
    };
  }

  enableUI(): void {
    const r = this.refs;
    r.addTextBtn.disabled     = false;
    r.addSignatureBtn.disabled = false;
    r.downloadBtn.disabled    = false;
    r.prevPageBtn.disabled    = false;
    r.nextPageBtn.disabled    = false;
    r.zoomInBtn.disabled      = false;
    r.zoomOutBtn.disabled     = false;
    r.fitBtn.disabled         = false;
    r.firstPage.disabled      = false;
    r.lastPage.disabled       = false;
    r.pageInput.disabled      = false;
    r.arrowBtn.disabled       = false;
    r.rectBtn.disabled        = false;
    r.circleBtn.disabled      = false;
    r.freehandBtn.disabled    = false;
    r.clearAllBtn.disabled    = false;
    r.addImageBtn.disabled    = false;
    r.highlightBtn.disabled   = false;
    r.findBtn.disabled        = false;
    r.watermarkBtn.disabled   = false;
    r.commentBtn.disabled     = false;
    r.redactBtn.disabled      = false;
    r.exportImgBtn.disabled   = false;
    r.exportPageBtn.disabled  = false;
  }

  updateModeButtons(mode: ToolMode): void {
    const r = this.refs;
    r.canvas.style.touchAction = mode.startsWith('draw') ? 'none' : 'pan-x pan-y';
    r.addTextBtn.classList.toggle('active',      mode === 'addText');
    r.addSignatureBtn.classList.toggle('active', mode === 'addSignature');
    r.addImageBtn.classList.toggle('active',     mode === 'addImage');
    r.highlightBtn.classList.toggle('active',    mode === 'drawHighlight');
    r.arrowBtn.classList.toggle('active',        mode === 'drawArrow');
    r.rectBtn.classList.toggle('active',         mode === 'drawRect');
    r.circleBtn.classList.toggle('active',       mode === 'drawEllipse');
    r.freehandBtn.classList.toggle('active',     mode === 'drawFreehand');
    r.commentBtn.classList.toggle('active',      mode === 'addComment');
    r.redactBtn.classList.toggle('active',       mode === 'drawRedaction');

    const badges: Record<string, string> = {
      select: 'SELECT', addText: '+ TEXT', addSignature: '✍ SIGN', addImage: '🖼 IMAGE',
      drawArrow: '→ ARROW', drawRect: '□ RECT', drawEllipse: '○ CIRCLE', drawFreehand: '✏ DRAW',
      drawHighlight: '🖊 HIGHLIGHT', addComment: '💬 COMMENT', drawRedaction: '⬛ REDACT',
    };
    r.modeBadge.textContent = badges[mode] || 'SELECT';
    r.modeBadge.classList.toggle('active', mode !== 'select');
    r.canvas.className = mode === 'select' ? 'cursor-default' : 'cursor-crosshair';

    const isShapeMode = mode.startsWith('draw') && mode !== 'drawRedaction';
    r.shapeColor.disabled = !isShapeMode;
    r.shapeWidth.disabled = !isShapeMode;
  }

  updateFormattingToolbar(el: PDFElement | null, mode: ToolMode): void {
    const r = this.refs;
    const isText  = el?.type === 'text';
    const isShape = el?.type === 'shape';

    r.fontFamily.disabled      = !isText;
    r.boldBtn.disabled         = !isText;
    r.italicBtn.disabled       = !isText;
    r.fontSizeInput.disabled   = !isText;
    r.fontSizeDownBtn.disabled = !isText;
    r.fontSizeUpBtn.disabled   = !isText;
    r.textColorInput.disabled  = !isText;
    r.colorSwatches.classList.toggle('disabled', !isText);
    if (isText) {
      r.fontFamily.value = (el as TextElement).fontFamily || 'Arial';
      r.boldBtn.classList.toggle('btn-active-fmt',   !!(el as TextElement).bold);
      r.italicBtn.classList.toggle('btn-active-fmt', !!(el as TextElement).italic);
      r.fontSizeInput.value  = String((el as TextElement).fontSize);
      r.textColorInput.value = (el as TextElement).color;
    } else {
      r.boldBtn.classList.remove('btn-active-fmt');
      r.italicBtn.classList.remove('btn-active-fmt');
    }

    const shapeActive = isShape || (mode.startsWith('draw') && mode !== 'drawRedaction' && mode !== 'drawHighlight');
    r.shapeColor.disabled = !shapeActive;
    r.shapeWidth.disabled = !shapeActive;
    if (isShape) {
      r.shapeColor.value = (el as ShapeElement).strokeColor;
      r.shapeWidth.value = String((el as ShapeElement).strokeWidth);
    }
  }

  updateUndoRedoBtns(canUndo: boolean, canRedo: boolean): void {
    this.refs.undoBtn.disabled = !canUndo;
    this.refs.redoBtn.disabled = !canRedo;
  }

  updatePageInfo(current: number, total: number): void {
    this.refs.pageInput.value = String(current);
    this.refs.pageInput.max   = String(total);
    this.refs.pageTotal.textContent = `/ ${total}`;
  }

  showToast(msg: string, duration = 3000): void {
    clearTimeout(this._toastTimer ?? undefined);
    this.refs.toast.textContent = msg;
    this.refs.toast.classList.add('show');
    this._toastTimer = setTimeout(() => {
      this.refs.toast.classList.remove('show');
    }, duration);
  }

  toggleHelp(show?: boolean): void {
    const active = this.refs.helpModal.classList.contains('active');
    const next = show !== undefined ? show : !active;
    this.refs.helpModal.classList.toggle('active', next);
    this.refs.helpBtn.classList.toggle('active', next);
  }
}
