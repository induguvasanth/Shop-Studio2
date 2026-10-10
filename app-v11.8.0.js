/* Shop Studio Pro v11.8 — single passport border + image/PDF compressor */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const blobOf=(c,t='image/jpeg',q=.92)=>new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Canvas export failed')),t,q));
const download=(blob,name)=>{const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=window.shopAutoFilename?window.shopAutoFilename(name):name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)};
const imageFromFile=f=>new Promise((res,rej)=>{const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=e=>{URL.revokeObjectURL(u);rej(e)};im.src=u});
const imageFromCanvas=c=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=c.toDataURL('image/png')});
const pdfjs=async()=>{const m=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');m.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';return m};

/* Hide obsolete legacy compressor controls while preserving compatibility nodes required by earlier scripts. */
document.querySelectorAll('label,button,h2,h3,.eyebrow').forEach(el=>{
  if(/target\s*kb/i.test((el.textContent||'').trim())){const sec=el.closest('#compressor');if(sec){sec.hidden=true;sec.setAttribute('aria-hidden','true')}else el.style.display='none';}
});

const input=$('cf118Input'); if(!input)return;
const stage=$('cf118Stage'),shell=$('cf118Shell'),canvas=$('cf118Canvas'),ctx=canvas.getContext('2d'),box=$('cf118CropBox');
let file=null,kind=null,img=null,pdfBytes=null,pdfDoc=null,pdfPage=1,pdfSelectedPages=[1];
let crop={x:.08,y:.08,w:.84,h:.84},cropApplied=null,drag=null;

function status(t){$('cf118Status').textContent=t}
function showBox(on=true){box.hidden=!on; if(on)renderBox()}
function renderBox(){box.style.left=(crop.x*100)+'%';box.style.top=(crop.y*100)+'%';box.style.width=(crop.w*100)+'%';box.style.height=(crop.h*100)+'%'}
function resetCrop(){crop={x:.08,y:.08,w:.84,h:.84};cropApplied=null;renderBox();status('Crop reset. Full file will be compressed unless you apply a crop.')}
function targetBytes(){const n=Math.max(1,+$('cf118Target').value||1);return Math.round(n*($('cf118Unit').value==='mb'?1024*1024:1024))}
function formatBytes(n){return n>=1024*1024?(n/1024/1024).toFixed(2)+' MB':(n/1024).toFixed(1)+' KB'}

function parsePdfPageSelection(text,total){
  if(!text||!String(text).trim())return[1];
  const out=[];for(const raw of String(text).split(',').map(v=>v.trim()).filter(Boolean)){
    if(raw.includes('-')){let[a,b]=raw.split('-').map(Number);if(!Number.isFinite(a)||!Number.isFinite(b))continue;if(a>b)[a,b]=[b,a];for(let n=a;n<=b;n++)if(n>=1&&n<=total)out.push(n)}
    else{const n=Number(raw);if(Number.isInteger(n)&&n>=1&&n<=total)out.push(n)}
  }
  return [...new Set(out)].length?[...new Set(out)]:[1];
}


async function renderImagePreview(){
  const max=1300,iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,s=Math.min(1,max/Math.max(iw,ih));
  canvas.width=Math.max(1,Math.round(iw*s));canvas.height=Math.max(1,Math.round(ih*s));ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,canvas.width,canvas.height);$('cf118Empty').style.display='none';shell.style.display='inline-block';
}
async function renderPdfPreview(){
  const p=await pdfDoc.getPage(pdfPage),vp0=p.getViewport({scale:1}),s=Math.min(1.7,1200/Math.max(vp0.width,vp0.height)),vp=p.getViewport({scale:s});
  canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await p.render({canvasContext:ctx,viewport:vp}).promise;$('cf118Empty').style.display='none';shell.style.display='inline-block';
}

