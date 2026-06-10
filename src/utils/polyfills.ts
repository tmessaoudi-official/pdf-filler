// Neumaier compensated summation — matches the precision of the native Math.sumPrecise API
// (TC39 proposal, available in Chrome/Edge 137+). Needed by pdfjs-dist 6.x for ToUnicode
// font lookups; without it, subset-font PDFs render as garbled ASCII on older browsers.
interface MathWithSumPrecise {
  sumPrecise?: (iterable: Iterable<number>) => number;
}

if (typeof (Math as MathWithSumPrecise).sumPrecise !== 'function') {
  (Math as MathWithSumPrecise).sumPrecise = function (iterable: Iterable<number>): number {
    let sum = 0, c = 0;
    for (const x of iterable) {
      const t = sum + x;
      c += Math.abs(sum) >= Math.abs(x) ? (sum - t) + x : (x - t) + sum;
      sum = t;
    }
    return sum + c;
  };
}
