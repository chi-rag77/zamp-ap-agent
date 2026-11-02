import sharp from 'sharp';
export class DocumentError extends Error {constructor(public code:'DOCUMENT_NOT_FOUND'|'DOCUMENT_TOO_LARGE'|'UNSUPPORTED_DOCUMENT_TYPE'|'DOCUMENT_CORRUPTED'|'PDF_RENDER_FAILED',message:string){super(message);this.name='DocumentError'}}
type VisionPage={pageNumber:number;mimeType:'image/png'|'image/jpeg';bytes:Buffer};

export type InvoiceDocumentInput={bytes:Buffer;mimeType:string;filename:string};
export type PreparedDocument={pages:VisionPage[];mimeType:string;sizeBytes:number;text?:string};
export type PrepareDocumentOptions={pageLimit?:number};
const supported=new Set(['application/pdf','image/png','image/jpeg','image/jpg']);
async function loadPdfParser(){
  // Some serverless Node runtimes do not expose DOMMatrix before pdf.js loads.
  // Initialize the bundled native canvas globals first, and only import pdf.js
  // when a PDF is actually being processed (never during normal page rendering).
  const canvas=await import('@napi-rs/canvas');
  Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
  const [{PDFParse},{getData}]=await Promise.all([import('pdf-parse'),import('pdf-parse/worker')]);
  PDFParse.setWorker(getData());
  return PDFParse;
}
function detectedMime(bytes:Buffer):string|null{
  if(bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  return null;
}
export function validateDocument(input:InvoiceDocumentInput,env:NodeJS.ProcessEnv=process.env):string{
  if(!input.bytes?.length)throw new DocumentError('DOCUMENT_NOT_FOUND','Document is empty or missing');
  const maxMb=Number(env.MAX_INVOICE_FILE_SIZE_MB??20);
  if(!Number.isFinite(maxMb)||maxMb<=0)throw new Error('Invalid MAX_INVOICE_FILE_SIZE_MB');
  if(input.bytes.length>maxMb*1024*1024)throw new DocumentError('DOCUMENT_TOO_LARGE',`Document exceeds ${maxMb} MB`);
  const mime=input.mimeType.toLowerCase();
  if(!supported.has(mime))throw new DocumentError('UNSUPPORTED_DOCUMENT_TYPE',`Unsupported document type: ${mime}`);
  const actual=detectedMime(input.bytes);
  if(!actual||(mime==='image/jpg'?'image/jpeg':mime)!==actual)throw new DocumentError('DOCUMENT_CORRUPTED','Document content does not match its MIME type');
  return actual;
}
export async function prepareDocument(input:InvoiceDocumentInput,env:NodeJS.ProcessEnv=process.env,options:PrepareDocumentOptions={}):Promise<PreparedDocument>{
  const mimeType=validateDocument(input,env);
  if(mimeType!=='application/pdf'){
    try{
      const metadata=await sharp(input.bytes,{limitInputPixels:150_000_000}).metadata();
      if(!metadata.width||!metadata.height)throw new Error('Image dimensions unavailable');
      // Auto-orient without reducing resolution or changing color. PNG avoids JPEG recompression.
      const bytes=await sharp(input.bytes,{limitInputPixels:150_000_000}).rotate().png().toBuffer();
      return {pages:[{pageNumber:1,mimeType:'image/png',bytes}],mimeType,sizeBytes:input.bytes.length};
    }catch{throw new DocumentError('DOCUMENT_CORRUPTED','Image cannot be decoded')}
  }
  const maxPages=Math.max(1,Number(env.MAX_INVOICE_PAGES??20));
  const PDFParse=await loadPdfParser();
  const parser=new PDFParse({data:input.bytes});
  try{
    let rendered;
    const pageLimit=options.pageLimit===undefined?maxPages:Math.max(1,Math.min(maxPages,Math.floor(options.pageLimit)));
    try{rendered=await parser.getScreenshot({first:1,last:maxPages+1,...(options.pageLimit===undefined?{}:{partial:Array.from({length:pageLimit},(_,index)=>index+1)}),desiredWidth:1240,imageBuffer:true,imageDataUrl:false})}
    catch(error){console.error('Invoice PDF page rendering failed',error);throw new DocumentError('DOCUMENT_CORRUPTED','PDF pages could not be read')}
    const pages=rendered.total;
    if(!Number.isInteger(pages)||pages<1)throw new DocumentError('DOCUMENT_CORRUPTED','PDF page count cannot be read');
    if(pages>maxPages)throw new DocumentError('DOCUMENT_TOO_LARGE',`PDF has ${pages} pages; limit is ${maxPages}`);
    const expectedRenderedPages=options.pageLimit===undefined?pages:Math.min(pages,pageLimit);
    if(rendered.pages.length!==expectedRenderedPages||rendered.pages.some(page=>page.data.length===0))throw new DocumentError('PDF_RENDER_FAILED','Rendered page count differs from the requested page range');
    // Preserve the PDF text layer as a second signal for vision extraction.
    // Scanned PDFs continue to use their rendered page images as before.
    let text='';
    try{text=(await parser.getText({first:1,last:expectedRenderedPages})).text.trim().slice(0,24000)}catch(error){console.warn('Invoice PDF text extraction unavailable',error)}
    return {pages:rendered.pages.map(page=>({pageNumber:page.pageNumber,mimeType:'image/png' as const,bytes:Buffer.from(page.data)})),mimeType,sizeBytes:input.bytes.length,...(text?{text}:{})};
  }finally{await parser.destroy().catch(()=>undefined)}
}