input.addEventListener('change',async()=>{
  const f=input.files?.[0]; if(!f)return; file=f; crop={x:.08,y:.08,w:.84,h:.84};cropApplied=null;showBox(false);
  try{
    if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){
      kind='pdf';pdfBytes=await f.arrayBuffer();const m=await pdfjs();pdfDoc=await m.getDocument({data:new Uint8Array(pdfBytes.slice(0))}).promise;img=null;
      if(pdfDoc.numPages>1){const ask=window.prompt(`This PDF has ${pdfDoc.numPages} pages. Enter page number(s) to load (example: 2 or 1,3-5). Leave blank for page 1.`,'');pdfSelectedPages=parsePdfPageSelection(ask,pdfDoc.numPages)}else pdfSelectedPages=[1];
      pdfPage=pdfSelectedPages[0]||1;await renderPdfPreview();status(`Loaded PDF page${pdfSelectedPages.length>1?'s':''} ${pdfSelectedPages.join(', ')} of ${pdfDoc.numPages} • ${formatBytes(f.size)}. Crop applies only to the loaded page(s).`);
    }else if(f.type.startsWith('image/')){
      kind='image';img=await imageFromFile(f);pdfBytes=null;pdfDoc=null;await renderImagePreview();status(`Loaded image • ${img.naturalWidth||img.width}×${img.naturalHeight||img.height}px • ${formatBytes(f.size)}`);
    }else throw new Error('Unsupported file');
  }catch(e){console.error(e);kind=null;status('Could not load this file. Please choose a valid image or PDF.');}
});

$('cf118CropBtn').onclick=async()=>{if(!kind)return status('Load an image or PDF first.');if(kind==='pdf')await renderPdfPreview();showBox(true);status(kind==='pdf'?`Adjust crop for loaded page${pdfSelectedPages.length>1?'s':''} ${pdfSelectedPages.join(', ')}. Apply Crop uses this crop on those page(s) only.`:'Adjust crop, then click Apply Crop.')};
$('cf118ResetCrop').onclick=()=>{if(!kind)return;resetCrop();showBox(false)};
$('cf118ApplyCrop').onclick=async()=>{
  if(!kind)return status('Load an image or PDF first.'); cropApplied={...crop}; showBox(false);
  if(kind==='image'){
    const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,x=Math.round(crop.x*iw),y=Math.round(crop.y*ih),w=Math.max(1,Math.round(crop.w*iw)),h=Math.max(1,Math.round(crop.h*ih));
    const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,x,y,w,h,0,0,w,h);img=await imageFromCanvas(c);cropApplied=null;crop={x:.08,y:.08,w:.84,h:.84};await renderImagePreview();status(`Crop applied to image • ${w}×${h}px`);
  } else {await renderPdfPreview();const src=document.createElement('canvas');src.width=canvas.width;src.height=canvas.height;src.getContext('2d').drawImage(canvas,0,0);const sx=Math.round(cropApplied.x*src.width),sy=Math.round(cropApplied.y*src.height),sw=Math.max(1,Math.round(cropApplied.w*src.width)),sh=Math.max(1,Math.round(cropApplied.h*src.height));canvas.width=sw;canvas.height=sh;ctx.drawImage(src,sx,sy,sw,sh,0,0,sw,sh);status(`PDF crop applied to loaded page${pdfSelectedPages.length>1?'s':''} ${pdfSelectedPages.join(', ')}.`);}
};

