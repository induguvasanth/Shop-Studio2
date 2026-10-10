/* Advanced PDF Studio: A4 landscape 2-up sheets with alternate full-sheet 180 degree rotation. */
(()=>{'use strict';
  const input=document.getElementById('imposePdfInput'), button=document.getElementById('imposePdfBuild');
  const status=document.getElementById('imposePdfStatus'),result=document.getElementById('imposePdfResult'),download=document.getElementById('imposePdfDownload');
  if(!input||!button||!status||!download)return;
  let objectUrl=null, busy=false;
  const setStatus=message=>{status.textContent=message};
  const generate=async()=>{
    if(!input.files?.[0]||busy)return;
    if(!window.PDFLib){setStatus('PDF library did not load. Check internet connection and reload.');return;}
    busy=true;button.disabled=true;result.hidden=true;
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    setStatus('Arranging PDF pages for printing…');
    try{
      const file=input.files[0], raw=await file.arrayBuffer(),src=await PDFLib.PDFDocument.load(raw,{ignoreEncryption:false,updateMetadata:false});
      const count=src.getPageCount();if(!count)throw Error('This PDF contains no pages.');
      const dst=await PDFLib.PDFDocument.create();
      // ISO A4 landscape, PDF points. Each half occupies exactly 148.5 × 210 mm.
      const sheetW=841.8898,sheetH=595.2756,halfW=sheetW/2;
      const margin=15, footerH=25, font=await dst.embedFont(PDFLib.StandardFonts.Helvetica);
      // pdf-lib embeds only page 0 by default; explicitly embed every original page.
      let embedded=null, raster=null;
      try {
        // embedPages accepts PDFPage objects; embedPdf's page-index behavior differs between releases.
        embedded=await dst.embedPages(src.getPages());
        if(embedded.length!==count||embedded.some(p=>!p||!Number.isFinite(p.width)||!Number.isFinite(p.height)))throw Error('Invalid embedded page');
      } catch(embedError) {
        // Some scanner/legacy PDFs cannot be embedded as vectors. Use PDF.js raster output instead.
        console.warn('Vector embedding unavailable; switching to high-resolution PDF rendering.',embedError);
        const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
        raster=await pdfjs.getDocument({data:new Uint8Array(raw.slice(0))}).promise;
        if(raster.numPages!==count)throw Error('Could not read all original PDF pages.');
      }
      for(let i=0;i<count;i+=2){
        const sheet=dst.addPage([sheetW,sheetH]);
        for(let j=0;j<2&&i+j<count;j++){
          const idx=i+j,cw=halfW-2*margin,ch=sheetH-2*margin-footerH;
          let source=embedded?.[idx], image=null, sw, sh;
          if(raster){
            const pg=await raster.getPage(idx+1),vp=pg.getViewport({scale:2.25});
            const cv=document.createElement('canvas');cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);
            await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
            const blob=await new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(Error('Page rendering failed')),'image/png'));
            image=await dst.embedPng(await blob.arrayBuffer());sw=image.width;sh=image.height;
            cv.width=cv.height=1;
          } else {
            if(!source)throw Error(`Original PDF page ${idx+1} could not be embedded.`);
            sw=source.width;sh=source.height;
          }
          if(sw<=0||sh<=0)throw Error('Page '+(idx+1)+' has invalid dimensions.');
          const scale=Math.min(cw/sw,ch/sh),w=sw*scale,h=sh*scale;
          const centerX=j*halfW+halfW/2,centerY=margin+footerH+ch/2;
          // Keep both original pages in reading order and upright within this combined sheet.
          if(image)sheet.drawImage(image,{x:centerX-w/2,y:centerY-h/2,width:w,height:h});
          else sheet.drawPage(source,{x:centerX-w/2,y:centerY-h/2,width:w,height:h});
        }
        // Number the resulting sheets, not their constituent original pages.
        const sheetNumber=String(Math.floor(i/2)+1),fontSize=11;
        const numberW=font.widthOfTextAtSize(sheetNumber,fontSize);
        sheet.drawText(sheetNumber,{x:(sheetW-numberW)/2,y:margin+5,size:fontSize,font,color:PDFLib.rgb(.16,.16,.16)});
        // Printed sheet 2, 4, 6 ... is rotated as a WHOLE, including its number.
        if((Math.floor(i/2)+1)%2===0)sheet.setRotation(PDFLib.degrees(180));
      }
      const bytes=await dst.save();objectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
      download.href=objectUrl;download.download=file.name.replace(/\.pdf$/i,'').replace(/[^a-z0-9_-]+/gi,'_').slice(0,55)+'_2up_A4_print.pdf';
      result.hidden=false;setStatus(`Ready: ${count} original pages → ${Math.ceil(count/2)} A4 landscape sheets. Every second combined sheet rotated 180°; one sheet number per A4 sheet.`);
      // Auto arrange and prepare the file, without triggering an unsolicited browser download.
    }catch(err){console.error('Advanced PDF Studio failed:',err);setStatus('Could not arrange PDF: '+(err?.message||String(err)))}
    finally{busy=false;button.disabled=!input.files?.length;}
  };
  input.addEventListener('change',()=>{button.disabled=!input.files?.length;result.hidden=true;if(input.files?.length)generate();});
  button.addEventListener('click',generate);
  window.addEventListener('pagehide',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)});
})();
