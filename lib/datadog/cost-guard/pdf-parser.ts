/**
 * Wrapper for pdf-parse to avoid test file loading issues
 * pdf-parse v1.1.1 has code that runs when module.parent is falsy
 * We use a lazy require with error handling
 */

let pdfParseCache: any = null;

export default function parsePDF(buffer: Buffer): Promise<{ text: string }> {
  if (!pdfParseCache) {
    // Lazy load pdf-parse only when needed
    // The module may try to load test files, but we can still use it
    try {
      pdfParseCache = require('pdf-parse');
    } catch (err: any) {
      // If error is about test files, the module still loaded successfully
      // We can require it again and it should work
      if (err.code === 'ENOENT' && err.path?.includes('test/data')) {
        // Module is already loaded, just get it from cache
        pdfParseCache = require('pdf-parse');
      } else {
        throw err;
      }
    }
  }
  
  return pdfParseCache(buffer);
}