box.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();const r=canvas.getBoundingClientRect(),h=e.target.dataset.h||'move';drag={h,sx:e.clientX,sy:e.clientY,start:{...crop},rw:Math.max(1,r.width),rh:Math.max(1,r.height)};
});
document.addEventListener('pointermove',e=>{
  if(!drag)return;const dx=(e.clientX-drag.sx)/drag.rw,dy=(e.clientY-drag.sy)/drag.rh,s=drag.start,h=drag.h,n={...s},min=.03;
  if(h==='move'){n.x=clamp(s.x+dx,0,1-s.w);n.y=clamp(s.y+dy,0,1-s.h)}else{
    if(h.includes('w')){const nx=clamp(s.x+dx,0,s.x+s.w-min);n.w=s.w+(s.x-nx);n.x=nx}
    if(h.includes('e'))n.w=clamp(s.w+dx,min,1-s.x);
    if(h.includes('n')){const ny=clamp(s.y+dy,0,s.y+s.h-min);n.h=s.h+(s.y-ny);n.y=ny}
    if(h.includes('s'))n.h=clamp(s.h+dy,min,1-s.y);
  }
  crop=n;renderBox();
},{passive:false});
['pointerup','pointercancel'].forEach(ev=>document.addEventListener(ev,()=>drag=null));

