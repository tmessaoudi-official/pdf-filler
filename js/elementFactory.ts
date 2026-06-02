import { TextElement } from './textElement';
import { SignatureElement } from './signatureElement';
import { ShapeElement } from './shapeElement';
import { ImageElement } from './imageElement';
import { HighlightElement } from './highlightElement';
import type { ShapeType } from './shapeElement';
import type { PDFElement } from './pdfElement';

export class ElementFactory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static fromJSON(data: Record<string, any>): PDFElement | null {
    const pageId: string = data['pageId'] ?? String(data['page'] ?? '1');
    if (data['type'] === 'text') {
      const el = new TextElement(data['x'], data['y'], pageId, {
        width: data['width'], height: data['height'],
        fontSize: data['fontSize'], color: data['color'],
        fontFamily: data['fontFamily'] || 'Arial',
        bold: data['bold'] || false, italic: data['italic'] || false,
        multiline: data['multiline']
      });
      el.text = data['text'] || '';
      return el;
    }
    if (data['type'] === 'signature') {
      return new SignatureElement(data['x'], data['y'], pageId, data['data'],
        { width: data['width'], height: data['height'] });
    }
    if (data['type'] === 'shape') {
      return new ShapeElement(
        data['shapeType'] as ShapeType,
        data['x'], data['y'], data['width'], data['height'], pageId, {
          strokeColor: data['strokeColor'], strokeWidth: data['strokeWidth'],
          x1: data['x1'], y1: data['y1'], x2: data['x2'], y2: data['y2'],
          points: data['points'] || []
        });
    }
    if (data['type'] === 'image') {
      return new ImageElement(data['x'], data['y'], data['width'], data['height'], pageId, data['src'] || '');
    }
    if (data['type'] === 'highlight') {
      return new HighlightElement(data['x'], data['y'], data['width'], data['height'], pageId, data['color'] || '#FFFF00', data['opacity'] ?? 0.3);
    }
    return null;
  }
}