function sourceImageCanvas(){
  const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height,c=document.createElement('canvas');let sw=iw,sh=ih,sx=0,sy=0;
  if(cropApplied){sx=Math.round(cropApplied.x*iw);sy=Math.round(cropApplied.y*ih);sw=Math.max(1,Math.round(cropApplied.w*iw));sh=Math.max(1,Math.round(cropApplied.h*ih));}
  const maxDim=Math.max(0,+$('cf118MaxDim').value||0),scale=maxDim?Math.min(1,maxDim/Math.max(sw,sh)):1;c.width=Math.max(1,Math.round(sw*scale));c.height=Math.max(1,Math.round(sh*scale));
  const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);return c;
}
async function compressRasterCanvas(base,target,mime,mode){
  const scales=mode==='best'?[1,.94,.88,.82,.75,.68,.6,.52,.44,.36]:mode==='balanced'?[1,.88,.76,.64,.52,.42,.34]:[.85,.72,.6,.5,.4,.32,.25];
  let best=null,bestDiff=Infinity,bestW=base.width,bestH=base.height;
  for(const sc of scales){
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(base.width*sc));c.height=Math.max(1,Math.round(base.height*sc));const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';if(mime==='image/jpeg'){x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height)}x.drawImage(base,0,0,c.width,c.height);
    if(mime==='image/png'){
      const b=await blobOf(c,mime,1),d=Math.abs(b.size-target);if(d<bestDiff){best=b;bestDiff=d;bestW=c.width;bestH=c.height}if(b.size<=target*1.02)break;continue;
    }
    let lo=mode==='best'?.35:.18,hi=.98;
    for(let i=0;i<12;i++){const q=(lo+hi)/2,b=await blobOf(c,mime,q),d=Math.abs(b.size-target);if(d<bestDiff){best=b;bestDiff=d;bestW=c.width;bestH=c.height}if(b.size>target)hi=q;else lo=q}
    if(best&&best.size<=target*1.02&&best.size>=target*.72)break;
  }
  return{blob:best,w:bestW,h:bestH};
}
async function compressImage(){
  const target=targetBytes(),mode=$('cf118Quality').value,base=sourceImageCanvas(),chosen=$('cf118Format').value;
  let mime=chosen==='jpeg'?'image/jpeg':chosen==='webp'?'image/webp':chosen==='png'?'image/png':(file.type==='image/png'?'image/png':file.type==='image/webp'?'image/webp':'image/jpeg');
  let out=await compressRasterCanvas(base,target,mime,mode);
  if(chosen==='auto'&&mime==='image/png'&&out.blob.size>target*1.05){mime='image/jpeg';out=await compressRasterCanvas(base,target,mime,mode)}
  const ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg',baseName=file.name.replace(/\.[^.]+$/,'');download(out.blob,`${baseName}-compressed.${ext}`);
  status(`Done • ${formatBytes(out.blob.size)} • ${out.w}×${out.h}px${out.blob.size>target*1.05?' • requested size is too low for higher quality; closest result exported.':''}`);
}
async function renderPdfPageBase(page,scale,cropRect){
  const vp0=page.getViewport({scale:1}),maxDim=Math.max(0,+$('cf118MaxDim').value||0);let sc=scale;if(maxDim)sc=Math.min(sc,maxDim/Math.max(vp0.width,vp0.height));const vp=page.getViewport({scale:sc}),full=document.createElement('canvas');full.width=Math.max(1,Math.ceil(vp.width));full.height=Math.max(1,Math.ceil(vp.height));await page.render({canvasContext:full.getContext('2d'),viewport:vp}).promise;
  if(!cropRect)return full;const sx=Math.round(cropRect.x*full.width),sy=Math.round(cropRect.y*full.height),sw=Math.max(1,Math.round(cropRect.w*full.width)),sh=Math.max(1,Math.round(cropRect.h*full.height)),c=document.createElement('canvas');c.width=sw;c.height=sh;c.getContext('2d').drawImage(full,sx,sy,sw,sh,0,0,sw,sh);return c;
}
async function buildPdfAt(scale,q){
  const doc=await PDFLib.PDFDocument.create();
  for(let k=0;k<pdfSelectedPages.length;k++){const n=pdfSelectedPages[k];status(`Compressing PDF • loaded page ${k+1}/${pdfSelectedPages.length} (source page ${n})…`);const pg=await pdfDoc.getPage(n),c=await renderPdfPageBase(pg,scale,cropApplied),b=await blobOf(c,'image/jpeg',q),im=await doc.embedJpg(await b.arrayBuffer()),p=doc.addPage([im.width,im.height]);p.drawImage(im,{x:0,y:0,width:im.width,height:im.height});}
  return await doc.save({useObjectStreams:true});
}
async function compressPdf(){
  const target=targetBytes(),mode=$('cf118Quality').value;
  const scales=mode==='best'?[2,1.7,1.45,1.25,1.08,.92,.78,.64,.52]:mode==='balanced'?[1.6,1.35,1.15,.98,.82,.68,.55,.45]:[1.2,1,.82,.68,.55,.44,.34];
  const qs=mode==='best'?[.9,.82,.74,.66,.58,.5,.42,.34]:mode==='balanced'?[.82,.7,.6,.5,.4,.32,.24]:[.62,.5,.4,.3,.22,.16,.11];
  let best=null,bestDiff=Infinity;
  outer:for(const sc of scales){
    for(const q of qs){const out=await buildPdfAt(sc,q),d=Math.abs(out.byteLength-target);if(d<bestDiff){best=out;bestDiff=d}if(out.byteLength<=target*1.02&&out.byteLength>=target*.68)break outer;if(out.byteLength<target*.55)break;}
  }
  const blob=new Blob([best],{type:'application/pdf'}),base=file.name.replace(/\.pdf$/i,'');download(blob,`${base}-compressed.pdf`);status(`Done • PDF ${formatBytes(blob.size)} • ${pdfSelectedPages.length} loaded page(s)${cropApplied?' • crop applied':''}${blob.size>target*1.05?' • closest quality-preserving result exported.':''}`);
}

$('cf118Compress').onclick=async()=>{
  if(!kind)return status('Load an image or PDF first.');const b=$('cf118Compress');b.disabled=true;const old=b.textContent;b.textContent='Compressing…';
  try{if(kind==='image')await compressImage();else await compressPdf()}catch(e){console.error(e);status('Compression failed. Original file was not changed.')}finally{b.disabled=false;b.textContent=old}
};

/* Passport print sheet: keep a single continuous photo border; cut lines are corner crop marks in v11.6 renderer. */
window.addEventListener('DOMContentLoaded',()=>{
  document.title='Shop Studio Pro v11.9';const bs=document.querySelector('.brand-subtitle');if(bs)bs.textContent='PRO TOOLKIT • V11.9';
  const note=$('passportSheetStatusV116'); if(note&&/regenerate/i.test(note.textContent||'')) note.title='Photo border is a single line. Cut Lines use corner crop marks, not a second rectangle.';
});
})();
