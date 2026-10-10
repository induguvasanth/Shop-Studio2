const $ = (id)=>document.getElementById(id);
const qsa = (sel)=>[...document.querySelectorAll(sel)];

const state = {
  scanImg:null, scanPages:[], scanCurrentIndex:0, photoImg:null, photoOriginal:null,
  resizeImg:null, compressFile:null, printImages:[], ocrFile:null,
  scanCropMode:false, scanCropPts:null, photoCrop:null,
  cardFront:null, cardBack:null,
  cardPdf:null, cardPdfPage:1, cardSourceImg:null,
  cardSourceScale:1, cardSourceType:null,
  cardFrontCrop:null, cardBackCrop:null,
  detectedCards:[], bulkPhotos:[], cardPerspectivePts:null, cardPerspectiveMode:false
};

function addHistory(type, name, detail=""){
  const items = JSON.parse(localStorage.getItem("shopstudio_history")||"[]");
  items.unshift({type,name,detail,time:new Date().toLocaleString()});
  localStorage.setItem("shopstudio_history", JSON.stringify(items.slice(0,30)));
  renderHistory();
}
function renderHistory(){
  const wrap=$("historyList"); if(!wrap) return;
  const items=JSON.parse(localStorage.getItem("shopstudio_history")||"[]");
  wrap.innerHTML=items.length?items.map(x=>`<div class="history-item"><div><strong>${escapeHtml(x.name)}</strong><div><small>${escapeHtml(x.type)}${x.detail?` • ${escapeHtml(x.detail)}`:""}</small></div></div><small>${escapeHtml(x.time)}</small></div>`).join(""):`<div class="notice">No recent jobs on this PC.</div>`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function showSection(id){
  qsa(".section").forEach(s=>s.classList.toggle("active",s.id===id));
  qsa(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.section===id));
  const label = qsa(`.nav-item[data-section="${id}"]`)[0]?.textContent || "Dashboard";
  $("pageTitle").textContent=label;
  window.scrollTo({top:0,behavior:"smooth"});
}
qsa("[data-section]").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.section)));
qsa("[data-section-jump]").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.sectionJump)));

async function fileToImage(file){
  return await new Promise((res,rej)=>{
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{ URL.revokeObjectURL(url); res(img); };
    img.onerror=(e)=>{ URL.revokeObjectURL(url); rej(e); };
    img.src=url;
  });
}
function shopAutoFilename(filename){
  const raw=String(filename||"export"),parts=raw.split("."),ext=(parts.length>1?parts.pop():"png").toLowerCase();
  const base=(parts.join(".")||"export").toLowerCase();
  const section=base.includes("passport")?"passport":base.includes("print")?"print":base.includes("scan")?"scan":base.includes("card")?"card":base.includes("compress")?"compress":base.includes("pdf")?"pdf":base.includes("ocr")?"ocr":"shop";
  const d=new Date(),dd=String(d.getDate()).padStart(2,"0"),mm=String(d.getMonth()+1).padStart(2,"0"),yy=String(d.getFullYear()).slice(-2),hh=String(d.getHours()).padStart(2,"0"),mi=String(d.getMinutes()).padStart(2,"0");
  return `${section}-${dd}${mm}${yy}-${hh}${mi}.${ext}`;
}
window.shopAutoFilename=shopAutoFilename;
function downloadDataURL(dataUrl, filename){
  const a=document.createElement("a"); a.href=dataUrl; a.download=shopAutoFilename(filename); a.click();
}
function canvasToBlob(canvas,type="image/jpeg",quality=.92){
  return new Promise(r=>canvas.toBlob(r,type,quality));
}
function mmToPx(mm,dpi){return Math.round(mm/25.4*dpi)}
function unitToPx(v,unit,dpi){
  v=Number(v); dpi=Number(dpi)||300;
  if(unit==="px") return Math.max(1,Math.round(v));
  if(unit==="mm") return mmToPx(v,dpi);
  if(unit==="cm") return mmToPx(v*10,dpi);
  if(unit==="in") return Math.round(v*dpi);
  return Math.round(v);
}
function fitContain(ctx,img,x,y,w,h){
  const s=Math.min(w/img.width,h/img.height); const dw=img.width*s, dh=img.height*s;
  ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
}
function fitCover(ctx,img,x,y,w,h){
  const s=Math.max(w/img.width,h/img.height); const sw=w/s, sh=h/s;
  const sx=(img.width-sw)/2, sy=(img.height-sh)/2;
  ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
}



function applyPreviewZoom(canvasId, sliderId, labelId, rerender){
  const canvas=$(canvasId), slider=$(sliderId), label=$(labelId);
  if(!canvas || !slider) return;
  const z=(Number(slider.value)||100)/100;
  canvas.style.transform=`scale(${z})`;
  if(label) label.textContent=`${Math.round(z*100)}%`;
  if(typeof rerender==="function") requestAnimationFrame(rerender);
}
function cropCanvasWhitespace(canvas, threshold=250, padding=10){
  const ctx=canvas.getContext("2d"), data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let minX=canvas.width, minY=canvas.height, maxX=-1, maxY=-1;
  for(let y=0;y<canvas.height;y++){
    for(let x=0;x<canvas.width;x++){
      const i=(y*canvas.width+x)*4, a=data[i+3], avg=(data[i]+data[i+1]+data[i+2])/3;
      if(a>10 && avg<threshold){
        if(x<minX)minX=x; if(x>maxX)maxX=x;
        if(y<minY)minY=y; if(y>maxY)maxY=y;
      }
    }
  }
  if(maxX<minX || maxY<minY) return canvas;
  minX=Math.max(0,minX-padding); minY=Math.max(0,minY-padding);
  maxX=Math.min(canvas.width-1,maxX+padding); maxY=Math.min(canvas.height-1,maxY+padding);
  const out=document.createElement("canvas");
  out.width=maxX-minX+1; out.height=maxY-minY+1;
  out.getContext("2d").drawImage(canvas,minX,minY,out.width,out.height,0,0,out.width,out.height);
  return out;
}
function upscaleAndSharpen(canvas, factor=2){
  const out=document.createElement("canvas");
  out.width=Math.max(1,Math.round(canvas.width*factor));
  out.height=Math.max(1,Math.round(canvas.height*factor));
  const octx=out.getContext("2d");
  octx.imageSmoothingEnabled=true;
  octx.imageSmoothingQuality="high";
  octx.drawImage(canvas,0,0,out.width,out.height);

  const img=octx.getImageData(0,0,out.width,out.height), d=img.data;
  const copy=new Uint8ClampedArray(d);
  const w=out.width, h=out.height;
  const kernel=[0,-1,0,-1,5,-1,0,-1,0];
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      for(let c=0;c<3;c++){
        let sum=0, ki=0;
        for(let ky=-1;ky<=1;ky++){
          for(let kx=-1;kx<=1;kx++){
            const idx=((y+ky)*w+(x+kx))*4+c;
            sum += copy[idx]*kernel[ki++];
          }
        }
        d[(y*w+x)*4+c] = Math.max(0,Math.min(255,sum));
      }
    }
  }
  octx.putImageData(img,0,0);
  return out;
}
function canvasToImage(canvas){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.src=canvas.toDataURL("image/png");
  });
}
function setCropBoxFromRect(boxId, canvasId, rect){
  const box=$(boxId), c=$(canvasId).getBoundingClientRect(), host=box.parentElement.getBoundingClientRect();
  box.style.display="block"; box.style.visibility="visible";
  box.style.left=(c.left-host.left+rect.x)+"px";
  box.style.top=(c.top-host.top+rect.y)+"px";
  box.style.width=rect.w+"px"; box.style.height=rect.h+"px";
}
function getBoxRectRelative(boxId,canvasId){
  const b=$(boxId).getBoundingClientRect(),c=$(canvasId).getBoundingClientRect();
  return {x:b.left-c.left,y:b.top-c.top,w:b.width,h:b.height};
}

// SCANNER
$("scanInput").addEventListener("change",async e=>{
  const files=[...e.target.files]; if(!files.length) return;
  state.scanPages=[];
  for(const f of files){ const img=await fileToImage(f); state.scanPages.push({img,name:f.name}); }
  state.scanCurrentIndex=0; state.scanImg=state.scanPages[0].img; drawScan(); renderScanThumbs(); addHistory("Scanner","Imported pages",`${files.length} page(s)`);
});
$("cameraInput").addEventListener("change",async e=>{ const f=e.target.files[0]; if(!f)return; state.scanImg=await fileToImage(f); state.scanPages.push({img:state.scanImg,name:f.name}); state.scanCurrentIndex=state.scanPages.length-1; drawScan();renderScanThumbs();});
$("cameraScanBtn").addEventListener("click",()=> $("cameraInput").click());

function renderScanThumbs(){
  $("scanPages").innerHTML=state.scanPages.map((p,i)=>`<img class="page-thumb" data-i="${i}" src="${p.img.src}" title="${escapeHtml(p.name||("Page "+(i+1)))}">`).join("");
  qsa(".page-thumb").forEach(t=>t.onclick=()=>{state.scanCurrentIndex=+t.dataset.i;state.scanImg=state.scanPages[state.scanCurrentIndex].img; drawScan();});
}
function drawScan(){
  if(!state.scanImg) return;
  $("scanEmpty").style.display="none";
  const img=state.scanImg, rot=+$("scanRotate").value; const c=$("scanCanvas"),ctx=c.getContext("2d");
  const swap=rot===90||rot===270; c.width=swap?img.height:img.width; c.height=swap?img.width:img.height;
  ctx.save(); ctx.translate(c.width/2,c.height/2); ctx.rotate(rot*Math.PI/180);
  let filter="none"; const f=$("scanFilter").value;
  if(f==="vibrant") filter="contrast(1.12) saturate(1.25)";
  if(f==="soft") filter="brightness(1.06) contrast(.94) saturate(.92)";
  if(f==="document") filter="grayscale(.15) contrast(1.35) brightness(1.08)";
  if(f==="bw") filter="grayscale(1) contrast(1.65)";
  const sh=+$("shadowStrength").value/100;
  if(sh>0 && f!=="bw") filter += ` brightness(${1+sh*.08}) contrast(${1+sh*.08})`;
  ctx.filter=filter;
  ctx.drawImage(img,-img.width/2,-img.height/2); ctx.restore();
  const sharp=(+$("ocrSharpen").value||0)/100;
  if(sharp>0){
    sharpenCanvas(c, sharp*0.45);
  }
  if(state.scanCropMode) renderScanPerspectiveOverlay();
}
["scanFilter","scanRotate","shadowStrength","ocrSharpen"].forEach(id=>$(id).addEventListener("input",drawScan));

$("scanZoom").addEventListener("input",()=>applyPreviewZoom("scanCanvas","scanZoom","scanZoomValue",renderScanPerspectiveOverlay));

$("deskewBtn").onclick=async()=>{
  if(!state.scanImg) return alert("Upload a document first.");
  if(typeof cv==="undefined" || !cv.Mat) return alert("OpenCV is still loading. Try again in a few seconds.");
  try{
    const srcCanvas=document.createElement("canvas"); srcCanvas.width=state.scanImg.width; srcCanvas.height=state.scanImg.height;
    srcCanvas.getContext("2d").drawImage(state.scanImg,0,0);
    const src=cv.imread(srcCanvas), gray=new cv.Mat(), blur=new cv.Mat(), edge=new cv.Mat(), contours=new cv.MatVector(), hierarchy=new cv.Mat();
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY); cv.GaussianBlur(gray,blur,new cv.Size(5,5),0); cv.Canny(blur,edge,50,160);
    cv.findContours(edge,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    let best=null,bestScore=-Infinity; const imageArea=src.cols*src.rows;
    const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    for(let i=0;i<contours.size();i++){
      const cnt=contours.get(i), peri=cv.arcLength(cnt,true), approx=new cv.Mat(); cv.approxPolyDP(cnt,approx,0.018*peri,true);
      const area=cv.contourArea(approx), ratio=area/imageArea;
      if(approx.rows===4 && ratio>.10 && ratio<.98 && cv.isContourConvex(approx)){
        const p=[]; for(let j=0;j<4;j++){const q=approx.intPtr(j,0);p.push({x:q[0],y:q[1]});}
        const sides=[dist(p[0],p[1]),dist(p[1],p[2]),dist(p[2],p[3]),dist(p[3],p[0])];
        const rectangularity=Math.min(...sides)/Math.max(...sides);
        const score=ratio*2.5+rectangularity*1.4;
        if(score>bestScore){if(best)best.delete();best=approx;bestScore=score;}else approx.delete();
      } else approx.delete();
      cnt.delete();
    }
    if(!best){[src,gray,blur,edge,hierarchy].forEach(m=>m.delete());contours.delete();return alert("Could not detect a clear document boundary. Use Perspective Crop for manual selection.");}
    const pts=[];for(let i=0;i<4;i++){const q=best.intPtr(i,0);pts.push({x:q[0],y:q[1]});}
    const sums=pts.map(p=>p.x+p.y),diffs=pts.map(p=>p.x-p.y);
    const ordered=[pts[sums.indexOf(Math.min(...sums))],pts[diffs.indexOf(Math.max(...diffs))],pts[sums.indexOf(Math.max(...sums))],pts[diffs.indexOf(Math.min(...diffs))]];
    const srcTri=cv.matFromArray(4,1,cv.CV_32FC2,ordered.flatMap(p=>[p.x,p.y]));
    const dist2=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y); const outW=Math.max(1,Math.round(Math.max(dist2(ordered[0],ordered[1]),dist2(ordered[3],ordered[2])))); const outH=Math.max(1,Math.round(Math.max(dist2(ordered[0],ordered[3]),dist2(ordered[1],ordered[2]))));
    const dstTri=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,outW-1,0,outW-1,outH-1,0,outH-1]),M=cv.getPerspectiveTransform(srcTri,dstTri),dst=new cv.Mat();
    cv.warpPerspective(src,dst,M,new cv.Size(outW,outH),cv.INTER_CUBIC,cv.BORDER_REPLICATE,new cv.Scalar());
    const out=document.createElement("canvas");out.width=dst.cols;out.height=dst.rows;cv.imshow(out,dst);
    state.scanImg=await canvasToImage(out);state.scanCropMode=false;state.scanCropPts=null;drawScan();addHistory("Scanner","Auto document correction",`${out.width} × ${out.height}px`);
    [src,gray,blur,edge,hierarchy,best,srcTri,dstTri,M,dst].forEach(m=>m&&m.delete&&m.delete());contours.delete();
  }catch(err){console.error(err);alert("Auto correction failed. Use Perspective Crop to select the document corners manually.");}
};

function syncScanCropLayer(){
  const canvas=$("scanCanvas"),stage=$("scanCropStage"),layer=$("scanCropLayer");
  if(!canvas||!canvas.width||!layer||!stage)return;
  const cr=canvas.getBoundingClientRect(),sr=stage.getBoundingClientRect();
  layer.style.left=(cr.left-sr.left)+"px";layer.style.top=(cr.top-sr.top)+"px";layer.style.width=cr.width+"px";layer.style.height=cr.height+"px";
}
function renderScanPerspectiveOverlay(){
  const layer=$("scanCropLayer"),poly=$("scanPolygon");
  if(!layer||!state.scanCropPts||!$("scanCanvas")?.width)return;
  syncScanCropLayer();layer.style.display=state.scanCropMode?"block":"none";if(!state.scanCropMode)return;
  poly.setAttribute("points",state.scanCropPts.map(p=>`${p.x*100},${p.y*100}`).join(" "));
  qsa("#scanCropLayer .scan-point").forEach((el,i)=>{el.style.left=(state.scanCropPts[i].x*100)+"%";el.style.top=(state.scanCropPts[i].y*100)+"%";});
}
function initScanCropBox(){
  if(!$("scanCanvas").width)return alert("Upload or scan a document first.");
  state.scanCropPts=[{x:.07,y:.07},{x:.93,y:.07},{x:.93,y:.93},{x:.07,y:.93}];state.scanCropMode=true;renderScanPerspectiveOverlay();
}
$("scanManualCropBtn").onclick=initScanCropBox;
let scanPointDrag=null;
qsa("#scanCropLayer .scan-point").forEach(pt=>{
  pt.addEventListener("pointerdown",e=>{if(!state.scanCropMode)return;e.preventDefault();pt.setPointerCapture(e.pointerId);scanPointDrag={idx:+pt.dataset.point};});
  pt.addEventListener("pointermove",e=>{if(!scanPointDrag)return;const cr=$("scanCanvas").getBoundingClientRect();state.scanCropPts[scanPointDrag.idx]={x:Math.max(0,Math.min(1,(e.clientX-cr.left)/cr.width)),y:Math.max(0,Math.min(1,(e.clientY-cr.top)/cr.height))};renderScanPerspectiveOverlay();});
  pt.addEventListener("pointerup",()=>scanPointDrag=null);pt.addEventListener("pointercancel",()=>scanPointDrag=null);
});
async function perspectiveCropCanvas(sourceCanvas,pts){
  if(typeof cv==="undefined"||!cv.Mat)throw new Error("OpenCV is still loading. Please wait a moment and try again.");
  const W=sourceCanvas.width,H=sourceCanvas.height,p=pts.map(q=>({x:q.x*W,y:q.y*H})),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const outW=Math.max(1,Math.round(Math.max(dist(p[0],p[1]),dist(p[3],p[2])))),outH=Math.max(1,Math.round(Math.max(dist(p[0],p[3]),dist(p[1],p[2]))));
  const src=cv.imread(sourceCanvas),srcPts=cv.matFromArray(4,1,cv.CV_32FC2,p.flatMap(q=>[q.x,q.y])),dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,outW-1,0,outW-1,outH-1,0,outH-1]),M=cv.getPerspectiveTransform(srcPts,dstPts),dst=new cv.Mat();
  cv.warpPerspective(src,dst,M,new cv.Size(outW,outH),cv.INTER_CUBIC,cv.BORDER_REPLICATE,new cv.Scalar());
  const out=document.createElement("canvas");out.width=dst.cols;out.height=dst.rows;cv.imshow(out,dst);[src,srcPts,dstPts,M,dst].forEach(m=>m.delete());return out;
}
$("applyScanCrop").onclick=async()=>{
  if(!$("scanCanvas").width)return alert("Upload or scan a document first.");
  if(!state.scanCropMode||!state.scanCropPts)return alert("Choose Perspective Crop first.");
  try{const out=await perspectiveCropCanvas($("scanCanvas"),state.scanCropPts);state.scanImg=await canvasToImage(out);state.scanCropMode=false;state.scanCropPts=null;drawScan();addHistory("Scanner","Perspective crop applied",`${out.width} × ${out.height}px`);}
  catch(err){console.error(err);alert(err.message||"Perspective crop failed.");}
};

$("downloadScanImage").onclick=()=>{ if(!$("scanCanvas").width)return; downloadDataURL($("scanCanvas").toDataURL("image/png"),"scanned-document.png");addHistory("Scanner","Downloaded PNG");};

$("downloadOcrScan").onclick=()=>{
  if(!$("scanCanvas").width)return;
  const src=$("scanCanvas"),out=document.createElement("canvas"),ctx=out.getContext("2d");
  out.width=src.width;out.height=src.height;
  ctx.drawImage(src,0,0);
  // OCR-friendly: grayscale + contrast + sharpen
  const img=ctx.getImageData(0,0,out.width,out.height),p=img.data;
  for(let i=0;i<p.length;i+=4){
    const g=.299*p[i]+.587*p[i+1]+.114*p[i+2];
    const v=Math.max(0,Math.min(255,(g-128)*1.45+128));
    p[i]=p[i+1]=p[i+2]=v;
  }
  ctx.putImageData(img,0,0);
  sharpenCanvas(out,.55);
  downloadDataURL(out.toDataURL("image/png"),"ocr-optimized-scan.png");
  addHistory("Scanner","Downloaded OCR-optimized PNG");
};

$("addScanToPdf").onclick=async()=>{ if(!$("scanCanvas").width)return; const img=await canvasToImage($("scanCanvas")); state.scanPages.push({img,name:`Processed page ${state.scanPages.length+1}`}); state.scanCurrentIndex=state.scanPages.length-1; state.scanImg=img; renderScanThumbs(); addHistory("Scanner","Added processed page",`${state.scanPages.length} page(s)`);};
$("exportScanPdf").onclick=async()=>{
  if(!state.scanPages.length) return alert("Add at least one scanned page.");
  const pdf=await PDFLib.PDFDocument.create();
  for(let i=0;i<state.scanPages.length;i++){
    const p=state.scanPages[i], tmp=document.createElement("canvas");
    if(i===state.scanCurrentIndex && $("scanCanvas").width){tmp.width=$("scanCanvas").width;tmp.height=$("scanCanvas").height;tmp.getContext("2d").drawImage($("scanCanvas"),0,0);}
    else {tmp.width=p.img.width;tmp.height=p.img.height;tmp.getContext("2d").drawImage(p.img,0,0);}
    const bytes=await (await canvasToBlob(tmp,"image/jpeg",.9)).arrayBuffer();
    const jpg=await pdf.embedJpg(bytes); const page=pdf.addPage([jpg.width,jpg.height]); page.drawImage(jpg,{x:0,y:0,width:jpg.width,height:jpg.height});
  }
  const out=await pdf.save(); downloadBytes(out,"scanned-pages.pdf","application/pdf");addHistory("Scanner","Exported multi-page PDF",`${state.scanPages.length} pages`);
};
$("scannerBridgeBtn").onclick=async()=>{
  const btn=$("scannerBridgeBtn"), old=btn.textContent;
  btn.textContent="Finding scanners..."; btn.disabled=true;
  try{
    const r=await fetch("http://127.0.0.1:17899/scanners",{signal:AbortSignal.timeout(5000)});
    const ctype=(r.headers.get("content-type")||"").toLowerCase();
    if(!r.ok) throw new Error("Scanner bridge not responding.");
    if(!ctype.includes("application/json")){
      const txt=(await r.text()).slice(0,120);
      throw new Error(`Scanner bridge returned invalid data instead of JSON. Response preview: ${txt}`);
    }
    const data=await r.json(), scanners=data.scanners||[];
    if(!scanners.length) throw new Error("No WIA/TWAIN scanner detected. Check the scanner driver and NAPS2.");
    const choices=scanners.map((s,i)=>`${i+1}. [${String(s.driver).toUpperCase()}] ${s.name}`).join("\n");
    let pick=prompt(`Connected scanners:\n\n${choices}\n\nEnter scanner number:`,`1`);
    if(pick===null)return;
    const idx=Math.max(0,Math.min(scanners.length-1,(parseInt(pick)||1)-1)), s=scanners[idx];
    const dpi=prompt("Scan DPI (150 / 300 / 600):","300")||"300";
    const bitdepth=prompt("Color mode: color / gray / bw","color")||"color";
    const source=prompt("Source: glass / feeder / duplex","glass")||"glass";

    btn.textContent="Scanning...";
    const url=`http://127.0.0.1:17899/scan?driver=${encodeURIComponent(s.driver)}&device=${encodeURIComponent(s.name)}&dpi=${encodeURIComponent(dpi)}&bitdepth=${encodeURIComponent(bitdepth)}&source=${encodeURIComponent(source)}&deskew=true`;
    const sr=await fetch(url,{signal:AbortSignal.timeout(180000)});
    if(!sr.ok){
      const sctype=(sr.headers.get("content-type")||"").toLowerCase();
      let msg="Scan failed.";
      try{
        if(sctype.includes("application/json")) msg=(await sr.json()).error||msg;
        else msg=(await sr.text()).slice(0,180) || msg;
      }catch{}
      throw new Error(msg);
    }
    const blob=await sr.blob(), img=new Image();
    img.onload=()=>{
      state.scanImg=img; state.scanPages.push({img,name:`${s.name} scan`});
      drawScan(); renderScanThumbs(); addHistory("Scanner","Scanned from device",`${s.driver.toUpperCase()} • ${s.name}`);
      URL.revokeObjectURL(img.src);
    };
    img.src=URL.createObjectURL(blob);
  }catch(e){
    alert(`${e.message||"Scanner bridge not detected."}

Install/start the Windows Scanner Bridge from the windows-scanner-bridge folder.`);
  }finally{btn.textContent=old;btn.disabled=false;}
};

// PHOTO
$("photoInput").onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  state.photoImg=await fileToImage(f); state.photoOriginal=state.photoImg;
  drawPhoto(); initPhotoCrop(); addHistory("Photo Studio","Opened photo",f.name);
};

$("bulkPhotoInput").onchange=async e=>{
  state.bulkPhotos=[];
  for(const f of [...e.target.files]){
    try{state.bulkPhotos.push({name:f.name,img:await fileToImage(f)});}catch{}
  }
  $("photoAiStatus").textContent=state.bulkPhotos.length?`${state.bulkPhotos.length} bulk photo(s) ready.`:"No bulk photos selected.";
};

$("bulkPassportExport").onclick=()=>{
  if(!state.bulkPhotos.length)return alert("Choose Bulk Photos first.");
  state.bulkPhotos.forEach((item,i)=>{
    const c=document.createElement("canvas"),ctx=c.getContext("2d"),dpi=300;
    c.width=6*dpi;c.height=4*dpi;ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
    // one exact 6x4 layout per person using current template
    const temp=$("printCanvas"),oldW=temp.width,oldH=temp.height;
    buildDuplicateSheet(item.img,+$("passportCopies").value,"6x4",+$("passportBorder").value);
    c.width=$("printCanvas").width;c.height=$("printCanvas").height;
    c.getContext("2d").drawImage($("printCanvas"),0,0);
    downloadDataURL(c.toDataURL("image/png"),`passport-sheet-${i+1}-${item.name.replace(/\.[^.]+$/,"")}.png`);
  });
  addHistory("Photo Studio","Bulk passport export",`${state.bulkPhotos.length} sheet(s)`);
};


function drawPhoto(){
  if(!state.photoImg)return; $("photoEmpty").style.display="none";
  const img=state.photoImg,c=$("photoCanvas"),ctx=c.getContext("2d"); c.width=img.width;c.height=img.height;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
  ctx.filter=`brightness(${$("brightness").value}%) contrast(${$("contrast").value}%)`;
  ctx.drawImage(img,0,0);
  applyPreviewZoom("photoCanvas","photoZoom","photoZoomValue",null);
}
["brightness","contrast"].forEach(id=>$(id).oninput=()=>drawPhoto());

function initPhotoCrop(){
  if(!$("photoCanvas").width)return;
  const c=$("photoCanvas").getBoundingClientRect(),ratio=$("passportRatio").value;
  let w=c.width*.65,h=c.height*.75;
  if(ratio!=="free" && $("passportCropLock").value==="locked") h=w/Number(ratio);
  if(h>c.height*.85){h=c.height*.85;w=ratio==="free"?c.width*.65:h*Number(ratio);}
  state.photoCrop={x:(c.width-w)/2,y:(c.height-h)/2,w,h};
  setCropBoxFromRect("photoCropBox","photoCanvas",state.photoCrop);
}
$("photoCropBtn").onclick=initPhotoCrop;
$("passportRatio").onchange=initPhotoCrop;

$("passportCropLock").onchange=initPhotoCrop;
$("photoZoom").addEventListener("input",()=>applyPreviewZoom("photoCanvas","photoZoom","photoZoomValue",initPhotoCrop));
function updateHeadGuide(){
  const v=+$("headGuidePercent").value||70;
  $("headGuideValue").textContent=`${v}%`;
  const oval=$("headOval");
  if(oval){
    oval.style.height=`${v}%`;
    oval.style.top=`${Math.max(8,(100-v)/2-4)}%`;
  }
}
$("headGuidePercent").addEventListener("input",updateHeadGuide);
updateHeadGuide();


let photoCropDrag=null;
$("photoCropBox").addEventListener("pointerdown",e=>{
  e.preventDefault(); $("photoCropBox").setPointerCapture(e.pointerId);
  photoCropDrag={sx:e.clientX,sy:e.clientY,start:{...state.photoCrop},handle:e.target.dataset.h||"move"};
});
$("photoCropBox").addEventListener("pointermove",e=>{
  if(!photoCropDrag)return;
  const c=$("photoCanvas").getBoundingClientRect(),dx=e.clientX-photoCropDrag.sx,dy=e.clientY-photoCropDrag.sy,s=photoCropDrag.start,h=photoCropDrag.handle;
  let n={...s};
  if(h==="move"){n.x=s.x+dx;n.y=s.y+dy;}
  else{
    if(h.includes("e"))n.w=Math.max(40,s.w+dx);
    if(h.includes("s"))n.h=Math.max(50,s.h+dy);
    if(h.includes("w")){n.x=s.x+dx;n.w=Math.max(40,s.w-dx);}
    if(h.includes("n")){n.y=s.y+dy;n.h=Math.max(50,s.h-dy);}
    const ratio=$("passportRatio").value;
    if(ratio!=="free" && $("passportCropLock").value==="locked") n.h=n.w/Number(ratio);
  }
  n.x=Math.max(0,Math.min(n.x,c.width-n.w));n.y=Math.max(0,Math.min(n.y,c.height-n.h));
  state.photoCrop=n;setCropBoxFromRect("photoCropBox","photoCanvas",n);
});
$("photoCropBox").addEventListener("pointerup",()=>photoCropDrag=null);

$("applyPhotoCrop").onclick=async()=>{
  if(!state.photoImg)return alert("Upload a photo first.");
  const c=$("photoCanvas"),r=getBoxRectRelative("photoCropBox","photoCanvas"),cr=c.getBoundingClientRect();
  if(r.w<=0||r.h<=0)return alert("Set crop area first.");
  const sx=r.x*c.width/cr.width, sy=r.y*c.height/cr.height, sw=r.w*c.width/cr.width, sh=r.h*c.height/cr.height;
  const out=document.createElement("canvas");out.width=Math.round(sw);out.height=Math.round(sh);
  out.getContext("2d").drawImage(c,sx,sy,sw,sh,0,0,out.width,out.height);
  state.photoImg=await canvasToImage(out); state.photoCrop=null; drawPhoto(); hide("photoCropBox"); $("photoAiStatus").textContent="Photo cropped successfully • crop overlay closed."; addHistory("Photo Studio","Applied crop");
};

$("whiteBgBtn").onclick=async()=>{
  if(!state.photoImg)return alert("Upload a photo first.");
  const status=$("photoAiStatus"),btn=$("whiteBgBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Removing…";status.textContent="Preparing AI background removal…";
  try{
    const source=document.createElement("canvas");source.width=state.photoImg.width;source.height=state.photoImg.height;source.getContext("2d").drawImage(state.photoImg,0,0);
    const blob=await canvasToBlob(source,"image/png",1),mod=await import(/* webpackIgnore: true */ "https://esm.sh/@imgly/background-removal@1.7.0?bundle"),removeBackground=mod.default||mod.removeBackground;if(!removeBackground)throw new Error("AI engine unavailable");
    const result=await removeBackground(blob,{model:"medium",proxyToWorker:false,publicPath:"https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/",output:{format:"image/png",quality:1},progress:(key,current,total)=>{if(total)status.textContent=`Removing background • ${Math.round(current/total*100)}%`;}});
    const cutout=await fileToImage(result),out=document.createElement("canvas");out.width=cutout.width;out.height=cutout.height;const ctx=out.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(cutout,0,0);
    state.photoImg=await canvasToImage(out);drawPhoto();initPhotoCrop();status.textContent="Background removed • white background applied.";addHistory("Photo Studio","Background removed","AI + white background");
  }catch(err){console.error(err);status.textContent="AI removal unavailable. Original photo preserved.";alert("Background removal could not start. Check internet access and try again. Your original photo is unchanged.");}
  finally{btn.disabled=false;btn.textContent=old;}
};
function enhancePhotoCanvas(source,factor=2){
  const out=document.createElement("canvas");out.width=Math.min(6000,Math.round(source.width*factor));out.height=Math.min(6000,Math.round(source.height*factor));const ctx=out.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.filter="brightness(1.02) contrast(1.06) saturate(1.03)";ctx.drawImage(source,0,0,out.width,out.height);ctx.filter="none";return sharpenCanvas(out,.16);
}
$("enhanceBtn").onclick=async()=>{
  if(!state.photoImg)return alert("Upload a photo first.");const status=$("photoAiStatus"),btn=$("enhanceBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Enhancing…";status.textContent="Upscaling and applying natural detail enhancement…";
  try{const src=document.createElement("canvas");src.width=state.photoImg.width;src.height=state.photoImg.height;src.getContext("2d").drawImage(state.photoImg,0,0);const out=enhancePhotoCanvas(src,2);state.photoImg=await canvasToImage(out);drawPhoto();initPhotoCrop();status.textContent=`Natural enhancement complete • ${out.width} × ${out.height}px`;addHistory("Photo Studio","Enhanced photo","2× natural upscale + sharpen");}
  catch(err){console.error(err);status.textContent="Enhancement failed.";alert("Enhancement failed. The original photo is unchanged.");}
  finally{btn.disabled=false;btn.textContent=old;}
};

$("toggleGuide").onclick=()=> $("faceGuide").classList.toggle("show");
$("downloadPhoto").onclick=()=>{if(!$("photoCanvas").width)return;downloadDataURL($("photoCanvas").toDataURL("image/png"),"passport-photo.png");};

$("makePassportSheet").onclick=()=>{
  if(!state.photoImg)return alert("Upload a photo first.");
  buildDuplicateSheet(state.photoImg,+$("passportCopies").value,$("passportPaper").value,+$("passportBorder").value);
  showSection("print");addHistory("Photo Studio","Created duplicate print layout");
};

function buildDuplicateSheet(img,count,paper,borderPx=2){
  const c=$("printCanvas"),ctx=c.getContext("2d"),dpi=300;
  if(paper==="a4"){c.width=mmToPx(210,dpi);c.height=mmToPx(297,dpi);}
  else {c.width=6*dpi;c.height=4*dpi;}
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
  ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);

  const template=$("passportTemplate")?.value||"auto";
  let photoW=null,photoH=null,cols=null,rows=null;
  if(paper==="6x4" && template!=="auto"){
    if(template==="8-35x45"){photoW=mmToPx(35,dpi);photoH=mmToPx(45,dpi);cols=4;rows=2;count=8;}
    if(template==="6-35x45"){photoW=mmToPx(35,dpi);photoH=mmToPx(45,dpi);cols=3;rows=2;count=6;}
    if(template==="8-40x50"){photoW=mmToPx(40,dpi);photoH=mmToPx(50,dpi);cols=4;rows=2;count=8;}
  }

  let gap=mmToPx(2,dpi),margin=mmToPx(3,dpi);
  if(!cols){
    cols=count<=4?2:(count===6?3:(count===9?3:4)); rows=Math.ceil(count/cols);
    photoW=(c.width-margin*2-gap*(cols-1))/cols;
    photoH=(c.height-margin*2-gap*(rows-1))/rows;
  }else{
    const totalW=photoW*cols+gap*(cols-1),totalH=photoH*rows+gap*(rows-1);
    margin=Math.max(mmToPx(1.5,dpi),Math.min((c.width-totalW)/2,(c.height-totalH)/2));
  }

  const gridW=photoW*cols+gap*(cols-1),gridH=photoH*rows+gap*(rows-1);
  const startX=(c.width-gridW)/2,startY=(c.height-gridH)/2;
  const cutLines=$("passportCutLines")?.value!=="no";

  for(let i=0;i<count;i++){
    const col=i%cols,row=Math.floor(i/cols),x=startX+col*(photoW+gap),y=startY+row*(photoH+gap);
    fitCover(ctx,img,x,y,photoW,photoH);
    if(borderPx>0){ctx.save();ctx.strokeStyle="#111";ctx.lineWidth=borderPx;ctx.strokeRect(x+.5,y+.5,photoW-1,photoH-1);ctx.restore();}
    if(cutLines){
      ctx.save();ctx.strokeStyle="#888";ctx.setLineDash([5,4]);ctx.lineWidth=1;
      ctx.strokeRect(x-2,y-2,photoW+4,photoH+4);ctx.restore();
    }
  }
  $("printEmpty").style.display="none";
}

// CARD / PDF MANUAL CROP
state.cardCrop={x:80,y:80,w:320,h:200};
let cropDrag=null;



function sharpenCanvas(canvas, amount=0.35){
  if(amount<=0) return canvas;
  const ctx=canvas.getContext("2d");
  const img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const src=new Uint8ClampedArray(img.data), d=img.data;
  const w=canvas.width,h=canvas.height;
  const a=Math.max(0,Math.min(1,amount));
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const p=(y*w+x)*4;
      for(let c=0;c<3;c++){
        const center=src[p+c];
        const up=src[((y-1)*w+x)*4+c],down=src[((y+1)*w+x)*4+c];
        const left=src[(y*w+x-1)*4+c],right=src[(y*w+x+1)*4+c];
        const sharp=center*(1+4*a)-(up+down+left+right)*a;
        d[p+c]=Math.max(0,Math.min(255,sharp));
      }
    }
  }
  ctx.putImageData(img,0,0);
  return canvas;
}
function normalizeRect(r,w,h){
  return {x:r.x/w,y:r.y/h,w:r.width/w,h:r.height/h};
}
function rectIoU(a,b){
  const ax2=a.x+a.w,ay2=a.y+a.h,bx2=b.x+b.w,by2=b.y+b.h;
  const ix=Math.max(0,Math.min(ax2,bx2)-Math.max(a.x,b.x));
  const iy=Math.max(0,Math.min(ay2,by2)-Math.max(a.y,b.y));
  const inter=ix*iy, union=a.w*a.h+b.w*b.h-inter;
  return union?inter/union:0;
}
function dedupeRects(rects,threshold=.45){
  const out=[];
  for(const r of rects){
    if(!out.some(o=>rectIoU(r,o)>threshold)) out.push(r);
  }
  return out;
}
function getCardRenderScale(){
  const v=parseFloat($("cardRenderQuality")?.value || "5");
  const dpi=parseFloat($("cardExportDpi")?.value || "600");
  // PDF.js uses 72 points/inch. Render PDFs close to the requested export DPI
  // so a 600-DPI PVC export is not created from a low-resolution preview.
  // Limit EDITOR rendering: 8.33x generates enormous canvases and freezes zoom.
  // Export DPI remains independent and unchanged.
  return Math.max(1.5, Math.min(3.5, v));
}
async function renderSourceToCanvas(canvas, source){
  const ctx=canvas.getContext("2d");
  canvas.width=source.width; canvas.height=source.height;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(source,0,0);
}
function getNormalizedCropRect(boxId, canvasId){
  const b=$(boxId).getBoundingClientRect(), c=$(canvasId).getBoundingClientRect();
  return {
    x:(b.left-c.left)/c.width,
    y:(b.top-c.top)/c.height,
    w:b.width/c.width,
    h:b.height/c.height
  };
}
function extractCropFromSourceCanvas(sourceCanvas, normRect){
  const sx=Math.max(0, Math.round(normRect.x*sourceCanvas.width));
  const sy=Math.max(0, Math.round(normRect.y*sourceCanvas.height));
  const sw=Math.max(1, Math.round(normRect.w*sourceCanvas.width));
  const sh=Math.max(1, Math.round(normRect.h*sourceCanvas.height));
  const out=document.createElement("canvas");
  out.width=sw; out.height=sh;
  const ctx=out.getContext("2d");
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}
function drawCanvasFittedToCanvas(dstCanvas, srcCanvas, dx, dy, dw, dh){
  const ctx=dstCanvas.getContext("2d");
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  fitCover(ctx, srcCanvas, dx, dy, dw, dh);
}
function downloadCanvas(canvas, filenameBase, format, quality=0.98){
  if(format==="image/png"){
    downloadDataURL(canvas.toDataURL("image/png"), `${filenameBase}.png`);
  }else{
    downloadDataURL(canvas.toDataURL("image/jpeg", quality), `${filenameBase}.jpg`);
  }
}
function getPdfJs(){
  return window.pdfjsLib || null;
}
async function ensurePdfJs(){
  if(window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
    s.type="module";
    s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
  }).catch(()=>{});
  return window.pdfjsLib;
}

async function loadPdfViaModule(file){
  const mod = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  mod.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  state.cardPdf = await mod.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  state.cardPdfPage=1;
  state.cardSourceType="pdf";
  await renderCardPdfPage();
}
async function renderCardPdfPage(){
  if(!state.cardPdf)return;
  const page=await state.cardPdf.getPage(state.cardPdfPage);
  const scale=getCardRenderScale();
  const viewport=page.getViewport({scale});
  state.cardSourceScale=scale;
  const c=$("cardSourceCanvas"),ctx=c.getContext("2d");
  c.width=Math.round(viewport.width); c.height=Math.round(viewport.height);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  await page.render({canvasContext:ctx,viewport}).promise;
  $("cardSourceEmpty").style.display="none";
  $("cardPageLabel").textContent=`Page ${state.cardPdfPage} of ${state.cardPdf.numPages} • render ${scale}×`;
  // Smart Card v19 controls sizing through its own fitted canvas viewport.
  // Smart Card v13 initializes one editable crop overlay when the page is rendered.
}
$("cardPdfInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;await loadPdfViaModule(f);addHistory("Smart Card","Opened PDF",f.name);};
$("cardImageInput").onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  const img=await fileToImage(f);
  state.cardSourceImg=img;
  state.cardSourceType="image";
  const c=$("cardSourceCanvas"),ctx=c.getContext("2d");
  c.width=img.width;c.height=img.height;
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(img,0,0);
  $("cardSourceEmpty").style.display="none";
  $("cardPageLabel").textContent=`${f.name} • ${img.width}×${img.height}`;
  // Smart Card v19 controls sizing through its own fitted canvas viewport.
  // Smart Card v13 selects its own single crop mode after upload.
};

// --- Smart Card / PVC precision perspective engine v10.2 ---
function cardOrderPoints(points){
  const pts=points.map(p=>({x:p.x,y:p.y}));
  const sums=pts.map(p=>p.x+p.y), diffs=pts.map(p=>p.x-p.y);
  const tl=pts[sums.indexOf(Math.min(...sums))];
  const br=pts[sums.indexOf(Math.max(...sums))];
  const tr=pts[diffs.indexOf(Math.max(...diffs))];
  const bl=pts[diffs.indexOf(Math.min(...diffs))];
  return [tl,tr,br,bl];
}
function cardDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function cardDefaultPoints(canvas){
  const ratio=85.6/54;
  const w=canvas.width*.78;
  const h=w/ratio;
  const hh=Math.min(h,canvas.height*.78);
  const ww=hh*ratio;
  const x=(canvas.width-ww)/2,y=(canvas.height-hh)/2;
  return [{x:x/canvas.width,y:y/canvas.height},{x:(x+ww)/canvas.width,y:y/canvas.height},{x:(x+ww)/canvas.width,y:(y+hh)/canvas.height},{x:x/canvas.width,y:(y+hh)/canvas.height}];
}
function syncCardPerspectiveLayer(){
  const canvas=$("cardSourceCanvas"),stage=$("cardPerspectiveStage"),layer=$("cardPerspectiveLayer");
  if(!canvas||!stage||!layer||!canvas.width)return;
  const cr=canvas.getBoundingClientRect(),sr=stage.getBoundingClientRect();
  layer.style.left=(cr.left-sr.left)+"px";
  layer.style.top=(cr.top-sr.top)+"px";
  layer.style.width=cr.width+"px";
  layer.style.height=cr.height+"px";
}
function renderCardPerspectiveOverlay(){
  const layer=$("cardPerspectiveLayer"),poly=$("cardPerspectivePolygon"),canvas=$("cardSourceCanvas");
  if(!layer||!poly||!canvas?.width)return;
  syncCardPerspectiveLayer();
  layer.style.display=state.cardPerspectiveMode?"block":"none";
  if(!state.cardPerspectiveMode||!state.cardPerspectivePts)return;
  poly.setAttribute("points",state.cardPerspectivePts.map(p=>`${p.x*100},${p.y*100}`).join(" "));
  qsa("#cardPerspectiveLayer .card-point").forEach((el,i)=>{
    el.style.left=(state.cardPerspectivePts[i].x*100)+"%";
    el.style.top=(state.cardPerspectivePts[i].y*100)+"%";
  });
}
function enableCardPerspective(){
  const c=$("cardSourceCanvas");
  if(!c?.width)return alert("Open a PDF or image first.");
  state.cardPerspectivePts=cardDefaultPoints(c);
  state.cardPerspectiveMode=true;
  renderCardPerspectiveOverlay();
}
function setCardPerspectivePointsFromPixels(points,canvas){
  state.cardPerspectivePts=cardOrderPoints(points).map(p=>({x:p.x/canvas.width,y:p.y/canvas.height}));
  state.cardPerspectiveMode=true;
  renderCardPerspectiveOverlay();
}
function cardCandidateScore(pts,area,imageArea,canvasW,canvasH){
  const [tl,tr,br,bl]=cardOrderPoints(pts);
  const w=(cardDistance(tl,tr)+cardDistance(bl,br))/2;
  const h=(cardDistance(tl,bl)+cardDistance(tr,br))/2;
  if(!w||!h)return -Infinity;
  const ratio=Math.max(w,h)/Math.max(1,Math.min(w,h));
  const target=85.6/54;
  const ratioErr=Math.abs(ratio-target)/target;
  const sideBalance=Math.min(w,h)/Math.max(w,h);
  const areaRatio=area/imageArea;
  // A common failure is detecting a red/black text box inside an Aadhaar/PAN page.
  // A real card/document boundary normally touches or approaches the photo edge.
  const nearBorder=pts.filter(p=>p.x<canvasW*.08||p.y<canvasH*.08||p.x>canvasW*.92||p.y>canvasH*.92).length;
  const boundaryBonus=nearBorder>=2?2.8:0;
  const innerPenalty=(nearBorder<2 && areaRatio<.58)?Math.min(5.5,(.58-areaRatio)*9):0;
  const sizeBonus=Math.min(2.4,areaRatio*4.5);
  return 3.8-ratioErr*3.0+sideBalance*.9+sizeBonus+boundaryBonus-innerPenalty;
}
function detectCardByLongLines(sourceCanvas,maxResults=5){
  const maxDim=1800,scale=Math.min(1,maxDim/Math.max(sourceCanvas.width,sourceCanvas.height));
  const dc=document.createElement("canvas");dc.width=Math.max(1,Math.round(sourceCanvas.width*scale));dc.height=Math.max(1,Math.round(sourceCanvas.height*scale));
  const ctx=dc.getContext("2d");ctx.drawImage(sourceCanvas,0,0,dc.width,dc.height);
  const src=cv.imread(dc),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat();
  const lines=new cv.MatVector();
  try{
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);cv.Canny(blur,35,125,edges);
    const raw=new cv.Mat();cv.HoughLinesP(edges,raw,1,Math.PI/180,Math.max(80,Math.round(Math.min(dc.width,dc.height)*.12)),Math.max(250,Math.round(Math.max(dc.width,dc.height)*.45)),25);
    const v=[],h=[];
    for(let i=0;i<raw.rows;i++){
      const q=raw.intPtr(i,0),x1=q[0],y1=q[1],x2=q[2],y2=q[3],dx=Math.abs(x2-x1),dy=Math.abs(y2-y1);
      if(dy>dx*4){const x=(x1+x2)/2,len=dy;v.push({x,len,span:len/dc.height});}
      else if(dx>dy*4){const y=(y1+y2)/2,len=dx;h.push({y,len,span:len/dc.width});}
    }
    const cluster=(arr,key,limit)=>{
      const out=[];for(const item of arr.sort((a,b)=>b.span-a.span)){const hit=out.find(o=>Math.abs(o[key]-item[key])<limit);if(hit){hit[key]=(hit[key]*hit.n+item[key])/(hit.n+1);hit.span=Math.max(hit.span,item.span);hit.n++;}else out.push({...item,n:1});}return out.slice(0,24);
    };
    const xs=cluster(v,"x",Math.max(10,dc.width*.008)).map(x=>({...x,pos:x.x}));
    const ys=cluster(h,"y",Math.max(10,dc.height*.008)).map(y=>({...y,pos:y.y}));
    xs.push({pos:0,span:1,border:true},{pos:dc.width-1,span:1,border:true});
    ys.push({pos:0,span:1,border:true},{pos:dc.height-1,span:1,border:true});
    const target=85.6/54,cands=[];
    for(const a of xs)for(const b of xs)if(b.pos-a.pos>dc.width*.3){
      for(const c of ys)for(const d of ys)if(d.pos-c.pos>dc.height*.3){
        const w=b.pos-a.pos,h=d.pos-c.pos,r=w/h,ratio=Math.max(r,1/r),err=Math.abs(ratio-target)/target;
        if(err>.12)continue;
        const area=(w*h)/(dc.width*dc.height);
        const borders=(a.border?1:0)+(b.border?1:0)+(c.border?1:0)+(d.border?1:0);
        const boundarySpan=(a.span+b.span+c.span+d.span)/4;
        const coverageScore=Math.max(0,1-Math.abs(area-.82)/.32); const score=(1-Math.min(1,err))*6+area*2.0+coverageScore*2.5+boundarySpan*5-(borders>=4?4:0);
        cands.push({score,points:[{x:a.pos/scale,y:c.pos/scale},{x:b.pos/scale,y:c.pos/scale},{x:b.pos/scale,y:d.pos/scale},{x:a.pos/scale,y:d.pos/scale}]});
      }
    }
    cands.sort((a,b)=>b.score-a.score);
    const out=[];
    const iou=(a,b)=>{const ax=Math.min(...a.points.map(p=>p.x)),ay=Math.min(...a.points.map(p=>p.y)),aw=Math.max(...a.points.map(p=>p.x))-ax,ah=Math.max(...a.points.map(p=>p.y))-ay,bx=Math.min(...b.points.map(p=>p.x)),by=Math.min(...b.points.map(p=>p.y)),bw=Math.max(...b.points.map(p=>p.x))-bx,bh=Math.max(...b.points.map(p=>p.y))-by,ix=Math.max(0,Math.min(ax+aw,bx+bw)-Math.max(ax,bx)),iy=Math.max(0,Math.min(ay+ah,by+bh)-Math.max(ay,by)),inter=ix*iy,uni=aw*ah+bw*bh-inter;return uni?inter/uni:0};
    for(const q of cands){if(out.every(o=>iou(q,o)<.55))out.push(q);if(out.length>=maxResults)break;}
    raw.delete();return out;
  }finally{[src,gray,blur,edges].forEach(m=>m.delete());lines.delete();}
}

async function detectCardQuadrilaterals(sourceCanvas,maxResults=10){
  if(typeof cv==="undefined"||!cv.Mat)throw new Error("OpenCV is still loading. Please wait a moment.");
  const maxDim=1800,scale=Math.min(1,maxDim/Math.max(sourceCanvas.width,sourceCanvas.height));
  const dc=document.createElement("canvas");dc.width=Math.max(1,Math.round(sourceCanvas.width*scale));dc.height=Math.max(1,Math.round(sourceCanvas.height*scale));
  const dctx=dc.getContext("2d");dctx.imageSmoothingEnabled=true;dctx.imageSmoothingQuality="high";dctx.drawImage(sourceCanvas,0,0,dc.width,dc.height);
  const src=cv.imread(dc),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat();
  const candidates=[];
  try{
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);cv.Canny(blur,35,125,3,false);
    const kernel=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));cv.morphologyEx(edges,edges,cv.MORPH_CLOSE,kernel);kernel.delete();
    cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    const imageArea=dc.width*dc.height;
    for(let i=0;i<contours.size();i++){
      const cnt=contours.get(i),peri=cv.arcLength(cnt,true),approx=new cv.Mat();cv.approxPolyDP(cnt,approx,Math.max(2,0.018*peri),true);
      if(approx.rows===4){
        const area=Math.abs(cv.contourArea(approx)),ratio=area/imageArea;
        if(ratio>.025&&ratio<.96&&cv.isContourConvex(approx)){
          const pts=[];for(let j=0;j<4;j++){const q=approx.intPtr(j,0);pts.push({x:q[0],y:q[1]});}
          const score=cardCandidateScore(pts,area,imageArea,dc.width,dc.height);
          if(Number.isFinite(score))candidates.push({points:cardOrderPoints(pts).map(p=>({x:p.x/scale,y:p.y/scale})),score});
        }
      }
      approx.delete();cnt.delete();
    }
    candidates.sort((a,b)=>b.score-a.score);
    const out=[];
    for(const cand of candidates){
      const bb=(pts)=>{const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}};
      const a=bb(cand.points);
      if(out.every(o=>{const b=bb(o.points);const ix=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));const iy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));const inter=ix*iy,uni=a.w*a.h+b.w*b.h-inter;return !uni||inter/uni<.55;}))out.push(cand);
      if(out.length>=maxResults)break;
    }
    return out;
  }finally{[src,gray,blur,edges,hierarchy].forEach(m=>m.delete());contours.delete();}
}
async function perspectiveCardCanvas(sourceCanvas,pts,dpi=600){
  if(typeof cv==="undefined"||!cv.Mat)throw new Error("OpenCV is still loading. Please wait a moment.");
  const ordered=cardOrderPoints(pts.map(p=>({x:p.x*sourceCanvas.width,y:p.y*sourceCanvas.height})));
  const outW=mmToPx(85.6,dpi),outH=mmToPx(54,dpi);
  const src=cv.imread(sourceCanvas),srcPts=cv.matFromArray(4,1,cv.CV_32FC2,ordered.flatMap(p=>[p.x,p.y])),dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,outW-1,0,outW-1,outH-1,0,outH-1]),M=cv.getPerspectiveTransform(srcPts,dstPts),dst=new cv.Mat();
  cv.warpPerspective(src,dst,M,new cv.Size(outW,outH),cv.INTER_LANCZOS4,cv.BORDER_REPLICATE,new cv.Scalar());
  const out=document.createElement("canvas");out.width=outW;out.height=outH;cv.imshow(out,dst);
  [src,srcPts,dstPts,M,dst].forEach(m=>m.delete());
  return out;
}
function previewCardCanvas(canvasId,crop){
  const p=$(canvasId);if(!p||!crop)return;
  const maxW=620,maxH=260,s=Math.min(maxW/crop.width,maxH/crop.height,1);
  p.width=Math.max(1,Math.round(crop.width*s));p.height=Math.max(1,Math.round(crop.height*s));
  const ctx=p.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.clearRect(0,0,p.width,p.height);ctx.drawImage(crop,0,0,p.width,p.height);
}
async function saveActiveCardPerspective(){
  if(!$('cardSourceCanvas').width)return alert("Open a PDF or image first.");
  if(!state.cardPerspectiveMode||!state.cardPerspectivePts)return alert("Choose 4-Point Perspective first.");
  const dpi=+$('cardExportDpi').value||600;
  const crop=await perspectiveCardCanvas($('cardSourceCanvas'),state.cardPerspectivePts,dpi);
  const action=$('cardCropAction').value;
  if(action==="front")state.cardFrontCrop=crop;else state.cardBackCrop=crop;
  previewCardCanvas(action==="front"?"cardFrontPreview":"cardBackPreview",crop);
  state.cardPerspectiveMode=false;renderCardPerspectiveOverlay();
  addHistory("Smart Card",`Saved ${action} • exact PVC`,`85.6×54 mm • ${dpi} DPI • ${crop.width}×${crop.height}px`);
}

$("autoDetectCardBtn").onclick=async()=>{
  const c=$("cardSourceCanvas");if(!c.width)return alert("Open a PDF page or image first.");
  const btn=$("autoDetectCardBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Detecting 4 corners…";
  try{
    let found=await detectCardQuadrilaterals(c,5);
    if(!found.length) found=detectCardByLongLines(c,5);
    if(!found.length)throw new Error("No reliable card boundary found. Use 4-Point Perspective.");
    setCardPerspectivePointsFromPixels(found[0].points,c);
    addHistory("Smart Card","Auto detected 4 corners",`${$("cardType").value} • confidence ${Math.round(Math.max(0,Math.min(1,(found[0].score+1)/5))*100)}%`);
  }catch(err){console.error(err);alert(err.message||"Card auto-detection failed.");}
  finally{btn.disabled=false;btn.textContent=old;}
};

$("manualCardPerspectiveBtn").onclick=enableCardPerspective;
$("resetCardCrop").onclick=enableCardPerspective;
// Smart Card v19 zoom input is managed by smart-card-patch.js.
window.addEventListener("resize",()=>{if(state.cardPerspectiveMode)renderCardPerspectiveOverlay();});
let cardPointDrag=null;
qsa("#cardPerspectiveLayer .card-point").forEach(pt=>{
  pt.addEventListener("pointerdown",e=>{if(!state.cardPerspectiveMode)return;e.preventDefault();pt.setPointerCapture(e.pointerId);cardPointDrag={idx:+pt.dataset.point};});
  pt.addEventListener("pointermove",e=>{if(!cardPointDrag)return;const cr=$("cardSourceCanvas").getBoundingClientRect();state.cardPerspectivePts[cardPointDrag.idx]={x:Math.max(0,Math.min(1,(e.clientX-cr.left)/cr.width)),y:Math.max(0,Math.min(1,(e.clientY-cr.top)/cr.height))};renderCardPerspectiveOverlay();});
  pt.addEventListener("pointerup",()=>cardPointDrag=null);pt.addEventListener("pointercancel",()=>cardPointDrag=null);
});

$("saveCardCrop").onclick=saveActiveCardPerspective;
qsa("#cardSideTabs button").forEach(b=>b.addEventListener("click",()=>{qsa("#cardSideTabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("cardCropAction").value=b.dataset.side;}));
$("cardCropAction").addEventListener("change",e=>{qsa("#cardSideTabs button").forEach(x=>x.classList.toggle("active",x.dataset.side===e.target.value));});
$("exportCardCropImage").onclick=async()=>{
  if(!$('cardSourceCanvas').width)return alert("Open a PDF or image first.");
  try{
    const dpi=+$('cardExportDpi').value||600;
    let crop;
    if(state.cardPerspectiveMode&&state.cardPerspectivePts) crop=await perspectiveCardCanvas($('cardSourceCanvas'),state.cardPerspectivePts,dpi);
    else {
      const action=$("cardCropAction").value;crop=action==="front"?state.cardFrontCrop:state.cardBackCrop;
      if(!crop)throw new Error("Set the four corners and apply the Front/Back crop first.");
    }
    const fmt=$("cardOutputFormat").value||"image/png";
    downloadCanvas(crop,`pvc-${$("cardCropAction").value}-${dpi}dpi`,fmt,1);
    addHistory("Smart Card","Exported exact PVC crop",`85.6×54 mm • ${dpi} DPI • ${crop.width}×${crop.height}px`);
  }catch(err){alert(err.message||"PVC export failed.");}
};

$("autoSplitCardsBtn").onclick=async()=>{
  const c=$("cardSourceCanvas");if(!c.width)return alert("Open a PDF page or image first.");
  const btn=$("autoSplitCardsBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Finding cards…";
  try{
    let found=await detectCardQuadrilaterals(c,10);if(found.length<1) found=detectCardByLongLines(c,10);if(!found.length)throw new Error("No reliable card boundaries found.");
    state.detectedCards=found.map(x=>({points:x.points,score:x.score}));
    const grid=$("detectedCardsGrid"),panel=$("detectedCardsPanel");grid.innerHTML="";panel.hidden=false;
    found.forEach((item,i)=>{
      const crop=perspectiveCardCanvas(c,item.points.map(p=>({x:p.x/c.width,y:p.y/c.height})),+$('cardExportDpi').value||600);
      const wrap=document.createElement("div");wrap.className="detected-card";
      const cvw=document.createElement("canvas");wrap.appendChild(cvw);previewCardCanvasTo(cvw,crop);
      const actions=document.createElement("div");actions.className="detected-card-actions";
      const front=document.createElement("button");front.className="mini-btn";front.textContent="Set Front";
      const back=document.createElement("button");back.className="mini-btn";back.textContent="Set Back";
      const exp=document.createElement("button");exp.className="mini-btn";exp.textContent="Export PVC";
      front.onclick=()=>{state.cardFrontCrop=crop;previewCardCanvas("cardFrontPreview",crop);};
      back.onclick=()=>{state.cardBackCrop=crop;previewCardCanvas("cardBackPreview",crop);};
      exp.onclick=()=>downloadCanvas(crop,`pvc-detected-${i+1}-${$('cardExportDpi').value}dpi`,$('cardOutputFormat').value||"image/png",1);
      actions.append(front,back,exp);wrap.appendChild(actions);grid.appendChild(wrap);
    });
    if(found.length>=2){state.cardFrontCrop=await perspectiveCardCanvas(c,found[0].points.map(p=>({x:p.x/c.width,y:p.y/c.height})),$('cardExportDpi').value||600);state.cardBackCrop=await perspectiveCardCanvas(c,found[1].points.map(p=>({x:p.x/c.width,y:p.y/c.height})),$('cardExportDpi').value||600);previewCardCanvas("cardFrontPreview",state.cardFrontCrop);previewCardCanvas("cardBackPreview",state.cardBackCrop);}
    addHistory("Smart Card","Auto found front/back candidates",`${found.length} quadrilateral(s)`);
  }catch(err){console.error(err);alert(err.message||"Auto split failed.");}
  finally{btn.disabled=false;btn.textContent=old;}
};
function previewCardCanvasTo(canvas,crop){const maxW=420,maxH=180,s=Math.min(maxW/crop.width,maxH/crop.height,1);canvas.width=Math.max(1,Math.round(crop.width*s));canvas.height=Math.max(1,Math.round(crop.height*s));const ctx=canvas.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(crop,0,0,canvas.width,canvas.height);}
$("clearDetectedCards").onclick=()=>{$("detectedCardsPanel").hidden=true;$("detectedCardsGrid").innerHTML="";state.detectedCards=[];};

$("bulkExportCardsBtn").onclick=async()=>{
  if(!state.detectedCards.length)return alert("Run Find Front + Back first.");
  const dpi=+$('cardExportDpi').value||600,fmt=$('cardOutputFormat').value||"image/png";
  for(let i=0;i<state.detectedCards.length;i++){
    const crop=await perspectiveCardCanvas($('cardSourceCanvas'),state.detectedCards[i].points.map(p=>({x:p.x/$('cardSourceCanvas').width,y:p.y/$('cardSourceCanvas').height})),dpi);
    downloadCanvas(crop,`pvc-card-${i+1}-${dpi}dpi`,fmt,1);
    await new Promise(r=>setTimeout(r,60));
  }
  addHistory("Smart Card","Bulk exported exact PVC cards",`${state.detectedCards.length} card(s) • ${dpi} DPI`);
};

$("prevCardPage").onclick=async()=>{if(state.cardPdf&&state.cardPdfPage>1){state.cardPdfPage--;await renderCardPdfPage();}};
$("nextCardPage").onclick=async()=>{if(state.cardPdf&&state.cardPdfPage<state.cardPdf.numPages){state.cardPdfPage++;await renderCardPdfPage();}};

$("cardAspect").onchange=()=>{ if(state.cardPerspectiveMode) enableCardPerspective(); };

// RESIZE
$("resizeInput").onchange=async e=>{const f=e.target.files[0];if(!f)return;state.resizeImg=await fileToImage(f);drawResizePreview();};
const presets={
  passport:{w:35,h:45,u:"mm",dpi:300}, "ssc-photo":{w:3.5,h:4.5,u:"cm",dpi:300},
  "railway-photo":{w:35,h:45,u:"mm",dpi:200}, signature:{w:6,h:2,u:"cm",dpi:200}
};
$("jobPreset").onchange=()=>{const p=presets[$("jobPreset").value];if(!p)return;$("resizeW").value=p.w;$("resizeH").value=p.h;$("resizeUnit").value=p.u;$("resizeDpi").value=p.dpi;drawResizePreview();};
function drawResizePreview(signatureClean=false){
  if(!state.resizeImg)return; $("resizeEmpty").style.display="none";
  const w=unitToPx($("resizeW").value,$("resizeUnit").value,$("resizeDpi").value),h=unitToPx($("resizeH").value,$("resizeUnit").value,$("resizeDpi").value);
  const c=$("resizeCanvas"),ctx=c.getContext("2d");c.width=w;c.height=h;ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);fitCover(ctx,state.resizeImg,0,0,w,h);
  if(signatureClean){
    const d=ctx.getImageData(0,0,w,h),p=d.data;
    for(let i=0;i<p.length;i+=4){const g=.299*p[i]+.587*p[i+1]+.114*p[i+2];const v=g>210?255:(g<120?0:g);p[i]=p[i+1]=p[i+2]=v;}ctx.putImageData(d,0,0);
  }
}
$("signatureCleanBtn").onclick=()=>drawResizePreview(true);
$("processResize").onclick=async()=>{
  if(!state.resizeImg)return alert("Upload an image.");
  drawResizePreview($("jobPreset").value==="signature");
  const target=+$("resizeTargetKb").value;
  if(target){const blob=await compressCanvasToTarget($("resizeCanvas"),target,"image/jpeg");downloadBlob(blob,"job-image.jpg");}
  else downloadDataURL($("resizeCanvas").toDataURL("image/jpeg",.95),"job-image.jpg");
  addHistory("Photo & Signature","Resized image",`${ $("resizeW").value }×${ $("resizeH").value } ${ $("resizeUnit").value }`);
};

// COMPRESSOR
$("compressInput").onchange=e=>{state.compressFile=e.target.files[0]||null;$("compressStatus").textContent=state.compressFile?`Selected: ${state.compressFile.name} • ${(state.compressFile.size/1024).toFixed(1)} KB`:"Ready.";};
async function compressCanvasToTarget(canvas,targetKb,type="image/jpeg"){
  const target=targetKb*1024; let lo=.08,hi=.98,best=null;
  for(let i=0;i<12;i++){const q=(lo+hi)/2;const b=await canvasToBlob(canvas,type,q);if(b.size>target)hi=q;else{best=b;lo=q;}}
  return best || await canvasToBlob(canvas,type,.08);
}
$("compressBtn").onclick=async()=>{
  if(!state.compressFile)return alert("Upload an image.");
  const img=await fileToImage(state.compressFile); let w=img.width,h=img.height,maxW=+$("compressMaxW").value;
  if(maxW&&w>maxW){h=Math.round(h*maxW/w);w=maxW;}
  const c=document.createElement("canvas"),ctx=c.getContext("2d");c.width=w;c.height=h;ctx.drawImage(img,0,0,w,h);
  const target=+$("targetKb").value||50,type=$("compressFormat").value; const blob=await compressCanvasToTarget(c,target,type);
  $("compressStatus").textContent=`Output: ${(blob.size/1024).toFixed(1)} KB • ${w}×${h}px`;
  downloadBlob(blob,type==="image/webp"?"compressed.webp":"compressed.jpg");addHistory("Compressor","Compressed image",`${(blob.size/1024).toFixed(1)} KB`);
};

// PRINT
$("printInput").onchange=async e=>{state.printImages=[];for(const f of [...e.target.files])state.printImages.push(await fileToImage(f)); if(state.printImages.length)$("printEmpty").style.display="none";};
$("buildPrintSheet").onclick=()=>{
  if(!state.printImages.length)return alert("Upload images.");
  const c=$("printCanvas"),ctx=c.getContext("2d"),dpi=300,paper=$("printPaper").value,ori=$("printOrientation").value;
  let w,h;if(paper==="a4"){w=mmToPx(210,dpi);h=mmToPx(297,dpi);}else{w=6*dpi;h=4*dpi;}if(ori==="landscape"&&h>w)[w,h]=[h,w];if(ori==="portrait"&&w>h)[w,h]=[h,w];
  c.width=w;c.height=h;ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);
  const count=+$("printCount").value,cols=count===4?2:count===6?3:count===9?3:4,rows=Math.ceil(count/cols),gap=mmToPx(3,dpi),m=mmToPx(+$("printMargin").value||4,dpi);
  const cw=(w-2*m-gap*(cols-1))/cols,ch=(h-2*m-gap*(rows-1))/rows;
  for(let i=0;i<count;i++){const img=state.printImages[i%state.printImages.length],col=i%cols,row=Math.floor(i/cols);fitCover(ctx,img,m+col*(cw+gap),m+row*(ch+gap),cw,ch);}
  addHistory("Print Studio","Built collage",`${count} images • ${paper}`);
};
$("downloadPrintSheet").onclick=()=>{if(!$("printCanvas").width)return;downloadDataURL($("printCanvas").toDataURL("image/jpeg",.95),"print-sheet.jpg");};
$("browserPrint").onclick=()=>{const url=$("printCanvas").toDataURL("image/png");const w=window.open("");w.document.write(`<img src="${url}" style="max-width:100%;width:100%"><script>onload=()=>print()<\/script>`);};

// PDF
function downloadBytes(bytes,name,type){downloadBlob(new Blob([bytes],{type}),name)}
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=shopAutoFilename(name);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
$("mergePdfBtn").onclick=async()=>{
  const files=[...$("mergePdfInput").files];if(!files.length)return alert("Select PDFs.");
  const out=await PDFLib.PDFDocument.create();
  for(const f of files){const src=await PDFLib.PDFDocument.load(await f.arrayBuffer());const pages=await out.copyPages(src,src.getPageIndices());pages.forEach(p=>out.addPage(p));}
  downloadBytes(await out.save(),"merged.pdf","application/pdf");addHistory("PDF Tools","Merged PDFs",`${files.length} files`);
};
$("imagesToPdfBtn").onclick=async()=>{
  const files=[...$("imagesPdfInput").files];if(!files.length)return alert("Select images.");
  const pdf=await PDFLib.PDFDocument.create();
  for(const f of files){
    const ab=await f.arrayBuffer();let im;if(f.type==="image/png")im=await pdf.embedPng(ab);else im=await pdf.embedJpg(ab);
    const p=pdf.addPage([im.width,im.height]);p.drawImage(im,{x:0,y:0,width:im.width,height:im.height});
  }
  downloadBytes(await pdf.save(),"images.pdf","application/pdf");addHistory("PDF Tools","Images to PDF",`${files.length} images`);
};


function parsePageSpec(spec,max){
  const out=[]; for(const part of spec.split(",").map(s=>s.trim()).filter(Boolean)){
    if(part.includes("-")){let [a,b]=part.split("-").map(Number);if(a>b)[a,b]=[b,a];for(let i=a;i<=b;i++)if(i>=1&&i<=max)out.push(i-1);}
    else{const n=Number(part);if(n>=1&&n<=max)out.push(n-1);}
  } return [...new Set(out)];
}
$("splitPdfBtn").onclick=async()=>{
  const f=$("splitPdfInput").files[0]; if(!f)return alert("Select a PDF.");
  const src=await PDFLib.PDFDocument.load(await f.arrayBuffer()), idx=parsePageSpec($("splitRange").value,src.getPageCount());
  if(!idx.length)return alert("Enter a valid page range.");
  const out=await PDFLib.PDFDocument.create(),pages=await out.copyPages(src,idx);pages.forEach(p=>out.addPage(p));
  downloadBytes(await out.save(),"extracted-pages.pdf","application/pdf");addHistory("PDF Tools","Split/extracted PDF",`${idx.length} pages`);
};
$("rotatePdfBtn").onclick=async()=>{
  const f=$("rotatePdfInput").files[0]; if(!f)return alert("Select a PDF.");
  const pdf=await PDFLib.PDFDocument.load(await f.arrayBuffer()),deg=+$("pdfRotateAngle").value;
  pdf.getPages().forEach(p=>p.setRotation(PDFLib.degrees((p.getRotation().angle+deg)%360)));
  downloadBytes(await pdf.save(),"rotated.pdf","application/pdf");addHistory("PDF Tools","Rotated PDF",`${deg}°`);
};
$("reorderPdfBtn").onclick=async()=>{
  const f=$("reorderPdfInput").files[0]; if(!f)return alert("Select a PDF.");
  const src=await PDFLib.PDFDocument.load(await f.arrayBuffer());
  const idx=$("reorderSequence").value.split(",").map(x=>Number(x.trim())-1).filter(i=>i>=0&&i<src.getPageCount());
  if(!idx.length)return alert("Enter a valid sequence.");
  const out=await PDFLib.PDFDocument.create(),pages=await out.copyPages(src,idx);pages.forEach(p=>out.addPage(p));
  downloadBytes(await out.save(),"reordered.pdf","application/pdf");addHistory("PDF Tools","Reordered PDF",`${idx.length} pages`);
};
$("pdfToImageBtn").onclick=async()=>{
  const f=$("pdfToImageInput").files[0]; if(!f)return alert("Select a PDF.");
  const mod=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs");
  mod.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
  const pdf=await mod.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),vp=page.getViewport({scale:2});
    const c=document.createElement("canvas"),ctx=c.getContext("2d");c.width=vp.width;c.height=vp.height;
    await page.render({canvasContext:ctx,viewport:vp}).promise;
    await new Promise(r=>setTimeout(r,120));
    downloadDataURL(c.toDataURL("image/jpeg",.92),`page-${String(i).padStart(2,"0")}.jpg`);
  }
  addHistory("PDF Tools","PDF to images",`${pdf.numPages} pages`);
};

// OCR
$("ocrInput").onchange=e=>{state.ocrFile=e.target.files[0]||null;};
$("ocrBtn").onclick=async()=>{
  if(!state.ocrFile)return alert("Upload an image.");
  $("ocrStatus").textContent="Recognizing text...";
  try{
    const r=await Tesseract.recognize(state.ocrFile,"eng",{logger:m=>{if(m.progress)$("ocrStatus").textContent=`${m.status} • ${Math.round(m.progress*100)}%`; }});
    $("ocrText").value=r.data.text;$("ocrStatus").textContent="Done.";addHistory("OCR","Extracted text",state.ocrFile.name);
  }catch(e){$("ocrStatus").textContent="OCR failed. Check internet the first time Tesseract language data loads.";}
};
$("copyOcr").onclick=()=>navigator.clipboard.writeText($("ocrText").value||"");

// HISTORY
$("clearHistory").onclick=()=>{if(confirm("Delete all local recent-job history?")){localStorage.removeItem("shopstudio_history");renderHistory();}};
renderHistory();

// PWA install
let deferredPrompt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("installBtn").hidden=false;});
$("installBtn").onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$("installBtn").hidden=true;};


window.addEventListener("resize",()=>{ try{ renderScanPerspectiveOverlay(); }catch(e){} });

window.addEventListener("load",()=>{
  if($("cardExportDpi")) $("cardExportDpi").value="600";
  if($("cardRenderQuality")) $("cardRenderQuality").value="5";
  if($("cardOutputFormat")) $("cardOutputFormat").value="image/png";
});

/* SHOP STUDIO PRO v10.3 — precision workflow overrides */
(function(){
  const v3 = window.ShopStudioV103 = {};
  const el = id => document.getElementById(id);
  const clamp = (v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const setStatus = (id,msg)=>{ const n=el(id); if(n)n.textContent=msg; };
  const hide = id => { const n=el(id); if(n)n.style.display="none"; };
  const show = id => { const n=el(id); if(n)n.style.display="block"; };
  const canvasClone = src => { const c=document.createElement("canvas"); c.width=src.width;c.height=src.height;c.getContext("2d").drawImage(src,0,0);return c; };
  const imageFromCanvas = c => canvasToImage(c);

  // ---------- QUALITY HELPERS ----------
  function drawHighQuality(ctx,img,x,y,w,h){
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.drawImage(img,x,y,w,h);
  }
  function exportPNG(canvas,name){
    if(!canvas||!canvas.width)return;
    canvas.toBlob(blob=>downloadBlob(blob,`${name}.png`),"image/png");
  }

  // ---------- CLEAR WORKSPACES ----------
  function clearScanner(){
    state.scanImg=null;state.scanPages=[];state.scanCurrentIndex=0;state.scanCropMode=false;state.scanCropPts=null;
    if(el("scanPages"))el("scanPages").innerHTML="";
    const c=el("scanCanvas");if(c){c.width=1;c.height=1;}
    show("scanEmpty");renderScanPerspectiveOverlay();setStatus("scanStatus","Workspace cleared • no pages loaded.");
  }
  function clearPhoto(){
    state.photoImg=null;state.photoOriginal=null;state.bulkPhotos=[];state.photoCrop=null;
    const c=el("photoCanvas");if(c){c.width=1;c.height=1;}
    hide("photoCropBox");show("photoEmpty");setStatus("photoAiStatus","Workspace cleared • no photos loaded.");
  }
  function clearCards(){
    state.cardFrontCrop=null;state.cardBackCrop=null;state.detectedCards=[];state.cardPerspectivePts=null;state.cardPerspectiveMode=false;
    state.cardSourceImg=null;state.cardSourceOriginal=null;state.cardPdf=null;state.cardPdfPage=1;
    const c=el("cardSourceCanvas");if(c){c.width=1;c.height=1;}
    ["cardFrontPreview","cardBackPreview","cardCanvas"].forEach(id=>{const x=el(id);if(x){x.width=1;x.height=1;}});
    hide("detectedCardsPanel");if(el("detectedCardsGrid"))el("detectedCardsGrid").innerHTML="";
    hide("cardPerspectiveLayer");hide("cardFreeCropLayer");show("cardSourceEmpty");show("cardEmpty");
    if(el("cardPageLabel"))el("cardPageLabel").textContent="No file";
    state.cardSheetLayout=[];hide("cardSheetEditor");setStatus("cardStatus","Workspace cleared • no cards loaded.");
  }
  function clearPrint(){
    state.printImages=[];state.printLayout=[];
    const c=el("printCanvas");if(c){c.width=1;c.height=1;}
    hide("printEditor");show("printEmpty");setStatus("printStatus","Workspace cleared • no images loaded.");
  }
  function addClearButton(parentId,id,handler){
    const p=el(parentId);if(!p||el(id))return;
    const b=document.createElement("button");b.id=id;b.className="ghost-btn compact-clear";b.textContent="Clear";b.title="Clear all images in this workspace";b.onclick=handler;p.appendChild(b);
  }
  addClearButton("scanner","clearScannerBtn",clearScanner);
  addClearButton("photo","clearPhotoBtn",clearPhoto);
  addClearButton("cards","clearCardsBtn",clearCards);
  addClearButton("print","clearPrintBtn",clearPrint);

  // ---------- PASSPORT PRINT SPACING ----------
  function addPassportSpacingControls(){
    const group=qsa("#photo .control-group").find(x=>/Print/i.test(x.querySelector("h4")?.textContent||""));
    if(!group||el("passportMargin")||el("passportGap"))return;
    const frag=document.createDocumentFragment();
    const lm=document.createElement("label");lm.innerHTML='Outer Margin (mm)<input id="passportMargin" type="number" min="1" max="20" step="0.5" value="8">';
    const lg=document.createElement("label");lg.innerHTML='Photo Gap (mm)<input id="passportGap" type="number" min="0" max="12" step="0.5" value="5">';
    frag.append(lm,lg);group.appendChild(frag);
  }
  addPassportSpacingControls();

  // ---------- PHOTO CROP: HIDE BOX AFTER APPLY ----------
  el("applyPhotoCrop").onclick=async()=>{
    if(!state.photoImg)return alert("Upload a photo first.");
    const box=el("photoCropBox");
    const c=el("photoCanvas");if(!box||!c.width)return alert("Choose Crop first.");
    const r=getBoxRectRelative("photoCropBox","photoCanvas"),cr=c.getBoundingClientRect();
    if(r.w<=1||r.h<=1)return alert("Set crop area first.");
    const sx=Math.max(0,r.x*c.width/cr.width),sy=Math.max(0,r.y*c.height/cr.height),sw=Math.min(c.width-sx,r.w*c.width/cr.width),sh=Math.min(c.height-sy,r.h*c.height/cr.height);
    const out=document.createElement("canvas");out.width=Math.max(1,Math.round(sw));out.height=Math.max(1,Math.round(sh));
    const ctx=out.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(c,sx,sy,sw,sh,0,0,out.width,out.height);
    state.photoImg=await imageFromCanvas(out);hide("photoCropBox");drawPhoto();setStatus("photoAiStatus",`Crop applied • ${out.width} × ${out.height}px`);addHistory("Photo Studio","Applied crop",`${out.width}×${out.height}px`);
  };
  el("photoCropBtn").onclick=()=>{initPhotoCrop();show("photoCropBox");};

  // ---------- LOCAL BACKGROUND FALLBACK ----------
  function localWhiteBackground(sourceCanvas){
    const w=sourceCanvas.width,h=sourceCanvas.height,out=document.createElement("canvas");out.width=w;out.height=h;
    const src=sourceCanvas.getContext("2d").getImageData(0,0,w,h),d=src.data;
    // Estimate background color from a border ring, then flood-fill connected background pixels.
    const samples=[]; const step=Math.max(1,Math.floor(Math.min(w,h)/120));
    for(let x=0;x<w;x+=step){for(const y of [0,h-1])samples.push([d[(y*w+x)*4],d[(y*w+x)*4+1],d[(y*w+x)*4+2]]);}
    for(let y=0;y<h;y+=step){for(const x of [0,w-1])samples.push([d[(y*w+x)*4],d[(y*w+x)*4+1],d[(y*w+x)*4+2]]);}
    const bg=samples.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]).map(v=>v/Math.max(1,samples.length));
    const seen=new Uint8Array(w*h),q=[]; const push=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const i=y*w+x;if(seen[i])return;seen[i]=1;q.push(i);};
    for(let x=0;x<w;x+=Math.max(1,Math.floor(w/300))){push(x,0);push(x,h-1);}for(let y=0;y<h;y+=Math.max(1,Math.floor(h/300))){push(0,y);push(w-1,y);}
    const threshold=52;
    while(q.length){const i=q.pop(),x=i%w,y=Math.floor(i/w),di=i*4;const dist=Math.hypot(d[di]-bg[0],d[di+1]-bg[1],d[di+2]-bg[2]);if(dist>threshold)continue;d[di]=255;d[di+1]=255;d[di+2]=255;d[di+3]=255;push(x+1,y);push(x-1,y);push(x,y+1);push(x,y-1);}
    const ctx=out.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.putImageData(src,0,0);return out;
  }
  // Clean semi-transparent AI matte edges to reduce bright/old-background hair halos.
  function cleanAiCutoutEdges(cutout){
    const c=document.createElement("canvas");c.width=cutout.width;c.height=cutout.height;
    const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(cutout,0,0);
    const im=ctx.getImageData(0,0,c.width,c.height),d=im.data,w=c.width,h=c.height,alpha=new Uint8ClampedArray(w*h);
    for(let i=0;i<w*h;i++)alpha[i]=d[i*4+3];
    // Only touch the transition band. Preserve opaque hair/face/clothes exactly.
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x,a=alpha[i];if(a===0||a>=250)continue;
      let minA=255,maxA=0,sum=0,n=0;
      for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){const q=alpha[yy*w+xx];minA=Math.min(minA,q);maxA=Math.max(maxA,q);sum+=q;n++;}
      // Slight inward matte contraction removes the pale fringe without cutting solid hair.
      if(minA<80&&maxA>150){const avg=sum/n;d[i*4+3]=Math.max(0,Math.min(a,Math.round((a-18)*1.06),Math.round(avg+18)));}
    }
    ctx.clearRect(0,0,w,h);ctx.putImageData(im,0,0);return c;
  }
  function compositeCutout(cutout,bg){
    const cleaned=cleanAiCutoutEdges(cutout),out=document.createElement("canvas");out.width=cleaned.width;out.height=cleaned.height;
    const ctx=out.getContext("2d");ctx.fillStyle=bg;ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(cleaned,0,0);return out;
  }

  // ---------- SCANNER: REMOVE BG + WHITE ----------
  // Uses the exact same AI cutout + white composite pipeline as Passport Photo.
  el("scanWhiteBgBtn").onclick=async()=>{
    if(!state.scanImg)return alert("Upload or scan a document first.");
    const btn=el("scanWhiteBgBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Removing…";
    try{
      const source=document.createElement("canvas");source.width=state.scanImg.width;source.height=state.scanImg.height;drawHighQuality(source.getContext("2d"),state.scanImg,0,0,source.width,source.height);
      const blob=await canvasToBlob(source,"image/png",1);
      const mod=await import(/* webpackIgnore: true */ "https://esm.sh/@imgly/background-removal@1.7.0?bundle");
      const removeBackground=mod.default||mod.removeBackground;if(!removeBackground)throw new Error("AI engine unavailable");
      const result=await removeBackground(blob,{model:"medium",proxyToWorker:false,publicPath:"https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/",output:{format:"image/png",quality:1}});
      const cutout=await fileToImage(result),out=compositeCutout(cutout,"#fff");
      state.scanImg=await imageFromCanvas(out);
      if(state.scanPages[state.scanCurrentIndex])state.scanPages[state.scanCurrentIndex].img=state.scanImg;
      state.scanCropMode=false;state.scanCropPts=null;hide("scanCropLayer");drawScan();renderScanThumbs();
      addHistory("Scanner","Background removed","AI + white background");
    }catch(err){
      console.warn("Scanner AI background removal unavailable; using local uniform-background fallback.",err);
      try{
        const src=document.createElement("canvas");src.width=state.scanImg.width;src.height=state.scanImg.height;src.getContext("2d").drawImage(state.scanImg,0,0);
        const out=localWhiteBackground(src);state.scanImg=await imageFromCanvas(out);
        if(state.scanPages[state.scanCurrentIndex])state.scanPages[state.scanCurrentIndex].img=state.scanImg;
        state.scanCropMode=false;state.scanCropPts=null;hide("scanCropLayer");drawScan();renderScanThumbs();
        addHistory("Scanner","Background cleanup","Local fallback + white background");
      }catch(fallbackErr){console.error(fallbackErr);alert("Background removal could not be completed. Original image was preserved.");}
    }finally{btn.disabled=false;btn.textContent=old;}
  };
  el("whiteBgBtn").onclick=async()=>{
    if(!state.photoImg)return alert("Upload a photo first.");
    const status=el("photoAiStatus"),btn=el("whiteBgBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Removing…";status.textContent="Trying high-quality background removal…";
    try{
      const source=document.createElement("canvas");source.width=state.photoImg.width;source.height=state.photoImg.height;drawHighQuality(source.getContext("2d"),state.photoImg,0,0,source.width,source.height);
      const blob=await canvasToBlob(source,"image/png",1);
      const mod=await import(/* webpackIgnore: true */ "https://esm.sh/@imgly/background-removal@1.7.0?bundle");
      const removeBackground=mod.default||mod.removeBackground;if(!removeBackground)throw new Error("AI engine unavailable");
      const result=await removeBackground(blob,{model:"medium",proxyToWorker:false,publicPath:"https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/",output:{format:"image/png",quality:1},progress:(key,current,total)=>{if(total)status.textContent=`Removing background • ${Math.round(current/total*100)}%`;}});
      const cutout=await fileToImage(result),out=compositeCutout(cutout,"#fff");state.photoImg=await imageFromCanvas(out);hide("photoCropBox");drawPhoto();status.textContent="AI background removed • white background applied.";addHistory("Photo Studio","Background removed","AI + white background");
    }catch(err){
      console.warn("AI background removal unavailable; using local uniform-background fallback.",err);
      try{const src=document.createElement("canvas");src.width=state.photoImg.width;src.height=state.photoImg.height;src.getContext("2d").drawImage(state.photoImg,0,0);const out=localWhiteBackground(src);state.photoImg=await imageFromCanvas(out);hide("photoCropBox");drawPhoto();status.textContent="Local background cleanup applied • original subject preserved.";addHistory("Photo Studio","Background cleanup","Local fallback");}
      catch(fallbackErr){status.textContent="Background removal could not be completed; original preserved.";console.error(fallbackErr);}
    }finally{btn.disabled=false;btn.textContent=old;}
  };

  // ---------- NATURAL ENHANCE, HIGH QUALITY ----------
  function highQualityEnhance(source,factor=2){
    const out=document.createElement("canvas"),maxDim=6500,scale=Math.min(factor,maxDim/Math.max(source.width,source.height));
    out.width=Math.max(1,Math.round(source.width*scale));out.height=Math.max(1,Math.round(source.height*scale));
    const ctx=out.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.filter="brightness(1.015) contrast(1.025) saturate(1.015)";ctx.drawImage(source,0,0,out.width,out.height);ctx.filter="none";
    return sharpenCanvas(out,.08);
  }
  // ---------- BLUE PASSPORT BACKGROUND ----------
  // Uses the same AI cutout as the white option, then applies a print-friendly studio blue.
  el("blueBgBtn").onclick=async()=>{
    if(!state.photoImg)return alert("Upload a photo first.");
    const status=el("photoAiStatus"),btn=el("blueBgBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Removing…";status.textContent="Trying high-quality background removal…";
    const blue="#4A90D9";
    try{
      const source=document.createElement("canvas");source.width=state.photoImg.width;source.height=state.photoImg.height;drawHighQuality(source.getContext("2d"),state.photoImg,0,0,source.width,source.height);
      const blob=await canvasToBlob(source,"image/png",1);
      const mod=await import(/* webpackIgnore: true */ "https://esm.sh/@imgly/background-removal@1.7.0?bundle");
      const removeBackground=mod.default||mod.removeBackground;if(!removeBackground)throw new Error("AI engine unavailable");
      const result=await removeBackground(blob,{model:"medium",proxyToWorker:false,publicPath:"https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/",output:{format:"image/png",quality:1},progress:(key,current,total)=>{if(total)status.textContent=`Removing background • ${Math.round(current/total*100)}%`;}});
      const cutout=await fileToImage(result),out=compositeCutout(cutout,blue);state.photoImg=await imageFromCanvas(out);hide("photoCropBox");drawPhoto();status.textContent="AI background removed • blue background applied.";addHistory("Photo Studio","Background removed","AI + blue background");
    }catch(err){
      console.warn("AI background removal unavailable; using local uniform-background fallback.",err);
      try{
        const src=document.createElement("canvas");src.width=state.photoImg.width;src.height=state.photoImg.height;src.getContext("2d").drawImage(state.photoImg,0,0);
        const out=localWhiteBackground(src),ctx=out.getContext("2d"),im=ctx.getImageData(0,0,out.width,out.height),d=im.data;
        const rgb=[74,144,217];for(let i=0;i<d.length;i+=4){if(d[i]>248&&d[i+1]>248&&d[i+2]>248){d[i]=rgb[0];d[i+1]=rgb[1];d[i+2]=rgb[2];}}ctx.putImageData(im,0,0);
        state.photoImg=await imageFromCanvas(out);hide("photoCropBox");drawPhoto();status.textContent="Local background cleanup applied • blue background added.";addHistory("Photo Studio","Background cleanup","Local + blue background");
      }catch(fallbackErr){status.textContent="Background removal could not be completed; original preserved.";console.error(fallbackErr);}
    }finally{btn.disabled=false;btn.textContent=old;}
  };

  el("enhanceBtn").onclick=async()=>{
    if(!state.photoImg)return alert("Upload a photo first.");const status=el("photoAiStatus"),btn=el("enhanceBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Enhancing…";status.textContent="Upscaling with natural detail preservation…";
    try{const src=document.createElement("canvas");src.width=state.photoImg.width;src.height=state.photoImg.height;src.getContext("2d").drawImage(state.photoImg,0,0);const out=highQualityEnhance(src,2);state.photoImg=await imageFromCanvas(out);hide("photoCropBox");drawPhoto();status.textContent=`Enhancement complete • ${out.width} × ${out.height}px`;addHistory("Photo Studio","Enhanced photo","2× high-quality natural upscale");}
    catch(err){console.error(err);status.textContent="Enhancement failed • original preserved.";}finally{btn.disabled=false;btn.textContent=old;}
  };

  // Rebuild passport sheet with explicit, larger spacing and lossless PNG.
  buildDuplicateSheet=function(img,count,paper,borderPx=2){
    const c=el("printCanvas"),ctx=c.getContext("2d"),dpi=300;
    if(paper==="a4"){c.width=mmToPx(210,dpi);c.height=mmToPx(297,dpi);}else{c.width=6*dpi;c.height=4*dpi;}
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
    const template=el("passportTemplate")?.value||"auto";let photoW=null,photoH=null,cols=null,rows=null;
    if(paper==="6x4"&&template!=="auto"){
      if(template==="8-35x45"){photoW=mmToPx(35,dpi);photoH=mmToPx(45,dpi);cols=4;rows=2;count=8;}
      if(template==="6-35x45"){photoW=mmToPx(35,dpi);photoH=mmToPx(45,dpi);cols=3;rows=2;count=6;}
      if(template==="8-40x50"){photoW=mmToPx(40,dpi);photoH=mmToPx(50,dpi);cols=4;rows=2;count=8;}
    }
    let margin=mmToPx(Number(el("passportMargin")?.value||8),dpi),gap=mmToPx(Number(el("passportGap")?.value||5),dpi);
    if(!cols){cols=count<=4?2:(count===6?3:(count===9?3:4));rows=Math.ceil(count/cols);photoW=Math.floor((c.width-2*margin-gap*(cols-1))/cols);photoH=Math.floor((c.height-2*margin-gap*(rows-1))/rows);}
    else {const totalW=photoW*cols+gap*(cols-1),totalH=photoH*rows+gap*(rows-1);if(totalW+2*margin>c.width||totalH+2*margin>c.height){gap=Math.max(0,Math.floor(Math.min((c.width-2*margin-photoW*cols)/(cols-1||1),(c.height-2*margin-photoH*rows)/(rows-1||1))));}}
    const gridW=photoW*cols+gap*(cols-1),gridH=photoH*rows+gap*(rows-1),startX=Math.max(0,(c.width-gridW)/2),startY=Math.max(0,(c.height-gridH)/2),cut=el("passportCutLines")?.value!=="no";
    for(let i=0;i<count;i++){const col=i%cols,row=Math.floor(i/cols),x=startX+col*(photoW+gap),y=startY+row*(photoH+gap);fitCover(ctx,img,x,y,photoW,photoH);if(borderPx>0){ctx.save();ctx.strokeStyle="#111";ctx.lineWidth=borderPx;ctx.strokeRect(x+.5,y+.5,photoW-1,photoH-1);ctx.restore();}if(cut){ctx.save();ctx.strokeStyle="#888";ctx.setLineDash([5,4]);ctx.lineWidth=1;ctx.strokeRect(x-2,y-2,photoW+4,photoH+4);ctx.restore();}}
    hide("photoCropBox");hide("printEditor");hide("printEmpty");
  };

  // ---------- SMART CARD SOURCE / QUALITY ----------
  function rememberCardSource(){const c=el("cardSourceCanvas");if(c?.width)state.cardSourceOriginal=canvasClone(c);}
  function restoreCardSource(){if(!state.cardSourceOriginal)return;const c=el("cardSourceCanvas");c.width=state.cardSourceOriginal.width;c.height=state.cardSourceOriginal.height;c.getContext("2d").drawImage(state.cardSourceOriginal,0,0);state.cardSourceImg=null;hide("cardFreeCropLayer");enableCardPerspective();setStatus("cardStatus","Original source restored.");}
  const oldRenderCardPdfPage=renderCardPdfPage;
  renderCardPdfPage=async function(){await oldRenderCardPdfPage();rememberCardSource();};
  el("cardImageInput").addEventListener("change",()=>setTimeout(rememberCardSource,80));

  // Flexible rectangular crop UI for Smart Card.
  function ensureCardFlexUI(){
    const stage=el("cardPerspectiveStage");if(!stage)return;
    if(!el("cardFreeCropLayer")){
      const layer=document.createElement("div");layer.id="cardFreeCropLayer";layer.className="card-free-crop-layer";
      layer.innerHTML='<div id="cardFreeCropBox" class="crop-box flex-card-box"><span class="crop-handle nw" data-h="nw"></span><span class="crop-handle n" data-h="n"></span><span class="crop-handle ne" data-h="ne"></span><span class="crop-handle e" data-h="e"></span><span class="crop-handle se" data-h="se"></span><span class="crop-handle s" data-h="s"></span><span class="crop-handle sw" data-h="sw"></span><span class="crop-handle w" data-h="w"></span></div>';
      stage.appendChild(layer);
    }
  }
  ensureCardFlexUI();
  state.cardFreeCrop=null;let cardFlexDrag=null;
  function renderCardFreeCrop(){
    const layer=el("cardFreeCropLayer"),box=el("cardFreeCropBox"),c=el("cardSourceCanvas"),stage=el("cardPerspectiveStage");if(!layer||!box||!c?.width)return;
    const cr=c.getBoundingClientRect(),sr=stage.getBoundingClientRect();layer.style.left=(cr.left-sr.left)+"px";layer.style.top=(cr.top-sr.top)+"px";layer.style.width=cr.width+"px";layer.style.height=cr.height+"px";layer.style.display=state.cardFreeCrop?"block":"none";
    if(state.cardFreeCrop){const r=state.cardFreeCrop;box.style.left=(r.x*100)+"%";box.style.top=(r.y*100)+"%";box.style.width=(r.w*100)+"%";box.style.height=(r.h*100)+"%";}
  }
  function startCardFreeCrop(){
    const c=el("cardSourceCanvas");if(!c?.width)return alert("Open a PDF or image first.");state.cardFreeCrop={x:.08,y:.08,w:.84,h:.84};state.cardPerspectiveMode=false;hide("cardPerspectiveLayer");renderCardFreeCrop();setStatus("cardStatus","Flexible crop • drag corners horizontally or vertically, then Apply.");
  }
  el("cardFlexibleCropBtn")?.addEventListener("click",startCardFreeCrop);
  el("restoreCardSourceBtn")?.addEventListener("click",restoreCardSource);
  qsa("#cardFreeCropBox .crop-handle").forEach(h=>{
    h.addEventListener("pointerdown",e=>{if(!state.cardFreeCrop)return;e.preventDefault();h.setPointerCapture(e.pointerId);cardFlexDrag={sx:e.clientX,sy:e.clientY,start:{...state.cardFreeCrop},handle:h.dataset.h};});
    h.addEventListener("pointermove",e=>{if(!cardFlexDrag)return;const c=el("cardSourceCanvas").getBoundingClientRect(),dx=(e.clientX-cardFlexDrag.sx)/c.width,dy=(e.clientY-cardFlexDrag.sy)/c.height,s=cardFlexDrag.start,h=cardFlexDrag.handle,n={...s};if(h.includes("w")){n.x=clamp(s.x+dx,0,.95);n.w=Math.max(.05,s.w-dx);}if(h.includes("e")){n.w=Math.max(.05,s.w+dx);}if(h.includes("n")){n.y=clamp(s.y+dy,0,.95);n.h=Math.max(.05,s.h-dy);}if(h.includes("s")){n.h=Math.max(.05,s.h+dy);}if(n.x+n.w>1)n.w=1-n.x;if(n.y+n.h>1)n.h=1-n.y;state.cardFreeCrop=n;renderCardFreeCrop();});
    h.addEventListener("pointerup",()=>cardFlexDrag=null);h.addEventListener("pointercancel",()=>cardFlexDrag=null);
  });
  el("applyCardFlexibleCrop")?.addEventListener("click",async()=>{
    if(!state.cardFreeCrop)return alert("Choose Flexible Crop first.");const c=el("cardSourceCanvas"),r=state.cardFreeCrop;const out=document.createElement("canvas");out.width=Math.max(1,Math.round(r.w*c.width));out.height=Math.max(1,Math.round(r.h*c.height));const ctx=out.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(c,r.x*c.width,r.y*c.height,r.w*c.width,r.h*c.height,0,0,out.width,out.height);if(!state.cardSourceOriginal)state.cardSourceOriginal=canvasClone(c);c.width=out.width;c.height=out.height;c.getContext("2d").drawImage(out,0,0);state.cardFreeCrop=null;state.cardPerspectiveMode=false;state.cardPerspectivePts=null;hide("cardFreeCropLayer");hide("cardPerspectiveLayer");setStatus("cardStatus",`Flexible crop applied • ${out.width} × ${out.height}px. Crop overlay closed. Use 4-Point Perspective when ready.`);
  });

  // ---------- BETTER DOCUMENT DETECTION ----------
  function orderQuad(points){
    const pts=points.map(p=>({x:p.x,y:p.y})),sum=pts.map(p=>p.x+p.y),dif=pts.map(p=>p.x-p.y);
    return [pts[sum.indexOf(Math.min(...sum))],pts[dif.indexOf(Math.max(...dif))],pts[sum.indexOf(Math.max(...sum))],pts[dif.indexOf(Math.min(...dif))]];
  }
  async function detectGenericDocument(sourceCanvas){
    if(typeof cv==="undefined"||!cv.Mat)return null;
    const maxDim=2200,scale=Math.min(1,maxDim/Math.max(sourceCanvas.width,sourceCanvas.height));const dc=document.createElement("canvas");dc.width=Math.max(1,Math.round(sourceCanvas.width*scale));dc.height=Math.max(1,Math.round(sourceCanvas.height*scale));const dctx=dc.getContext("2d");dctx.drawImage(sourceCanvas,0,0,dc.width,dc.height);
    const src=cv.imread(dc),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat();let best=null,bestScore=-Infinity;
    try{
      cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);cv.Canny(blur,25,110,edges);const k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5));cv.morphologyEx(edges,edges,cv.MORPH_CLOSE,k);k.delete();cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);const areaAll=dc.width*dc.height;
      for(let i=0;i<contours.size();i++){const cnt=contours.get(i),peri=cv.arcLength(cnt,true),approx=new cv.Mat();cv.approxPolyDP(cnt,approx,.025*peri,true);if(approx.rows===4){const area=Math.abs(cv.contourArea(approx)),ar=area/areaAll;if(ar>.06&&ar<.995&&cv.isContourConvex(approx)){const pts=[];for(let j=0;j<4;j++){const q=approx.intPtr(j,0);pts.push({x:q[0],y:q[1]});}const [tl,tr,br,bl]=orderQuad(pts),w=(Math.hypot(tr.x-tl.x,tr.y-tl.y)+Math.hypot(br.x-bl.x,br.y-bl.y))/2,h=(Math.hypot(bl.x-tl.x,bl.y-tl.y)+Math.hypot(br.x-tr.x,br.y-tr.y))/2,ratio=Math.max(w,h)/Math.max(1,Math.min(w,h));const target=1.585,ratioErr=Math.min(1,Math.abs(ratio-target)/target),score=ar*4+(1-ratioErr)*2+(ar>.18?1:0);if(score>bestScore){bestScore=score;best=pts.map(p=>({x:p.x/scale,y:p.y/scale}));}}}approx.delete();cnt.delete();}
      return best;
    }finally{[src,gray,blur,edges,hierarchy].forEach(m=>m.delete());contours.delete();}
  }
  function contentFallbackQuad(c){
    const ctx=c.getContext("2d"),d=ctx.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height,step=Math.max(1,Math.floor(Math.min(w,h)/700));let minX=w,minY=h,maxX=-1,maxY=-1;
    for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){const i=(y*w+x)*4,avg=(d[i]+d[i+1]+d[i+2])/3;if(avg<245){if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;}}
    if(maxX<0)return null;const pad=Math.max(4,Math.round(Math.min(w,h)*.01));minX=Math.max(0,minX-pad);minY=Math.max(0,minY-pad);maxX=Math.min(w-1,maxX+pad);maxY=Math.min(h-1,maxY+pad);return [{x:minX,y:minY},{x:maxX,y:minY},{x:maxX,y:maxY},{x:minX,y:maxY}];
  }
  function defaultCardQuad(c){const ratio=85.6/54;let w=c.width*.82,h=w/ratio;if(h>c.height*.82){h=c.height*.82;w=h*ratio;}const x=(c.width-w)/2,y=(c.height-h)/2;return [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];}
  async function bestDocumentPoints(c,strictCard=true){
    try{
      if(strictCard){
        const found=await detectCardQuadrilaterals(c,12);
        // Only trust a detected card when it is a convincing outer boundary.
        // Otherwise an inner text/red-box rectangle is worse than a manual crop.
        const credible=found.filter(x=>{
          const xs=x.points.map(p=>p.x),ys=x.points.map(p=>p.y),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys),area=(w*h)/(c.width*c.height);
          const near=x.points.filter(p=>p.x<c.width*.08||p.y<c.height*.08||p.x>c.width*.92||p.y>c.height*.92).length;
          return near>=2 || area>=.58;
        });
        if(credible.length)return credible[0].points;
        const lines=detectCardByLongLines(c,12);
        const lineCredible=lines.filter(x=>{
          const xs=x.points.map(p=>p.x),ys=x.points.map(p=>p.y),area=((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)))/(c.width*c.height),near=x.points.filter(p=>p.x<c.width*.08||p.y<c.height*.08||p.x>c.width*.92||p.y>c.height*.92).length;
          return near>=2 || area>=.58;
        });
        if(lineCredible.length)return lineCredible[0].points;
      }
      const generic=await detectGenericDocument(c);
      if(generic)return generic;
      const content=contentFallbackQuad(c);
      if(content)return content;
      return defaultCardQuad(c);
    }catch(e){console.warn(e);return contentFallbackQuad(c)||defaultCardQuad(c);}
  }
  el("deskewBtn").onclick=async()=>{
    if(!state.scanImg)return alert("Upload a document first.");
    if(typeof cv==="undefined"||!cv.Mat){setStatus("scanStatus","OpenCV is still loading • Perspective Crop is available now.");initScanCropBox();return;}
    const btn=el("deskewBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Detecting…";
    try{const src=document.createElement("canvas");src.width=state.scanImg.width;src.height=state.scanImg.height;src.getContext("2d").drawImage(state.scanImg,0,0);const pts=await bestDocumentPoints(src,false);state.scanCropPts=pts.map(p=>({x:p.x/src.width,y:p.y/src.height}));state.scanCropMode=true;renderScanPerspectiveOverlay();setStatus("scanStatus","Document boundary found • review the 4 corners, then Apply Perspective.");}
    catch(e){console.warn(e);initScanCropBox();setStatus("scanStatus","No clear boundary • manual 4-corner Perspective Crop opened.");}
    finally{btn.disabled=false;btn.textContent=old;}
  };
  // Scanner export: preserve lossless quality in PDF and hide crop overlay after apply.
  el("applyScanCrop").onclick=async()=>{if(!el("scanCanvas").width)return alert("Upload or scan a document first.");if(!state.scanCropMode||!state.scanCropPts)return initScanCropBox();try{const out=await perspectiveCropCanvas(el("scanCanvas"),state.scanCropPts);state.scanImg=await imageFromCanvas(out);state.scanCropMode=false;state.scanCropPts=null;hide("scanCropLayer");drawScan();setStatus("scanStatus",`Perspective crop applied • ${out.width} × ${out.height}px`);addHistory("Scanner","Perspective crop applied",`${out.width}×${out.height}px`);}catch(e){console.error(e);setStatus("scanStatus","Crop failed • manual points are still available.");}};
  // Add scanner status if absent.
  if(!el("scanStatus")){const n=document.createElement("div");n.id="scanStatus";n.className="status-inline";n.textContent="Ready • Auto Detect tries multiple document-detection methods.";el("scanner")?.querySelector(".workspace-main")?.prepend(n);}
  if(!el("cardStatus")){const n=document.createElement("div");n.id="cardStatus";n.className="status-inline";n.textContent="Ready • Auto Detect uses multiple passes and never blocks you with a detection alert.";el("cards")?.querySelector(".workspace-main")?.prepend(n);}
  if(!el("printStatus")){const n=document.createElement("div");n.id="printStatus";n.className="status-inline";n.textContent="Upload images to arrange them with drag + resize.";el("print")?.querySelector(".compact-tool")?.insertBefore(n,el("print")?.querySelector(".compact-controls"));}

  // ---------- SMART CARD AUTO DETECT / PERSPECTIVE QUALITY ----------
  perspectiveCardCanvas=async function(sourceCanvas,pts,dpi=600){
    if(typeof cv==="undefined"||!cv.Mat)throw new Error("OpenCV is still loading. Please wait a moment.");
    const ordered=orderQuad(pts.map(p=>({x:p.x*sourceCanvas.width,y:p.y*sourceCanvas.height}))),outW=mmToPx(85.6,dpi),outH=mmToPx(54,dpi);
    const src=cv.imread(sourceCanvas),srcPts=cv.matFromArray(4,1,cv.CV_32FC2,ordered.flatMap(p=>[p.x,p.y])),dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,outW-1,0,outW-1,outH-1,0,outH-1]),M=cv.getPerspectiveTransform(srcPts,dstPts),dst=new cv.Mat();
    cv.warpPerspective(src,dst,M,new cv.Size(outW,outH),cv.INTER_LANCZOS4,cv.BORDER_CONSTANT,new cv.Scalar(255,255,255,255));
    const out=document.createElement("canvas");out.width=outW;out.height=outH;const ctx=out.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";cv.imshow(out,dst);[src,srcPts,dstPts,M,dst].forEach(m=>m.delete());return out;
  };
  el("autoDetectCardBtn").onclick=async()=>{
    const c=el("cardSourceCanvas");if(!c?.width)return alert("Open a PDF page or image first.");const btn=el("autoDetectCardBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Detecting…";
    try{const pts=await bestDocumentPoints(c,true);setCardPerspectivePointsFromPixels(pts,c);setStatus("cardStatus","Best available 4-corner boundary selected • adjust corners if needed, then Apply & Save.");}
    catch(e){console.warn(e);enableCardPerspective();setStatus("cardStatus","Auto detection could not find a reliable edge • manual Perspective Crop opened.");}
    finally{btn.disabled=false;btn.textContent=old;}
  };
  el("autoSplitCardsBtn").onclick=async()=>{
    const c=el("cardSourceCanvas");if(!c?.width)return alert("Open a PDF page or image first.");const btn=el("autoSplitCardsBtn"),old=btn.textContent;btn.disabled=true;btn.textContent="Finding cards…";
    try{let found=await detectCardQuadrilaterals(c,12);const credible=found.filter(x=>{const xs=x.points.map(p=>p.x),ys=x.points.map(p=>p.y),area=((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)))/(c.width*c.height),near=x.points.filter(p=>p.x<c.width*.08||p.y<c.height*.08||p.x>c.width*.92||p.y>c.height*.92).length;return near>=2||area>=.58;});found=credible;if(!found.length){const lines=detectCardByLongLines(c,12);found=lines.filter(x=>{const xs=x.points.map(p=>p.x),ys=x.points.map(p=>p.y),area=((Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)))/(c.width*c.height),near=x.points.filter(p=>p.x<c.width*.08||p.y<c.height*.08||p.x>c.width*.92||p.y>c.height*.92).length;return near>=2||area>=.58;});}if(!found.length){const one=await detectGenericDocument(c);if(one)found=[{points:one,score:1}];}if(!found.length){found=[{points:[{x:0,y:0},{x:c.width,y:0},{x:c.width,y:c.height},{x:0,y:c.height}],score:.1}];setStatus("cardStatus","No reliable boundary found • using the full image. Adjust the four corners manually if needed.");}else setStatus("cardStatus",`${found.length} document/card candidate(s) found • assign Front or Back below.`);state.detectedCards=found.map(x=>({points:x.points,score:x.score}));const grid=el("detectedCardsGrid"),panel=el("detectedCardsPanel");grid.innerHTML="";panel.hidden=false;
      for(let i=0;i<found.length;i++){const crop=await perspectiveCardCanvas(c,found[i].points.map(p=>({x:p.x/c.width,y:p.y/c.height})),+$('cardExportDpi').value||600),wrap=document.createElement("div");wrap.className="detected-card";const cvw=document.createElement("canvas");wrap.appendChild(cvw);previewCardCanvasTo(cvw,crop);const actions=document.createElement("div");actions.className="detected-card-actions";for(const [txt,fn] of [["Set Front",()=>{state.cardFrontCrop=crop;previewCardCanvas("cardFrontPreview",crop)}],["Set Back",()=>{state.cardBackCrop=crop;previewCardCanvas("cardBackPreview",crop)}],["Export PVC",()=>downloadCanvas(crop,`pvc-detected-${i+1}-${$('cardExportDpi').value}dpi`,$('cardOutputFormat').value||"image/png",1)]]){const b=document.createElement("button");b.className="mini-btn";b.textContent=txt;b.onclick=fn;actions.appendChild(b);}wrap.appendChild(actions);grid.appendChild(wrap);}
      if(found.length>=2){state.cardFrontCrop=await perspectiveCardCanvas(c,found[0].points.map(p=>({x:p.x/c.width,y:p.y/c.height})),$('cardExportDpi').value||600);state.cardBackCrop=await perspectiveCardCanvas(c,found[1].points.map(p=>({x:p.x/c.width,y:p.y/c.height})),$('cardExportDpi').value||600);previewCardCanvas("cardFrontPreview",state.cardFrontCrop);previewCardCanvas("cardBackPreview",state.cardBackCrop);}
    }catch(e){console.warn(e);setStatus("cardStatus","Auto split could not confidently detect both sides • manual Perspective Crop remains available.");}finally{btn.disabled=false;btn.textContent=old;}
  };
  // Restore source button if it exists / create it.
  const cardGroup=qsa("#cards .control-group")[0];if(cardGroup&&!el("restoreCardSourceBtn")){const b=document.createElement("button");b.id="restoreCardSourceBtn";b.className="ghost-btn";b.textContent="Restore Original";b.onclick=restoreCardSource;cardGroup.appendChild(b);}
  // Add flexible crop controls.
  if(cardGroup&&!el("cardFlexibleCropBtn")){const b=document.createElement("button");b.id="cardFlexibleCropBtn";b.className="mini-btn";b.textContent="Flexible Crop";cardGroup.insertBefore(b,el("manualCardPerspectiveBtn"));b.onclick=startCardFreeCrop;}
  if(cardGroup&&!el("applyCardFlexibleCrop")){const b=document.createElement("button");b.id="applyCardFlexibleCrop";b.className="mini-btn";b.textContent="Apply Flexible Crop";cardGroup.insertBefore(b,el("manualCardPerspectiveBtn"));b.onclick=async()=>el("applyCardFlexibleCrop").dispatchEvent(new Event("click"));}
  // The dynamic button above needs a direct handler rather than self-dispatch recursion.
  el("applyCardFlexibleCrop").onclick=async()=>{
    if(!state.cardFreeCrop)return startCardFreeCrop();const c=el("cardSourceCanvas"),r=state.cardFreeCrop,out=document.createElement("canvas");out.width=Math.max(1,Math.round(r.w*c.width));out.height=Math.max(1,Math.round(r.h*c.height));const ctx=out.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(c,r.x*c.width,r.y*c.height,r.w*c.width,r.h*c.height,0,0,out.width,out.height);if(!state.cardSourceOriginal)state.cardSourceOriginal=canvasClone(c);c.width=out.width;c.height=out.height;c.getContext("2d").drawImage(out,0,0);state.cardFreeCrop=null;state.cardPerspectiveMode=false;state.cardPerspectivePts=null;hide("cardFreeCropLayer");hide("cardPerspectiveLayer");setStatus("cardStatus",`Flexible crop applied • ${out.width} × ${out.height}px. Crop overlay closed. Use 4-Point Perspective when ready.`);
  };
  // Save perspective: always hide overlay after application.
  el("saveCardCrop").onclick=async()=>{try{if(!el("cardSourceCanvas").width)return alert("Open a PDF or image first.");if(!state.cardPerspectiveMode||!state.cardPerspectivePts){enableCardPerspective();return;}const dpi=+$('cardExportDpi').value||600,crop=await perspectiveCardCanvas(el("cardSourceCanvas"),state.cardPerspectivePts,dpi),action=el("cardCropAction").value;if(action==="front")state.cardFrontCrop=crop;else state.cardBackCrop=crop;previewCardCanvas(action==="front"?"cardFrontPreview":"cardBackPreview",crop);state.cardPerspectiveMode=false;hide("cardPerspectiveLayer");setStatus("cardStatus",`${action.toUpperCase()} crop applied • exact PVC 85.6 × 54 mm • ${crop.width} × ${crop.height}px`);addHistory("Smart Card",`Saved ${action} • exact PVC`,`85.6×54 mm • ${dpi} DPI • ${crop.width}×${crop.height}px`);}catch(e){console.error(e);setStatus("cardStatus","Perspective crop failed • original source preserved.");}};
  // Export uses exact saved crop and lossless PNG.
  el("exportCardCropImage").onclick=async()=>{try{const action=el("cardCropAction").value,dpi=+$('cardExportDpi').value||600;let crop=action==="front"?state.cardFrontCrop:state.cardBackCrop;if(state.cardPerspectiveMode&&state.cardPerspectivePts)crop=await perspectiveCardCanvas(el("cardSourceCanvas"),state.cardPerspectivePts,dpi);if(!crop){setStatus("cardStatus","Apply Front/Back crop first.");return;}downloadCanvas(crop,`pvc-${action}-${dpi}dpi`,el("cardOutputFormat").value||"image/png",1);setStatus("cardStatus",`Exported ${action.toUpperCase()} • ${crop.width} × ${crop.height}px • lossless PNG ready.`);}catch(e){console.error(e);setStatus("cardStatus","PVC export failed • source preserved.");}};

  // ---------- GENERIC DRAG/RESIZE LAYOUT EDITOR ----------
  function ensureEditor(id,hostId){
    let ed=el(id);if(ed)return ed;const host=el(hostId);if(!host)return null;ed=document.createElement("div");ed.id=id;ed.className="layout-editor";host.appendChild(ed);return ed;
  }
  function makeLayoutItems(images,mode,paper,orientation,count,marginMm=4,gapMm=3,dpi=300){let W=paper==="a4"?mmToPx(210,dpi):mmToPx(152.4,dpi),H=paper==="a4"?mmToPx(297,dpi):mmToPx(101.6,dpi);if(orientation==="landscape"&&H>W)[W,H]=[H,W];if(orientation==="portrait"&&W>H)[W,H]=[H,W];
    const n=count||images.length,cols=n===4?2:n===6?3:n===9?3:4,rows=Math.ceil(n/cols),m=mmToPx(marginMm,dpi),g=mmToPx(gapMm,dpi),cw=Math.max(1,(W-2*m-g*(cols-1))/cols),ch=Math.max(1,(H-2*m-g*(rows-1))/rows);const items=[];
    for(let i=0;i<n;i++){const col=i%cols,row=Math.floor(i/cols),img=images[i%images.length];let x=m+col*(cw+g),y=m+row*(ch+g),w=cw,h=ch;items.push({img,x:x/W,y:y/H,w:w/W,h:h/H,ratio:img.width/img.height});}return {W,H,items};
  }
  function syncLayoutEditor(editor,canvas){
    if(!editor||!canvas?.width)return;
    const cr=canvas.getBoundingClientRect(),host=editor.parentElement.getBoundingClientRect();
    editor.style.left=(cr.left-host.left)+"px";editor.style.top=(cr.top-host.top)+"px";editor.style.width=cr.width+"px";editor.style.height=cr.height+"px";editor.style.display="block";
  }
  function updateLayoutDom(d,it){
    d.style.left=(it.x*100)+"%";d.style.top=(it.y*100)+"%";d.style.width=(it.w*100)+"%";d.style.height=(it.h*100)+"%";
  }
  function drawLayoutImageContain(ctx,img,x,y,w,h){
    if(!img?.width||!img?.height||w<=0||h<=0)return;
    const s=Math.min(w/img.width,h/img.height);
    const dw=img.width*s, dh=img.height*s;
    const dx=x+(w-dw)/2, dy=y+(h-dh)/2;
    ctx.drawImage(img,0,0,img.width,img.height,dx,dy,dw,dh);
  }
  function renderLayoutPreview(canvas,items){
    if(!canvas?.width)return;
    const ctx=canvas.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    items.forEach(it=>{const x=it.x*canvas.width,y=it.y*canvas.height,w=it.w*canvas.width,h=it.h*canvas.height,a=+it.rotation||0;if(a){ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(a*Math.PI/180);drawLayoutImageContain(ctx,it.img,-w/2,-h/2,w,h);ctx.restore();}else drawLayoutImageContain(ctx,it.img,x,y,w,h);});
  }
  function renderLayoutEditor(editor,canvas,items,labelPrefix="IMG"){
    if(!editor||!canvas?.width)return;syncLayoutEditor(editor,canvas);editor.innerHTML="";
    items.forEach((it,i)=>{
      const d=document.createElement("div");d.className="layout-item";d.dataset.i=i;updateLayoutDom(d,it);
      const im=document.createElement("img");im.src=it.img instanceof HTMLCanvasElement?it.img.toDataURL("image/png"):it.img.src;d.appendChild(im);
      const tag=document.createElement("span");tag.className="layout-item-tag";tag.textContent=`${labelPrefix} ${i+1} • DRAG / SCALE`;d.appendChild(tag);
      for(const pos of ["nw","ne","sw","se"]){const h=document.createElement("span");h.className=`layout-resize ${pos}`;h.dataset.handle=pos;d.appendChild(h);}
      editor.appendChild(d);
      d.addEventListener("pointerdown",e=>{
        if(e.target.classList.contains("layout-resize"))return;
        e.preventDefault();d.classList.add("selected");const idx=i,base={...items[idx]},sx=e.clientX,sy=e.clientY,rect=canvas.getBoundingClientRect();
        const move=ev=>{items[idx].x=clamp(base.x+(ev.clientX-sx)/rect.width,0,1-base.w);items[idx].y=clamp(base.y+(ev.clientY-sy)/rect.height,0,1-base.h);updateLayoutDom(d,items[idx]);renderLayoutPreview(canvas,items);};
        const up=()=>{document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);
      });
      d.querySelectorAll(".layout-resize").forEach(h=>h.addEventListener("pointerdown",e=>{
        e.preventDefault();e.stopPropagation();d.classList.add("selected");const idx=i,base={...items[idx]},sx=e.clientX,sy=e.clientY,rect=canvas.getBoundingClientRect(),handle=h.dataset.handle,ratio=base.ratio||1;
        const move=ev=>{
          const dx=(ev.clientX-sx)/rect.width, dy=(ev.clientY-sy)/rect.height;
          // Proportional resize: every corner scales the image uniformly so it never stretches or squashes.
          const anchorX=handle.includes("w") ? base.x+base.w : base.x;
          const anchorY=handle.includes("n") ? base.y+base.h : base.y;
          const wantedW=handle.includes("w") ? anchorX-(base.x+dx) : (base.x+base.w+dx)-anchorX;
          const wantedH=handle.includes("n") ? anchorY-(base.y+dy) : (base.y+base.h+dy)-anchorY;
          let nw=Math.max(.025, Math.max(wantedW, wantedH*ratio));
          let nh=nw/ratio;
          const maxW=handle.includes("w") ? anchorX : 1-anchorX;
          const maxH=handle.includes("n") ? anchorY : 1-anchorY;
          nw=Math.min(nw,maxW,maxH*ratio);
          nh=nw/ratio;
          const nx=handle.includes("w") ? anchorX-nw : anchorX;
          const ny=handle.includes("n") ? anchorY-nh : anchorY;
          items[idx]={...items[idx],x:clamp(nx,0,1-nw),y:clamp(ny,0,1-nh),w:nw,h:nh};
          updateLayoutDom(d,items[idx]);
          renderLayoutPreview(canvas,items);
        };
        const up=()=>{document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);
      }));
    });
  }
  function buildFromLayout(canvas,items,W,H){canvas.width=W;canvas.height=H;renderLayoutPreview(canvas,items);return canvas;}

  // ---------- PRINT STUDIO ----------
  ensureEditor("printEditor","printCanvas") || ensureEditor("printEditor","printCanvas") || ensureEditor("printEditor","printCanvas");
  // The editor must be a sibling overlay, not a child of canvas; move it to the canvas-wrap host if necessary.
  (function fixPrintEditorHost(){const ed=el("printEditor"),c=el("printCanvas");if(ed&&c&&ed.parentElement!==c.parentElement)c.parentElement.appendChild(ed);})();
  state.printLayout=[];
  function rebuildPrintLayout(){
    if(!state.printImages.length)return;const paper=el("printPaper").value,ori=el("printOrientation").value,count=+$('printCount').value,margin=+$('printMargin').value||6,gap=+$('printGap')?.value||3;const dpi=+$('printDpi')?.value||300;const model=makeLayoutItems(state.printImages,"grid",paper,ori,count,margin,gap,dpi);state.printLayout=model.items;buildFromLayout(el("printCanvas"),state.printLayout,model.W,model.H);hide("printEmpty");renderLayoutEditor(el("printEditor"),el("printCanvas"),state.printLayout,"IMG");setStatus("printStatus","Drag any image to arrange • drag a corner handle to resize. Export uses the current arrangement.");}
  el("printInput").onchange=async e=>{state.printImages=[];for(const f of [...e.target.files]){try{state.printImages.push(await fileToImage(f));}catch{}};if(state.printImages.length)rebuildPrintLayout();else clearPrint();};
  const printControls=el("print")?.querySelector(".compact-controls");if(printControls&&!el("printGap")){const lab=document.createElement("label");lab.innerHTML='Photo Gap (mm)<input id="printGap" type="number" min="0" max="30" step="0.5" value="5">';printControls.appendChild(lab);}
  if(printControls&&!el("printDpi")){const lab=document.createElement("label");lab.innerHTML='Output DPI<select id="printDpi"><option value="300" selected>300 • Print</option><option value="600">600 • Maximum</option></select>';printControls.appendChild(lab);}
  ["printCount","printPaper","printOrientation","printMargin","printGap","printDpi"].forEach(id=>el(id)?.addEventListener("input",()=>{if(state.printImages.length)rebuildPrintLayout();}));
  el("buildPrintSheet").onclick=()=>{if(!state.printImages.length)return alert("Upload images.");rebuildPrintLayout();addHistory("Print Studio","Built editable collage",`${state.printLayout.length} images`);};
  el("downloadPrintSheet").onclick=()=>{if(!el("printCanvas").width||!state.printLayout.length)return;buildFromLayout(el("printCanvas"),state.printLayout,el("printCanvas").width,el("printCanvas").height);exportPNG(el("printCanvas"),"print-studio-sheet");};
  el("browserPrint").onclick=()=>{if(!el("printCanvas").width)return;const url=el("printCanvas").toDataURL("image/png"),w=window.open("");if(w){w.document.write(`<img src="${url}" style="max-width:100%;width:100%"><script>onload=()=>print()<\\/script>`);}};

  // ---------- SMART CARD SHEET EDITOR ----------
  function ensureCardSheetEditor(){const c=el("cardCanvas");if(!c)return;const host=c.parentElement;if(!el("cardSheetEditor")){const d=document.createElement("div");d.id="cardSheetEditor";d.className="layout-editor";host.appendChild(d);}}
  ensureCardSheetEditor();state.cardSheetLayout=[];
  function rebuildCardSheet(){
    const front=state.cardFrontCrop,back=state.cardBackCrop;
    if(!front&&!back){setStatus("cardStatus","Save Front and/or Back first.");return;}
    const paper=el("cardPaper").value,layout=el("cardLayout").value,dpi=+$('cardPrintDpi')?.value||300;
    const W=paper==="a4"?mmToPx(210,dpi):mmToPx(152.4,dpi),H=paper==="a4"?mmToPx(297,dpi):mmToPx(101.6,dpi);
    const dims=state.cardSavedDimensions||{};
    const imgs=[];
    if(front)imgs.push({img:front,mm:dims.front||[85.6,54]});
    if(back)imgs.push({img:back,mm:dims.back||[85.6,54]});
    const margin=mmToPx(Number(el('cardPrintMargin')?.value??8),dpi),gap=mmToPx(Number(el('cardPrintGap')?.value??7),dpi);
    const maxWidth=Math.max(1,W-2*margin),maxHeight=Math.max(1,H-2*margin);
    const sizes=imgs.map(x=>{const rawW=mmToPx(x.mm[0],dpi),rawH=mmToPx(x.mm[1],dpi),f=Math.min(1,maxWidth/rawW,maxHeight/rawH);return {img:x.img,w:rawW*f,h:rawH*f}});
    let sideBySide=layout==='side-by-side'&&sizes.length>1;
    if(sideBySide&&(sizes.reduce((t,i)=>t+i.w,0)+gap>maxWidth||sizes.some(x=>x.h>maxHeight)))sideBySide=false;
    const total=sideBySide?sizes.reduce((t,i)=>t+i.w,0)+gap*(sizes.length-1):sizes.reduce((t,i)=>t+i.h,0)+gap*(sizes.length-1);
    const limit=sideBySide?maxWidth:maxHeight, shrink=Math.min(1,limit/Math.max(1,total));
    const items=[];
    const extent=total*shrink;
    let cursor=(sideBySide?W:H)/2-extent/2;
    for(const obj of sizes){
      const w=obj.w*shrink,h=obj.h*shrink,x=sideBySide?cursor:(W-w)/2,y=sideBySide?(H-h)/2:cursor;
      items.push({img:obj.img,x:x/W,y:y/H,w:w/W,h:h/H,ratio:w/h});
      cursor+=(sideBySide?w:h)+gap*shrink;
    }
    state.cardSheetLayout=items;
    buildFromLayout(el("cardCanvas"),items,W,H);hide("cardEmpty");
    renderLayoutEditor(el("cardSheetEditor"),el("cardCanvas"),items,"CARD");
    setStatus("cardStatus",sideBySide?'Print-size cards placed side by side. Drag to rearrange.':'Print-size cards placed on the sheet. Drag to rearrange.');
  }
  el("buildCardSheet").onclick=()=>{rebuildCardSheet();addHistory("Smart Card","Built editable card sheet",el("cardLayout").value);};
  el("downloadCardSheet").onclick=()=>{if(!state.cardSheetLayout.length)return rebuildCardSheet();buildFromLayout(el("cardCanvas"),state.cardSheetLayout,el("cardCanvas").width,el("cardCanvas").height);exportPNG(el("cardCanvas"),"smart-card-sheet");};
  if(!el("cardPrintDpi")){const g=qsa("#cards .control-group").find(x=>/Print Sheet/i.test(x.querySelector("h4")?.textContent||""));if(g){const l=document.createElement("label");l.innerHTML='Print DPI<select id="cardPrintDpi"><option value="300">300 • Print</option><option value="600" selected>600 • Maximum</option></select>';g.insertBefore(l,g.querySelector("label"));}}

  // ---------- CLEAR / SOURCE EVENTS ----------
  el("clearDetectedCards")?.addEventListener("click",()=>{state.detectedCards=[];el("detectedCardsGrid").innerHTML="";el("detectedCardsPanel").hidden=true;});
  el("downloadScanImage").onclick=()=>{if(!el("scanCanvas").width)return;exportPNG(el("scanCanvas"),"scanned-document");addHistory("Scanner","Downloaded lossless PNG");};
  el("exportScanPdf").onclick=async()=>{if(!state.scanPages.length)return alert("Add at least one scanned page.");const pdf=await PDFLib.PDFDocument.create();for(const p of state.scanPages){const tmp=document.createElement("canvas");tmp.width=p.img.width;tmp.height=p.img.height;tmp.getContext("2d").drawImage(p.img,0,0);const bytes=await(await canvasToBlob(tmp,"image/png",1)).arrayBuffer();const png=await pdf.embedPng(bytes);const page=pdf.addPage([png.width,png.height]);page.drawImage(png,{x:0,y:0,width:png.width,height:png.height});}downloadBytes(await pdf.save({useObjectStreams:false}),"scanned-pages-lossless.pdf","application/pdf");addHistory("Scanner","Exported lossless PDF",`${state.scanPages.length} pages`);};

  // Hide crop overlays whenever source changes or a section is cleared.
  window.addEventListener("resize",()=>{try{renderScanPerspectiveOverlay();renderCardPerspectiveOverlay();renderCardFreeCrop();if(state.printLayout.length)renderLayoutEditor(el("printEditor"),el("printCanvas"),state.printLayout,"IMG");if(state.cardSheetLayout.length)renderLayoutEditor(el("cardSheetEditor"),el("cardCanvas"),state.cardSheetLayout,"CARD");}catch{}});

  // Version marker.
  document.title="Shop Studio Pro v10.4";
  const meta=document.querySelector('meta[name="shop-build"]');if(meta)meta.content="10.4.0";
  const bs=document.querySelector(".brand-subtitle");if(bs)bs.textContent="PRO TOOLKIT • V10.4";
  const bd=document.querySelector('.brand-subtitle + div');if(bd)bd.textContent="BUILD 10.4.0";
  v3.ready=true;
})();
/* v10.3 header cleanup */
(function(){
  ["scanner","photo","cards","print"].forEach(sec=>{
    const s=document.getElementById(sec),b=document.getElementById(sec==="scanner"?"clearScannerBtn":sec==="photo"?"clearPhotoBtn":sec==="cards"?"clearCardsBtn":"clearPrintBtn");
    if(!s||!b)return;const head=s.querySelector(".workspace-head");if(!head)return;let row=head.querySelector(".button-row");if(!row){row=document.createElement("div");row.className="button-row";head.appendChild(row);}row.appendChild(b);
  });
})();
/* v10.3 lossless PDF -> image export */
(function(){
  const btn=document.getElementById("pdfToImageBtn");
  if(!btn)return;
  btn.onclick=async()=>{
    const f=document.getElementById("pdfToImageInput").files[0];if(!f)return alert("Choose a PDF first.");
    try{const mod=await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs"),pdf=await mod.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;
      for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),vp=page.getViewport({scale:3}),c=document.createElement("canvas"),ctx=c.getContext("2d");c.width=Math.round(vp.width);c.height=Math.round(vp.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";await page.render({canvasContext:ctx,viewport:vp}).promise;await new Promise(r=>setTimeout(r,60));exportPNG(c,`page-${String(i).padStart(2,"0")}`);}
      addHistory("PDF Tools","PDF to lossless PNG images",`${pdf.numPages} pages`);
    }catch(e){console.error(e);alert("PDF conversion failed. Please try again.");}
  };
})();
/* v10.3 auto-open editable card layout whenever Front/Back crops become available */
(function(){
  const originalSave=document.getElementById("saveCardCrop");
  if(originalSave){
    const old=originalSave.onclick;
    originalSave.onclick=async function(e){await old.call(this,e);if(state.cardFrontCrop||state.cardBackCrop)try{document.getElementById("buildCardSheet")?.click();}catch{} };
  }
})();

/* SHOP STUDIO PRO v10.5 — ROBUST IMAGE UPLOAD / DROP PATCH
   Fixes file-input reliability, same-file reselect, large-image decode errors,
   drag & drop into workspaces, and stale v10.4 event handlers. */
(function(){
  const E=id=>document.getElementById(id);
  const safe=(fn)=>Promise.resolve().then(fn).catch(err=>{console.error("Shop Studio upload:",err);});

  async function loadImageFile(file){
    if(!file) throw new Error("No file selected.");
    if(!file.type || !file.type.startsWith("image/")) throw new Error(`Unsupported image type: ${file.type||"unknown"}`);
    try { return await fileToImage(file); }
    catch(first){
      // Fallback for browsers that fail object-URL decoding on large/local files.
      return await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(first);
        reader.onload=()=>{
          const img=new Image();
          img.onload=()=>resolve(img);
          img.onerror=()=>reject(first);
          img.src=reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
  }

  function resetInput(input){ try{ input.value=""; }catch{} }

  function replaceInput(id, handler){
    const old=E(id); if(!old) return null;
    const input=old.cloneNode(true);
    old.replaceWith(input);
    const label=input.closest("label");
    if(label){
      label.setAttribute("for",id);
      label.addEventListener("click",ev=>{
        if(ev.target===input)return;
        ev.preventDefault(); input.click();
      });
    }
    input.addEventListener("change",async ev=>{
      const files=[...ev.target.files];
      if(!files.length)return;
      try{ await handler(files,ev); }
      catch(err){
        console.error(err);
        const status=E(id.replace("Input","Status"));
        if(status)status.textContent=`Upload failed • ${err.message||"Please choose a JPG/PNG/WebP image."}`;
        else alert(`Could not load image. ${err.message||"Please choose a JPG, PNG or WebP file."}`);
      }finally{ resetInput(input); }
    });
    return input;
  }

  // Remove the older v10.4 listeners by replacing the inputs, then install one
  // reliable handler per image workflow.
  replaceInput("scanInput",async files=>{
    state.scanPages=[];
    for(const f of files){
      const img=await loadImageFile(f);
      state.scanPages.push({img,name:f.name});
    }
    state.scanImg=state.scanPages[0]?.img||null;
    if(state.scanImg){
      drawScan(); renderScanThumbs();
      const n=E("scanStatus"); if(n)n.textContent=`${state.scanPages.length} image${state.scanPages.length>1?"s":""} loaded • ${state.scanImg.width} × ${state.scanImg.height}px`;
      addHistory("Scanner","Imported images",`${state.scanPages.length} image(s)`);
    }
  });

  replaceInput("photoInput",async files=>{
    const f=files[0],img=await loadImageFile(f);
    state.photoImg=img;state.photoOriginal=img;
    drawPhoto();initPhotoCrop();
    const n=E("photoAiStatus");if(n)n.textContent=`Loaded • ${img.width} × ${img.height}px`;
    addHistory("Photo Studio","Opened photo",f.name);
  });

  replaceInput("bulkPhotoInput",async files=>{
    state.bulkPhotos=[];
    for(const f of files){try{state.bulkPhotos.push({name:f.name,img:await loadImageFile(f)});}catch(err){console.warn("Skipping",f.name,err);}}
    const n=E("photoAiStatus");if(n)n.textContent=state.bulkPhotos.length?`${state.bulkPhotos.length} bulk photo(s) ready.`:"No compatible images selected.";
  });

  replaceInput("cardImageInput",async files=>{
    const f=files[0],img=await loadImageFile(f);
    state.cardSourceImg=img;state.cardSourceType="image";
    const c=E("cardSourceCanvas"),ctx=c.getContext("2d");
    c.width=img.width;c.height=img.height;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(img,0,0);
    E("cardSourceEmpty").style.display="none";
    E("cardPageLabel").textContent=`${f.name} • ${img.width}×${img.height}`;
    // Smart Card v19 controls sizing through its own fitted canvas viewport.
    enableCardPerspective();
    try{ if(typeof rememberCardSource==="function")rememberCardSource(); }catch{}
  });

  replaceInput("resizeInput",async files=>{
    const f=files[0];state.resizeImg=await loadImageFile(f);drawResizePreview();
  });

  replaceInput("printInput",async files=>{
    state.printImages=[];
    for(const f of files){try{state.printImages.push(await loadImageFile(f));}catch(err){console.warn("Skipping",f.name,err);}}
    if(state.printImages.length){
      if(typeof rebuildPrintLayout==="function")rebuildPrintLayout();
      else E("printEmpty")?.style.setProperty("display","none");
      E("printStatus")&&(E("printStatus").textContent=`${state.printImages.length} image(s) loaded • drag to arrange.`);
    }else { state.printImages=[];state.printLayout=[]; const c=E("printCanvas"); if(c){c.width=1;c.height=1;} E("printEmpty")?.style.removeProperty("display"); E("printStatus")&&(E("printStatus").textContent="No compatible images selected."); }
  });

  replaceInput("compressInput",async files=>{
    const f=files[0];state.compressFile=f;
    const n=E("compressStatus");if(n)n.textContent=`Selected: ${f.name} • ${(f.size/1024).toFixed(1)} KB`;
  });

  replaceInput("ocrInput",async files=>{
    state.ocrFile=files[0];
    const n=E("ocrStatus");if(n)n.textContent=`Loaded • ${files[0].name}`;
  });

  // Reliable drop support for the major image workspaces.
  function makeDrop(stageId,inputId,label){
    const stage=E(stageId),input=E(inputId);if(!stage||!input)return;
    stage.classList.add("upload-drop-ready");
    const hint=document.createElement("div");hint.className="drop-hint";hint.textContent=`Drop ${label} here or use Upload`;
    stage.appendChild(hint);
    ["dragenter","dragover"].forEach(type=>stage.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();stage.classList.add("drag-over");}));
    ["dragleave","drop"].forEach(type=>stage.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();stage.classList.remove("drag-over");}));
    stage.addEventListener("drop",e=>{
      const files=[...e.dataTransfer.files].filter(f=>f.type.startsWith("image/"));
      if(!files.length)return;
      const dt=new DataTransfer();files.forEach(f=>dt.items.add(f));input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));
    });
  }
  makeDrop("scanCropStage","scanInput","document images");
  makeDrop("photoCanvasWrap","photoInput","a photo");
  makeDrop("cardPerspectiveStage","cardImageInput","a card/document image");
  makeDrop("printCanvasWrap","printInput","images");

  // Prevent stale browser/service-worker code from hiding the fact that a file was loaded.
  window.ShopStudioUploadReady=true;
})();

/* SHOP STUDIO PRO v10.7 — precision workspace, PDF export/editor, filenames and navigation polish */
(function(){
  const $id=id=>document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function dateSerial(){
    const d=new Date(), day=d.toISOString().slice(0,10).replace(/-/g,'');
    let n=Number(localStorage.getItem('shopstudio_serial_'+day)||0)+1;
    localStorage.setItem('shopstudio_serial_'+day,String(n));
    return `${day}-${String(n).padStart(3,'0')}`;
  }
  function cleanName(s){return String(s||'file').replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')||'file';}
  window.shopStudioFilename=(base,ext)=>`${cleanName(base)}-${dateSerial()}.${ext}`;

  // Higher workspace zoom for pin-point cropping.
  ['scanZoom','photoZoom','cardZoom'].forEach(id=>{
    const n=$id(id); if(n){n.max=400;n.title='Workspace zoom — use 200–400% for precise corner placement';}
  });

  // Move crop rectangles/polygons without changing their shape.
  function makeBoxMovable(box, getRect, setRect, boundsEl){
    if(!box||box.dataset.moveReady)return; box.dataset.moveReady='1';
    box.addEventListener('pointerdown',e=>{
      if(e.target.closest('.crop-handle,.card-point,.scan-point'))return;
      e.preventDefault();
      const start={x:e.clientX,y:e.clientY,r:{...getRect()}}; const br=boundsEl.getBoundingClientRect();
      box.setPointerCapture?.(e.pointerId);
      const move=ev=>{const dx=(ev.clientX-start.x)/br.width,dy=(ev.clientY-start.y)/br.height;const r=start.r;setRect({...r,x:clamp(r.x+dx,0,1-r.w),y:clamp(r.y+dy,0,1-r.h)});};
      const up=()=>{box.removeEventListener('pointermove',move);box.removeEventListener('pointerup',up);};box.addEventListener('pointermove',move);box.addEventListener('pointerup',up);
    });
  }
  function makePerspectiveMovable(layer, getPts, setPts, boundsEl){
    if(!layer||layer.dataset.moveReady)return;layer.dataset.moveReady='1';
    layer.addEventListener('pointerdown',e=>{
      if(e.target.closest('.card-point,.scan-point,svg'))return;
      e.preventDefault(); const start={x:e.clientX,y:e.clientY,pts:getPts().map(p=>({...p}))};const br=boundsEl.getBoundingClientRect();
      const move=ev=>{const dx=(ev.clientX-start.x)/br.width,dy=(ev.clientY-start.y)/br.height;setPts(start.pts.map(p=>({x:clamp(p.x+dx,0,1),y:clamp(p.y+dy,0,1)})));};
      const up=()=>{layer.removeEventListener('pointermove',move);layer.removeEventListener('pointerup',up);};layer.addEventListener('pointermove',move);layer.addEventListener('pointerup',up);
    });
  }
  document.addEventListener('pointerdown',e=>{
    const box=e.target.closest('#cardFreeCropBox');
    if(!box||e.target.closest('.crop-handle'))return;
    const canvas=$id('cardSourceCanvas'); if(!canvas||!state.cardFreeCrop)return; e.preventDefault();
    const start={x:e.clientX,y:e.clientY,r:{...state.cardFreeCrop}},br=canvas.getBoundingClientRect();
    const move=ev=>{const dx=(ev.clientX-start.x)/br.width,dy=(ev.clientY-start.y)/br.height;state.cardFreeCrop={...start.r,x:clamp(start.r.x+dx,0,1-start.r.w),y:clamp(start.r.y+dy,0,1-start.r.h)};if(typeof renderCardFreeCrop==='function')renderCardFreeCrop();};
    const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);
  },true);

  // Card perspective layer movement.
  const cLayer=$id('cardPerspectiveLayer'), cCanvas=$id('cardSourceCanvas');
  if(cLayer&&cCanvas){makePerspectiveMovable(cLayer,()=>state.cardPerspectivePts||[],pts=>{state.cardPerspectivePts=pts; if(typeof renderCardPerspectiveOverlay==='function')renderCardPerspectiveOverlay();},cCanvas);}
  // Free crop movement.
  const freeBox=$id('cardFreeCropBox');
  if(freeBox&&cCanvas){makeBoxMovable(freeBox,()=>state.cardFreeCrop||{x:0,y:0,w:1,h:1},r=>{state.cardFreeCrop=r; if(typeof renderCardFreeCrop==='function')renderCardFreeCrop();},cCanvas);}
  const photoBox=$id('photoCropBox'), photoCanvas=$id('photoCanvas');
  if(photoBox&&photoCanvas){makeBoxMovable(photoBox,()=>state.photoCrop||{x:.1,y:.1,w:.8,h:.8},r=>{state.photoCrop=r; if(typeof renderPhotoCrop==='function')renderPhotoCrop();},photoCanvas);}
  // Scanner perspective movement: drag the polygon area to move all four points.
  const scanLayer=$id('scanCropLayer'),scanCanvas=$id('scanCanvas');
  if(scanLayer&&scanCanvas){makePerspectiveMovable(scanLayer,()=>state.scanCropPts||[],pts=>{state.scanCropPts=pts; if(typeof renderScanPerspectiveOverlay==='function')renderScanPerspectiveOverlay();},scanCanvas);}

  // Print Sheet PDF export — preserves current arrangement at the selected DPI.
  async function canvasToPdf(canvas,paper,dpi,name){
    if(!canvas?.width||!window.PDFLib)return;
    const pdf=await PDFLib.PDFDocument.create();
    const bytes=await new Promise(r=>canvas.toBlob(async b=>r(await b.arrayBuffer()),'image/png'));
    const img=await pdf.embedPng(bytes);
    const base=paper==='a4'?[595.2756,841.8898]:[432,288];
    const landscape=canvas.width>canvas.height;
    const size=landscape?[Math.max(base[0],base[1]),Math.min(base[0],base[1])]:[Math.min(base[0],base[1]),Math.max(base[0],base[1])];
    pdf.addPage(size).drawImage(img,{x:0,y:0,width:size[0],height:size[1]});
    const out=await pdf.save({useObjectStreams:false});
    downloadBytes(out,window.shopStudioFilename(name,'pdf'),'application/pdf');
  }
  const pPdf=$id('downloadPrintSheetPdf');
  if(pPdf)pPdf.onclick=async()=>{if(!$id('printCanvas')?.width||!state.printLayout?.length){if(typeof rebuildPrintLayout==='function')rebuildPrintLayout();}const c=$id('printCanvas');if(c?.width)await canvasToPdf(c,$id('printPaper').value,$id('printDpi')?.value||300,'print-studio-sheet');};
  const cPdf=$id('downloadCardSheetPdf');
  if(cPdf)cPdf.onclick=async()=>{if(!state.cardSheetLayout?.length&&typeof rebuildCardSheet==='function')rebuildCardSheet();const c=$id('cardCanvas');if(c?.width)await canvasToPdf(c,$id('cardPaper').value,$id('cardPrintDpi')?.value||600,'smart-card-sheet');};

  // -------- PDF text + image layer editor --------
  const pdfState={pdf:null,bytes:null,page:1,scale:1.8,items:[],imageFile:null,imageBytes:null};
  async function loadEditPdf(file){
    pdfState.bytes=new Uint8Array(await file.arrayBuffer());
    const mod=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
    mod.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
    pdfState.pdf=await mod.getDocument({data:pdfState.bytes}).promise;pdfState.page=1;pdfState.items=[];await renderEditPdfPage();
  }
  async function renderEditPdfPage(){
    const c=$id('pdfEditCanvas'),empty=$id('pdfEditEmpty');if(!c||!pdfState.pdf)return;
    const page=await pdfState.pdf.getPage(pdfState.page),vp=page.getViewport({scale:pdfState.scale});c.width=Math.round(vp.width);c.height=Math.round(vp.height);await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;empty.style.display='none';$id('pdfEditPage').value=pdfState.page;$id('pdfEditStatus').textContent=`Page ${pdfState.page} of ${pdfState.pdf.numPages} • add text/images, then export.`;
  }
  $id('pdfEditInput')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{await loadEditPdf(f);}catch(err){console.error(err);$id('pdfEditStatus').textContent='Could not open this PDF.';}});
  $id('pdfEditPrev')?.addEventListener('click',async()=>{if(pdfState.pdf&&pdfState.page>1){pdfState.page--;await renderEditPdfPage();}});
  $id('pdfEditNext')?.addEventListener('click',async()=>{if(pdfState.pdf&&pdfState.page<pdfState.pdf.numPages){pdfState.page++;await renderEditPdfPage();}});
  $id('pdfEditPage')?.addEventListener('change',async e=>{if(pdfState.pdf){pdfState.page=clamp(Number(e.target.value)||1,1,pdfState.pdf.numPages);await renderEditPdfPage();}});
  $id('pdfEditImage')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)pdfState.imageFile=f;});
  $id('pdfAddText')?.addEventListener('click',()=>{const text=$id('pdfEditText').value.trim();if(!text)return;$id('pdfEditStatus').textContent=`Text layer ready: “${text}” • click Export Edited PDF to apply.`;pdfState.items.push({type:'text',page:pdfState.page,text,x:Number($id('pdfEditX').value)||40,y:Number($id('pdfEditY').value)||40,size:Number($id('pdfEditFontSize').value)||16});});
  $id('pdfAddImage')?.addEventListener('click',async()=>{if(!pdfState.imageFile){$id('pdfEditStatus').textContent='Choose an image first.';return;}pdfState.imageBytes=new Uint8Array(await pdfState.imageFile.arrayBuffer());pdfState.items.push({type:'image',page:pdfState.page,bytes:pdfState.imageBytes,x:Number($id('pdfEditX').value)||40,y:Number($id('pdfEditY').value)||40,w:Number($id('pdfEditImageW').value)||180,h:Number($id('pdfEditImageH').value)||100});$id('pdfEditStatus').textContent='Image layer added • click Export Edited PDF to apply.';});
  $id('pdfEditExport')?.addEventListener('click',async()=>{if(!pdfState.bytes||!window.PDFLib){$id('pdfEditStatus').textContent='Open a PDF first.';return;}try{const doc=await PDFLib.PDFDocument.load(pdfState.bytes);const font=await doc.embedFont(PDFLib.StandardFonts.Helvetica);for(const it of pdfState.items){const page=doc.getPage(it.page-1);if(it.type==='text')page.drawText(it.text,{x:it.x,y:page.getHeight()-it.y-it.size,size:it.size,font,color:PDFLib.rgb(0,0,0)});else{let im;try{im=await doc.embedPng(it.bytes);}catch{im=await doc.embedJpg(it.bytes);}page.drawImage(im,{x:it.x,y:page.getHeight()-it.y-it.h,width:it.w,height:it.h});}}const out=await doc.save({useObjectStreams:false});downloadBytes(out,window.shopStudioFilename('edited-pdf','pdf'),'application/pdf');$id('pdfEditStatus').textContent=`Exported edited PDF • ${pdfState.items.length} layer(s) applied.`;}catch(err){console.error(err);$id('pdfEditStatus').textContent='PDF export failed. Original PDF remains unchanged.';}});

  // Keep navigation useful: card-style navigation, while removing the large dashboard tool-card wall.
  document.title='Shop Studio Pro v10.7';
  const meta=document.querySelector('meta[name="shop-build"]');if(meta)meta.content='10.7.0';
  const bs=document.querySelector('.brand-subtitle');if(bs)bs.textContent='PRO TOOLKIT • V10.7';
})();

/* SHOP STUDIO PRO v10.8 — SMART CARD CROP REBUILD + ORIGINAL PDF EDIT */
(function(){
  const $=id=>document.getElementById(id), qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const status=(msg)=>{const n=$("cardStatus");if(n)n.textContent=msg;};
  const hideEl=n=>{if(n)n.style.display="none"};
  const showEl=n=>{if(n)n.style.display="block"};
  const replace=(id)=>{const n=$(id);if(!n)return null;const c=n.cloneNode(true);n.replaceWith(c);return c;};

  // --- Smart Card: one clean, authoritative crop controller ---
  const cardStage=$("cardPerspectiveStage"), canvas=$("cardSourceCanvas");
  if(!cardStage||!canvas)return;
  let freeDrag=null, perspDrag=null, moving=false;
  function layerGeometry(layer){
    if(!layer||!canvas.width)return null;
    const cr=canvas.getBoundingClientRect(), sr=cardStage.getBoundingClientRect();
    layer.style.left=(cr.left-sr.left)+"px";layer.style.top=(cr.top-sr.top)+"px";layer.style.width=cr.width+"px";layer.style.height=cr.height+"px";return {cr,sr};
  }
  function ensureFreeLayer(){
    let layer=$("cardFreeCropLayer");
    if(layer) layer.remove();
    layer=document.createElement("div");layer.id="cardFreeCropLayer";layer.className="card-free-crop-layer";
    layer.innerHTML='<div id="cardFreeCropBox" class="crop-box flex-card-box"><span class="crop-handle nw" data-h="nw"></span><span class="crop-handle n" data-h="n"></span><span class="crop-handle ne" data-h="ne"></span><span class="crop-handle e" data-h="e"></span><span class="crop-handle se" data-h="se"></span><span class="crop-handle s" data-h="s"></span><span class="crop-handle sw" data-h="sw"></span><span class="crop-handle w" data-h="w"></span></div>';
    cardStage.appendChild(layer);return layer;
  }
  function renderFree(){
    const l=$("cardFreeCropLayer"),b=$("cardFreeCropBox");if(!l||!b)return;layerGeometry(l);l.style.display=state.cardFreeCrop?"block":"none";
    if(state.cardFreeCrop){const r=state.cardFreeCrop;b.style.left=(r.x*100)+"%";b.style.top=(r.y*100)+"%";b.style.width=(r.w*100)+"%";b.style.height=(r.h*100)+"%";}
  }
  function startFree(){
    if(!canvas.width)return status("Open a PDF page or image first.");
    state.cardPerspectiveMode=false;state.cardPerspectivePts=null;hideEl($("cardPerspectiveLayer"));
    state.cardFreeCrop={x:.08,y:.08,w:.84,h:.84};renderFree();status("Flexible Crop active • drag corners or the box to move it.");
  }
  function bindFree(){
    const l=ensureFreeLayer(),b=$("cardFreeCropBox");
    qsa("#cardFreeCropBox .crop-handle").forEach(h=>h.addEventListener("pointerdown",e=>{if(!state.cardFreeCrop)return;e.preventDefault();h.setPointerCapture(e.pointerId);freeDrag={type:"resize",sx:e.clientX,sy:e.clientY,start:{...state.cardFreeCrop},handle:h.dataset.h};}));
    b.addEventListener("pointerdown",e=>{if(!state.cardFreeCrop||e.target.classList.contains("crop-handle"))return;e.preventDefault();b.setPointerCapture(e.pointerId);freeDrag={type:"move",sx:e.clientX,sy:e.clientY,start:{...state.cardFreeCrop}};});
    b.addEventListener("pointermove",e=>{
      if(!freeDrag)return;const cr=canvas.getBoundingClientRect(),dx=(e.clientX-freeDrag.sx)/cr.width,dy=(e.clientY-freeDrag.sy)/cr.height,s=freeDrag.start,n={...s};
      if(freeDrag.type==="move"){n.x=clamp(s.x+dx,0,1-s.w);n.y=clamp(s.y+dy,0,1-s.h);}
      else{const h=freeDrag.handle;if(h.includes("w")){const nx=clamp(s.x+dx,0,s.x+s.w-.03);n.w=s.w-(nx-s.x);n.x=nx;}if(h.includes("e"))n.w=clamp(s.w+dx,.03,1-s.x);if(h.includes("n")){const ny=clamp(s.y+dy,0,s.y+s.h-.03);n.h=s.h-(ny-s.y);n.y=ny;}if(h.includes("s"))n.h=clamp(s.h+dy,.03,1-s.y);}
      state.cardFreeCrop=n;renderFree();
    });
    b.addEventListener("pointerup",()=>freeDrag=null);b.addEventListener("pointercancel",()=>freeDrag=null);
  }
  bindFree();

  function bindButton(id,fn){const b=replace(id);if(b)b.addEventListener("click",fn);return b;}
  bindButton("cardFlexibleCropBtn",startFree);
  bindButton("applyCardFlexibleCrop",async()=>{
    if(!state.cardFreeCrop){startFree();return;}
    const r=state.cardFreeCrop,c=canvas,out=document.createElement("canvas");out.width=Math.max(1,Math.round(r.w*c.width));out.height=Math.max(1,Math.round(r.h*c.height));const ctx=out.getContext("2d");ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(c,r.x*c.width,r.y*c.height,r.w*c.width,r.h*c.height,0,0,out.width,out.height);
    if(!state.cardSourceOriginal)state.cardSourceOriginal=canvasClone(c); c.width=out.width;c.height=out.height;c.getContext("2d").drawImage(out,0,0);state.cardFreeCrop=null;state.cardPerspectiveMode=false;state.cardPerspectivePts=null;hideEl($("cardFreeCropLayer"));hideEl($("cardPerspectiveLayer"));status(`Flexible crop applied • ${out.width} × ${out.height}px • overlay closed.`);
  });
  bindButton("manualCardPerspectiveBtn",()=>{
    if(!canvas.width)return status("Open a PDF page or image first.");state.cardFreeCrop=null;hideEl($("cardFreeCropLayer"));state.cardPerspectivePts=cardDefaultPoints(canvas);state.cardPerspectiveMode=true;renderCardPerspectiveOverlay();status("4-Point Perspective active • drag corners or drag inside the polygon to move it.");
  });
  bindButton("resetCardCrop",()=>{if(canvas.width){state.cardFreeCrop=null;hideEl($("cardFreeCropLayer"));state.cardPerspectivePts=cardDefaultPoints(canvas);state.cardPerspectiveMode=true;renderCardPerspectiveOverlay();status("Crop reset to a centered PVC frame.");}});
  bindButton("moveCardCropBtn",()=>{if(state.cardPerspectiveMode)status("Drag inside the perspective polygon to move the entire crop.");else if(state.cardFreeCrop)status("Drag inside the flexible crop box to move the entire crop.");else status("Start Flexible Crop or 4-Point Perspective first.");});

  // Rebuild perspective handles and allow moving the entire polygon without changing shape.
  const pl=$("cardPerspectiveLayer");
  if(pl){
    const clean=pl.cloneNode(true);pl.replaceWith(clean);
    const layer=$("cardPerspectiveLayer"),poly=$("cardPerspectivePolygon");
    function render(){layerGeometry(layer);layer.style.display=state.cardPerspectiveMode?"block":"none";if(!state.cardPerspectiveMode||!state.cardPerspectivePts)return;poly.setAttribute("points",state.cardPerspectivePts.map(p=>`${p.x*100},${p.y*100}`).join(" "));qsa("#cardPerspectiveLayer .card-point").forEach((el,i)=>{el.style.left=(state.cardPerspectivePts[i].x*100)+"%";el.style.top=(state.cardPerspectivePts[i].y*100)+"%";});}
    renderCardPerspectiveOverlay=render;
    qsa("#cardPerspectiveLayer .card-point").forEach(pt=>pt.addEventListener("pointerdown",e=>{if(!state.cardPerspectiveMode)return;e.preventDefault();pt.setPointerCapture(e.pointerId);perspDrag={type:"point",idx:+pt.dataset.point,sx:e.clientX,sy:e.clientY,start:state.cardPerspectivePts.map(p=>({...p}))};}));
    layer.addEventListener("pointerdown",e=>{if(!state.cardPerspectiveMode||e.target.classList.contains("card-point"))return;e.preventDefault();layer.setPointerCapture(e.pointerId);perspDrag={type:"move",sx:e.clientX,sy:e.clientY,start:state.cardPerspectivePts.map(p=>({...p}))};});
    layer.addEventListener("pointermove",e=>{if(!perspDrag)return;const cr=canvas.getBoundingClientRect(),dx=(e.clientX-perspDrag.sx)/cr.width,dy=(e.clientY-perspDrag.sy)/cr.height;
      if(perspDrag.type==="move"){const minX=Math.min(...perspDrag.start.map(p=>p.x)),maxX=Math.max(...perspDrag.start.map(p=>p.x)),minY=Math.min(...perspDrag.start.map(p=>p.y)),maxY=Math.max(...perspDrag.start.map(p=>p.y));const ox=clamp(dx,-minX,1-maxX),oy=clamp(dy,-minY,1-maxY);state.cardPerspectivePts=perspDrag.start.map(p=>({x:p.x+ox,y:p.y+oy}));}
      else{const n=perspDrag.start.map(p=>({...p}));n[perspDrag.idx]={x:clamp(n[perspDrag.idx].x+dx),y:clamp(n[perspDrag.idx].y+dy)};state.cardPerspectivePts=n;}render();
    });
    layer.addEventListener("pointerup",()=>perspDrag=null);layer.addEventListener("pointercancel",()=>perspDrag=null);window.addEventListener("resize",render);
  }

  // Auto detect never blocks the operator with an alert; fallback is a usable full-frame/manual crop.
  bindButton("autoDetectCardBtn",async()=>{
    if(!canvas.width){status("Open a PDF page or image first.");return;}const b=$("autoDetectCardBtn");b.disabled=true;b.textContent="Detecting…";
    try{let pts=await bestDocumentPoints(canvas,true);if(!pts)pts=defaultCardQuad(canvas);setCardPerspectivePointsFromPixels(pts,canvas);status("Best document boundary selected • adjust corners if needed, then Apply & Save.");}
    catch(e){console.warn(e);state.cardPerspectivePts=defaultCardQuad(canvas);state.cardPerspectiveMode=true;renderCardPerspectiveOverlay();status("Auto detection used a safe manual frame • adjust the four corners.");}
    finally{b.disabled=false;b.textContent="Auto Detect Corners";}
  });
  bindButton("autoSplitCardsBtn",async()=>{
    if(!canvas.width){status("Open a PDF page or image first.");return;}const b=$("autoSplitCardsBtn");b.disabled=true;b.textContent="Finding…";
    try{let found=await detectCardQuadrilaterals(canvas,12);if(!found.length)found=detectCardByLongLines(canvas,12);if(!found.length){const p=await bestDocumentPoints(canvas,true);if(p)found=[{points:p,score:1}];}
      if(!found.length){found=[{points:[{x:0,y:0},{x:canvas.width,y:0},{x:canvas.width,y:canvas.height},{x:0,y:canvas.height}],score:.1}];status("No clear boundary found • using full image. Adjust manually.");}
      state.detectedCards=found;const grid=$("detectedCardsGrid"),panel=$("detectedCardsPanel");grid.innerHTML="";panel.hidden=false;
      for(let i=0;i<Math.min(found.length,8);i++){const crop=await perspectiveCardCanvas(canvas,found[i].points.map(p=>({x:p.x/canvas.width,y:p.y/canvas.height})),+$('cardExportDpi').value||600),wrap=document.createElement("div");wrap.className="detected-card";const cvw=document.createElement("canvas");wrap.appendChild(cvw);previewCardCanvasTo(cvw,crop);const actions=document.createElement("div");actions.className="detected-card-actions";for(const [txt,fn] of [["Set Front",()=>{state.cardFrontCrop=crop;previewCardCanvas("cardFrontPreview",crop)}],["Set Back",()=>{state.cardBackCrop=crop;previewCardCanvas("cardBackPreview",crop)}],["Use to Edit",()=>{setCardPerspectivePointsFromPixels(found[i].points,canvas);status(`Candidate ${i+1} loaded into the 4-point editor.`)}]]){const x=document.createElement("button");x.className="mini-btn";x.textContent=txt;x.onclick=fn;actions.appendChild(x);}wrap.appendChild(actions);grid.appendChild(wrap);}
      if(found.length>=2){state.cardFrontCrop=await perspectiveCardCanvas(canvas,found[0].points.map(p=>({x:p.x/canvas.width,y:p.y/canvas.height})),+$('cardExportDpi').value||600);state.cardBackCrop=await perspectiveCardCanvas(canvas,found[1].points.map(p=>({x:p.x/canvas.width,y:p.y/canvas.height})),$('cardExportDpi').value||600);previewCardCanvas("cardFrontPreview",state.cardFrontCrop);previewCardCanvas("cardBackPreview",state.cardBackCrop);}
      status(`${found.length} candidate document(s) found • choose Front/Back or Use to Edit.`);
    }catch(e){console.warn(e);status("Auto split could not find two clear boundaries • manual crop remains ready.");}finally{b.disabled=false;b.textContent="Find Front + Back";}
  });
  bindButton("saveCardCrop",async()=>{
    if(!canvas.width){status("Open a PDF page or image first.");return;}if(!state.cardPerspectiveMode||!state.cardPerspectivePts){state.cardPerspectivePts=defaultCardQuad(canvas);state.cardPerspectiveMode=true;renderCardPerspectiveOverlay();status("Perspective crop opened • adjust four corners, then click Apply & Save again.");return;}
    try{const dpi=+$('cardExportDpi').value||600,crop=await perspectiveCardCanvas(canvas,state.cardPerspectivePts,dpi),action=$("cardCropAction").value;if(action==="front")state.cardFrontCrop=crop;else state.cardBackCrop=crop;previewCardCanvas(action==="front"?"cardFrontPreview":"cardBackPreview",crop);state.cardPerspectiveMode=false;state.cardPerspectivePts=null;hideEl($("cardPerspectiveLayer"));status(`${action.toUpperCase()} crop saved • exact PVC 85.6 × 54 mm • ${crop.width} × ${crop.height}px.`);}
    catch(e){console.error(e);status("Perspective crop failed • original source preserved.");}
  });
  bindButton("exportCardCropImage",async()=>{try{const action=$("cardCropAction").value,dpi=+$('cardExportDpi').value||600;let crop=action==="front"?state.cardFrontCrop:state.cardBackCrop;if(state.cardPerspectiveMode&&state.cardPerspectivePts)crop=await perspectiveCardCanvas(canvas,state.cardPerspectivePts,dpi);if(!crop){status("Apply Front/Back crop first.");return;}downloadCanvas(crop,`pvc-${action}-${dpi}dpi`,$("cardOutputFormat").value||"image/png",1);status(`Exported ${action.toUpperCase()} • ${crop.width} × ${crop.height}px • lossless PNG.`);}catch(e){console.error(e);status("PVC export failed • source preserved.");}});

  // Re-render overlays correctly after zoom/resize.
  $("cardZoom")?.addEventListener("input",()=>{applyPreviewZoom("cardSourceCanvas","cardZoom","cardZoomValue",()=>{renderFree();renderCardPerspectiveOverlay();});});
  window.addEventListener("resize",()=>{renderFree();renderCardPerspectiveOverlay();});

  // --- Original PDF editing: add a practical cover/replace operation on the actual PDF page ---
  const pdfEditorToolbar=$("pdfEditExport")?.parentElement;
  if(pdfEditorToolbar && !$("pdfCoverExisting")){
    const b=document.createElement("button");b.id="pdfCoverExisting";b.className="mini-btn";b.textContent="Edit Existing Area";pdfEditorToolbar.insertBefore(b,$("pdfEditExport"));
  }
  // Replace the PDF editor export handler with support for cover + replacement text/image.
  const exp=$("pdfEditExport");if(exp){const clean=exp.cloneNode(true);exp.replaceWith(clean);clean.addEventListener("click",async()=>{
    if(!window.pdfStateForV108?.bytes && !window.__shopPdfState){/* use state exposed below */}
  });}
  // Reuse the existing editor state by exposing it when available; if not, add a safe second editor state.
  // Existing v10.7 closure is private, so we provide a parallel editor state that reads the same input.
  const pe={pdf:null,bytes:null,page:1,scale:2.5,items:[],imageFile:null};
  async function loadPdfForEdit(f){pe.bytes=new Uint8Array(await f.arrayBuffer());const mod=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');mod.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';pe.pdf=await mod.getDocument({data:pe.bytes}).promise;pe.page=1;pe.items=[];await renderPe();}
  async function renderPe(){const c=$("pdfEditCanvas"),empty=$("pdfEditEmpty");if(!c||!pe.pdf)return;const pg=await pe.pdf.getPage(pe.page),vp=pg.getViewport({scale:pe.scale});c.width=Math.round(vp.width);c.height=Math.round(vp.height);await pg.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;if(empty)empty.style.display="none";$("pdfEditPage").value=pe.page;$("pdfEditStatus").textContent=`Original PDF page ${pe.page}/${pe.pdf.numPages} • add text/image or cover existing content.`;}
  const inp=$("pdfEditInput");if(inp){const ci=replace("pdfEditInput");ci.addEventListener("change",async e=>{const f=e.target.files?.[0];if(f)try{await loadPdfForEdit(f)}catch(err){console.error(err);$("pdfEditStatus").textContent="Could not open this PDF.";}});}
  ["pdfEditPrev","pdfEditNext","pdfEditPage","pdfAddText","pdfAddImage","pdfCoverExisting","pdfEditExport"].forEach(rebind=>{const n=$(rebind);if(n){const c=n.cloneNode(true);n.replaceWith(c);}});
  $("pdfEditPrev")?.addEventListener("click",async()=>{if(pe.pdf&&pe.page>1){pe.page--;await renderPe();}});$("pdfEditNext")?.addEventListener("click",async()=>{if(pe.pdf&&pe.page<pe.pdf.numPages){pe.page++;await renderPe();}});$("pdfEditPage")?.addEventListener("change",async e=>{if(pe.pdf){pe.page=Math.max(1,Math.min(pe.pdf.numPages,Number(e.target.value)||1));await renderPe();}});
  $("pdfEditImage")?.addEventListener("change",e=>{pe.imageFile=e.target.files?.[0]||null;});
  $("pdfAddText")?.addEventListener("click",()=>{const t=$("pdfEditText").value.trim();if(!t||!pe.pdf)return;pe.items.push({type:"text",page:pe.page,text:t,x:+$("pdfEditX").value||40,y:+$("pdfEditY").value||40,size:+$("pdfEditFontSize").value||16});$("pdfEditStatus").textContent="Text replacement/addition queued for the original PDF.";});
  $("pdfAddImage")?.addEventListener("click",async()=>{if(!pe.pdf||!pe.imageFile)return;pe.items.push({type:"image",page:pe.page,bytes:new Uint8Array(await pe.imageFile.arrayBuffer()),x:+$("pdfEditX").value||40,y:+$("pdfEditY").value||40,w:+$("pdfEditImageW").value||180,h:+$("pdfEditImageH").value||100});$("pdfEditStatus").textContent="Image replacement/addition queued for the original PDF.";});
  $("pdfCoverExisting")?.addEventListener("click",()=>{if(!pe.pdf)return;pe.items.push({type:"cover",page:pe.page,x:+$("pdfEditCoverX").value||40,y:+$("pdfEditCoverY").value||40,w:+$("pdfEditCoverW").value||180,h:+$("pdfEditCoverH").value||40});$("pdfEditStatus").textContent="Existing PDF area queued for cover/edit. Add replacement text or image, then export.";});
  $("pdfEditExport")?.addEventListener("click",async()=>{if(!pe.bytes||!window.PDFLib){$("pdfEditStatus").textContent="Open the original PDF first.";return;}try{const doc=await PDFLib.PDFDocument.load(pe.bytes),font=await doc.embedFont(PDFLib.StandardFonts.Helvetica);for(const it of pe.items){const pg=doc.getPage(it.page-1);if(it.type==="cover"){pg.drawRectangle({x:it.x,y:pg.getHeight()-it.y-it.h,width:it.w,height:it.h,color:PDFLib.rgb(1,1,1)});}else if(it.type==="text"){pg.drawText(it.text,{x:it.x,y:pg.getHeight()-it.y-it.size,size:it.size,font,color:PDFLib.rgb(0,0,0)});}else{let im;try{im=await doc.embedPng(it.bytes)}catch{im=await doc.embedJpg(it.bytes)}pg.drawImage(im,{x:it.x,y:pg.getHeight()-it.y-it.h,width:it.w,height:it.h});}}const out=await doc.save({useObjectStreams:false});downloadBytes(out,window.shopStudioFilename("edited-original-pdf","pdf"),"application/pdf");$("pdfEditStatus").textContent=`Original PDF exported with ${pe.items.length} edit(s).`;}catch(err){console.error(err);$("pdfEditStatus").textContent="PDF edit failed • original PDF was not changed.";}});

  document.title="Shop Studio Pro v10.8";
  const meta=document.querySelector('meta[name="shop-build"]');if(meta)meta.content="10.8.0";
})();

/* v10.9 focused crop workflow + theme + scanner flip */
(function(){
  const $=id=>document.getElementById(id), clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  let scanMode='perspective', scanFlipped=false, cardMode='perspective';

  // Theme persists locally.
  const themeBtn=$('themeToggle');
  function setTheme(light){document.body.classList.toggle('light-theme',light);if(themeBtn)themeBtn.textContent=light?'☾ Dark':'☀ Light';localStorage.setItem('shopStudioTheme',light?'light':'dark');}
  setTheme(localStorage.getItem('shopStudioTheme')==='light');
  themeBtn?.addEventListener('click',()=>setTheme(!document.body.classList.contains('light-theme')));

  // Horizontal flip belongs beside Rotate and affects scanner preview/export pixels.
  const baseDraw=window.drawScan;
  if(typeof baseDraw==='function') window.drawScan=function(){baseDraw();const c=$('scanCanvas');if(scanFlipped&&c?.width){const t=document.createElement('canvas');t.width=c.width;t.height=c.height;t.getContext('2d').drawImage(c,0,0);const x=c.getContext('2d');x.save();x.clearRect(0,0,c.width,c.height);x.translate(c.width,0);x.scale(-1,1);x.drawImage(t,0,0);x.restore();if(state.scanCropMode)renderScanPerspectiveOverlay();}};
  $('scanFlipHorizontal')?.addEventListener('click',()=>{scanFlipped=!scanFlipped;$('scanFlipHorizontal').classList.toggle('active',scanFlipped);window.drawScan?.();});

  function markMode(prefix,mode){
    if(prefix==='scan'){$('scanCropBtn')?.classList.toggle('active',mode==='crop');$('scanManualCropBtn')?.classList.toggle('active',mode==='perspective');}
    else {$('cardSimpleCropBtn')?.classList.toggle('active',mode==='crop');$('manualCardPerspectiveBtn')?.classList.toggle('active',mode==='perspective');}
  }
  function rectFromPts(pts){const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);return {l:Math.min(...xs),r:Math.max(...xs),t:Math.min(...ys),b:Math.max(...ys)};}
  function rectPts(r){return [{x:r.l,y:r.t},{x:r.r,y:r.t},{x:r.r,y:r.b},{x:r.l,y:r.b}];}
  function normalizeScanRect(){if(state.scanCropPts)state.scanCropPts=rectPts(rectFromPts(state.scanCropPts));renderScanPerspectiveOverlay();}

  // Edge handles for Photoshop-like rectangular crop adjustments.
  const scanLayer=$('scanCropLayer');
  if(scanLayer && !scanLayer.querySelector('.scan-edge')){
    ['top','right','bottom','left'].forEach(side=>{const h=document.createElement('span');h.className='scan-edge '+side;h.dataset.edge=side;scanLayer.appendChild(h);});
  }
  if(scanLayer && !scanLayer.querySelector('.scan-move-surface')){
    const m=document.createElement('span');m.className='scan-move-surface';scanLayer.insertBefore(m,scanLayer.firstChild);
    let move=null;
    m.addEventListener('pointerdown',e=>{if(scanMode!=='crop'||!state.scanCropMode||!state.scanCropPts)return;e.preventDefault();m.setPointerCapture?.(e.pointerId);move={sx:e.clientX,sy:e.clientY,r:rectFromPts(state.scanCropPts)};});
    m.addEventListener('pointermove',e=>{if(!move)return;const cr=$('scanCanvas').getBoundingClientRect(),dx=(e.clientX-move.sx)/cr.width,dy=(e.clientY-move.sy)/cr.height,r=move.r,w=r.r-r.l,h=r.b-r.t;r.l=clamp(r.l+dx,0,1-w);r.r=r.l+w;r.t=clamp(r.t+dy,0,1-h);r.b=r.t+h;state.scanCropPts=rectPts(r);renderScanPerspectiveOverlay();});
    m.addEventListener('pointerup',()=>move=null);m.addEventListener('pointercancel',()=>move=null);
  }
  const baseRender=window.renderScanPerspectiveOverlay;
  if(typeof baseRender==='function') window.renderScanPerspectiveOverlay=function(){baseRender();if(!state.scanCropMode||!state.scanCropPts)return;const r=rectFromPts(state.scanCropPts);scanLayer?.querySelectorAll('.scan-edge').forEach(h=>{const side=h.dataset.edge;if(scanMode!=='crop'){h.style.display='none';return;}h.style.display='block';h.style.left=((side==='left'?r.l:side==='right'?r.r:(r.l+r.r)/2)*100)+'%';h.style.top=((side==='top'?r.t:side==='bottom'?r.b:(r.t+r.b)/2)*100)+'%';});};
  scanLayer?.querySelectorAll('.scan-edge').forEach(h=>{let start=null;h.addEventListener('pointerdown',e=>{if(scanMode!=='crop'||!state.scanCropPts)return;e.preventDefault();e.stopImmediatePropagation();h.setPointerCapture(e.pointerId);start={x:e.clientX,y:e.clientY,r:rectFromPts(state.scanCropPts)};});h.addEventListener('pointermove',e=>{if(!start)return;const cr=$('scanCanvas').getBoundingClientRect(),dx=(e.clientX-start.x)/cr.width,dy=(e.clientY-start.y)/cr.height,r={...start.r};if(h.dataset.edge==='left')r.l=clamp(start.r.l+dx,0,r.r-.02);if(h.dataset.edge==='right')r.r=clamp(start.r.r+dx,r.l+.02,1);if(h.dataset.edge==='top')r.t=clamp(start.r.t+dy,0,r.b-.02);if(h.dataset.edge==='bottom')r.b=clamp(start.r.b+dy,r.t+.02,1);state.scanCropPts=rectPts(r);renderScanPerspectiveOverlay();});h.addEventListener('pointerup',()=>start=null);h.addEventListener('pointercancel',()=>start=null);});

  // In normal Crop, corner motion remains rectangular instead of becoming perspective.
  scanLayer?.querySelectorAll('.scan-point').forEach(pt=>pt.addEventListener('pointermove',e=>{if(scanMode!=='crop'||!state.scanCropMode||!state.scanCropPts||!(e.buttons&1))return;e.stopImmediatePropagation();const cr=$('scanCanvas').getBoundingClientRect(),x=clamp((e.clientX-cr.left)/cr.width),y=clamp((e.clientY-cr.top)/cr.height),i=+pt.dataset.point,r=rectFromPts(state.scanCropPts);if(i===0){r.l=Math.min(x,r.r-.02);r.t=Math.min(y,r.b-.02)}if(i===1){r.r=Math.max(x,r.l+.02);r.t=Math.min(y,r.b-.02)}if(i===2){r.r=Math.max(x,r.l+.02);r.b=Math.max(y,r.t+.02)}if(i===3){r.l=Math.min(x,r.r-.02);r.b=Math.max(y,r.t+.02)}state.scanCropPts=rectPts(r);renderScanPerspectiveOverlay();},true));

  async function openScannerCrop(mode){if(!$('scanCanvas')?.width)return alert('Upload or scan a document first.');scanMode=mode;markMode('scan',mode);$('deskewBtn')?.click();setTimeout(()=>{if(mode==='crop')normalizeScanRect();},180);}
  $('scanCropBtn')?.addEventListener('click',()=>openScannerCrop('crop'));
  $('scanManualCropBtn')?.addEventListener('click',e=>{e.stopImmediatePropagation();openScannerCrop('perspective');},true);

  // Immediately detect after image upload/scan import.
  $('scanInput')?.addEventListener('change',()=>setTimeout(()=>openScannerCrop('perspective'),250));
  $('cameraInput')?.addEventListener('change',()=>setTimeout(()=>openScannerCrop('perspective'),250));

  // Smart Card: only two visible crop choices. Crop uses existing flexible rectangle; perspective auto-detects.
  async function openCardCrop(mode){const c=$('cardSourceCanvas');if(!c?.width)return alert('Open a PDF or image first.');cardMode=mode;markMode('card',mode);if(mode==='crop'){$('cardFlexibleCropBtn')?.click();}else{$('autoDetectCardBtn')?.click();}}
  $('cardSimpleCropBtn')?.addEventListener('click',()=>openCardCrop('crop'));
  $('manualCardPerspectiveBtn')?.addEventListener('click',e=>{e.stopImmediatePropagation();openCardCrop('perspective');},true);
  $('cardImageInput')?.addEventListener('change',()=>setTimeout(()=>openCardCrop('perspective'),350));

  // Enter applies whichever visible crop workspace is active.
  document.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.target?.matches('input,textarea,select'))return;const active=document.querySelector('.section.active')?.id;if(active==='scanner'&&state.scanCropMode){e.preventDefault();$('applyScanCrop')?.click();}if(active==='cards'){if(cardMode==='crop'&&state.cardFreeCrop){e.preventDefault();$('applyCardFlexibleCrop')?.click();}else if(state.cardPerspectiveMode){e.preventDefault();$('saveCardCrop')?.click();}}});

  // Make the card perspective overlay movable without a separate Move button.
  const cardLayer=$('cardPerspectiveLayer'),cardCanvas=$('cardSourceCanvas');let move=null;
  cardLayer?.addEventListener('pointerdown',e=>{if(!state.cardPerspectiveMode||e.target.classList.contains('card-point'))return;e.preventDefault();move={x:e.clientX,y:e.clientY,p:state.cardPerspectivePts.map(p=>({...p}))};cardLayer.setPointerCapture?.(e.pointerId);},true);
  cardLayer?.addEventListener('pointermove',e=>{if(!move)return;const cr=cardCanvas.getBoundingClientRect(),dx=(e.clientX-move.x)/cr.width,dy=(e.clientY-move.y)/cr.height,minx=Math.min(...move.p.map(p=>p.x)),maxx=Math.max(...move.p.map(p=>p.x)),miny=Math.min(...move.p.map(p=>p.y)),maxy=Math.max(...move.p.map(p=>p.y)),adx=clamp(dx,-minx,1-maxx),ady=clamp(dy,-miny,1-maxy);state.cardPerspectivePts=move.p.map(p=>({x:p.x+adx,y:p.y+ady}));renderCardPerspectiveOverlay();},true);cardLayer?.addEventListener('pointerup',()=>move=null,true);cardLayer?.addEventListener('pointercancel',()=>move=null,true);

  document.title='Shop Studio Pro v10.9';document.querySelector('meta[name="shop-build"]')?.setAttribute('content','10.9.0');
})();
/* v10.9.1 crop crosshair guides + Smart Card PDF auto-detect */
(function(){
 const $=id=>document.getElementById(id),layer=$('scanCropLayer');
 if(layer&&!layer.querySelector('.crop-guide-line')){const v=document.createElement('i'),h=document.createElement('i');v.className='crop-guide-line v';h.className='crop-guide-line h';layer.append(v,h);}
 const old=window.renderScanPerspectiveOverlay;if(typeof old==='function')window.renderScanPerspectiveOverlay=function(){old();if(!state.scanCropPts||!state.scanCropMode)return;const xs=state.scanCropPts.map(p=>p.x),ys=state.scanCropPts.map(p=>p.y),l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys),v=layer?.querySelector('.crop-guide-line.v'),h=layer?.querySelector('.crop-guide-line.h');if(v){v.style.left=((l+r)/2*100)+'%';v.style.top=(t*100)+'%';v.style.bottom=((1-b)*100)+'%';}if(h){h.style.top=((t+b)/2*100)+'%';h.style.left=(l*100)+'%';h.style.right=((1-r)*100)+'%';}};
 // Card PDF auto-detection is triggered after the PDF page actually finishes rendering in loadPdfViaModule().
})();

/* SHOP STUDIO PRO v11.0 — reliable scanner/PDF + flexible crop + print rebuild */
(function(){
  const E=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  if(!window.state && typeof state==='undefined') return;
  const S=typeof state!=='undefined'?state:window.state;
  const pdfModule=async()=>{const m=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');m.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';return m;};
  const imageFromDataUrl=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src;});
  const canvasImage=async c=>imageFromDataUrl(c.toDataURL('image/png'));
  const fileImage=async file=>{try{return await fileToImage(file);}catch(e){return await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>imageFromDataUrl(r.result).then(resolve,reject);r.readAsDataURL(file);});}};
  const thumbData=img=>{const c=document.createElement('canvas'), maxW=140,maxH=180,s=Math.min(maxW/img.width,maxH/img.height,1);c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.82);};

  // 1) Scanner thumbnails: never use revoked object URLs. Every thumbnail gets a durable data URL.
  window.renderScanThumbs=renderScanThumbs=function(){
    const wrap=E('scanPages');if(!wrap)return;
    wrap.innerHTML='';
    S.scanPages.forEach((p,i)=>{const im=document.createElement('img');im.className='page-thumb';im.dataset.i=i;im.alt=p.name||`Page ${i+1}`;im.title=p.name||`Page ${i+1}`;try{im.src=p.thumb||thumbData(p.img);p.thumb=im.src;}catch{im.src=p.img.src||'';}im.onclick=()=>{S.scanCurrentIndex=i;S.scanImg=p.img;drawScan();};wrap.appendChild(im);});
  };

  async function pdfPagesToImages(file,scale=2){
    const mod=await pdfModule(),pdf=await mod.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,out=[];
    for(let n=1;n<=pdf.numPages;n++){
      const page=await pdf.getPage(n),vp=page.getViewport({scale}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;const img=await canvasImage(c);out.push({img,name:`${file.name} • page ${n}`,thumb:thumbData(img),sourceType:'pdf',sourcePage:n});
    }
    return out;
  }

  // Separate Scanner PDF button, as requested.
  const scanButtons=E('scanner')?.querySelector('.workspace-head .button-row');
  if(scanButtons&&!E('scanPdfInput')){
    const lab=document.createElement('label');lab.className='ghost-btn';lab.textContent='Load PDF';const inp=document.createElement('input');inp.id='scanPdfInput';inp.type='file';inp.accept='application/pdf';inp.hidden=true;lab.appendChild(inp);scanButtons.insertBefore(lab,scanButtons.firstChild?.nextSibling||null);
    inp.addEventListener('change',async()=>{const f=inp.files?.[0];if(!f)return;const st=E('scanStatus');try{if(st)st.textContent='Loading PDF pages…';const pages=await pdfPagesToImages(f,2.2);S.scanPages=pages;S.scanImg=pages[0]?.img||null;if(S.scanImg){drawScan();renderScanThumbs();E('scanEmpty')&&(E('scanEmpty').style.display='none');if(st)st.textContent=`PDF loaded • ${pages.length} page(s) • scanner options work on every page.`;addHistory('Scanner','Loaded PDF',`${pages.length} page(s)`);}}catch(err){console.error(err);if(st)st.textContent='Could not load PDF. Use a modern Chromium browser with internet access for the PDF renderer.';}finally{inp.value='';}});
  }

  // Scanner defaults saved locally; no repeated prompt/dialog.
  const scanSide=E('scanner')?.querySelector('.tool-sidebar');
  if(scanSide&&!E('scannerDefaultsGroup')){
    const g=document.createElement('div');g.className='control-group';g.id='scannerDefaultsGroup';g.innerHTML='<h4>Scanner Settings</h4><div class="v11-settings-note">Saved on this PC and restored automatically for every new job.</div><div class="v11-toolbar"><button class="mini-btn" id="saveScannerDefaults" type="button">Save Default</button><button class="mini-btn" id="resetScannerDefaults" type="button">Reset</button></div><div class="v11-inline-status" id="scannerDefaultsStatus">Auto restore enabled</div>';scanSide.appendChild(g);
  }
  const scanSettingIds=['scanFilter','scanRotate','shadowStrength','ocrSharpen','scanZoom'];
  function currentScannerDefaults(){const o={};scanSettingIds.forEach(id=>{const n=E(id);if(n)o[id]=n.value;});return o;}
  function applyScannerDefaults(){let o={};try{o=JSON.parse(localStorage.getItem('shopstudio_scanner_defaults')||'{}');}catch{}scanSettingIds.forEach(id=>{const n=E(id);if(n&&o[id]!=null)n.value=o[id];});try{drawScan();applyPreviewZoom('scanCanvas','scanZoom','scanZoomValue',renderScanPerspectiveOverlay);}catch{}}
  E('saveScannerDefaults')?.addEventListener('click',()=>{localStorage.setItem('shopstudio_scanner_defaults',JSON.stringify(currentScannerDefaults()));const n=E('scannerDefaultsStatus');if(n)n.textContent='Default scanner settings saved.';});
  E('resetScannerDefaults')?.addEventListener('click',()=>{localStorage.removeItem('shopstudio_scanner_defaults');const base={scanFilter:'original',scanRotate:'0',shadowStrength:'0',ocrSharpen:'0',scanZoom:'100'};Object.entries(base).forEach(([id,v])=>{if(E(id))E(id).value=v;});try{drawScan();}catch{}const n=E('scannerDefaultsStatus');if(n)n.textContent='Defaults reset.';});
  applyScannerDefaults();

  // Generic 8-handle crop controller. Crop rectangle moves as a whole and every edge/corner is draggable.
  function cropController(host,canvas,box){
    let rect={x:.08,y:.08,w:.84,h:.84},drag=null;
    const handles=['nw','n','ne','e','se','s','sw','w'];
    if(!box){box=document.createElement('div');box.className='v11-crop-box';handles.forEach(h=>{const s=document.createElement('span');s.className=`v11-crop-handle ${h}`;s.dataset.h=h;box.appendChild(s);});host.appendChild(box);}
    function geom(){const cr=canvas.getBoundingClientRect(),hr=host.getBoundingClientRect();return {left:cr.left-hr.left+host.scrollLeft,top:cr.top-hr.top+host.scrollTop,w:cr.width,h:cr.height};}
    function render(){const g=geom();box.style.display='block';box.style.left=(g.left+rect.x*g.w)+'px';box.style.top=(g.top+rect.y*g.h)+'px';box.style.width=(rect.w*g.w)+'px';box.style.height=(rect.h*g.h)+'px';}
    function set(r){rect={x:clamp(r.x,0,.98),y:clamp(r.y,0,.98),w:clamp(r.w,.02,1),h:clamp(r.h,.02,1)};if(rect.x+rect.w>1)rect.w=1-rect.x;if(rect.y+rect.h>1)rect.h=1-rect.y;render();}
    box.addEventListener('pointerdown',e=>{e.preventDefault();const h=e.target.dataset.h||'move',g=geom();drag={h,sx:e.clientX,sy:e.clientY,r:{...rect},g};box.setPointerCapture?.(e.pointerId);});
    box.addEventListener('pointermove',e=>{if(!drag)return;const dx=(e.clientX-drag.sx)/drag.g.w,dy=(e.clientY-drag.sy)/drag.g.h,r={...drag.r},h=drag.h,min=.02;if(h==='move'){r.x=clamp(r.x+dx,0,1-r.w);r.y=clamp(r.y+dy,0,1-r.h);}else{if(h.includes('w')){const nx=clamp(r.x+dx,0,r.x+r.w-min);r.w+=r.x-nx;r.x=nx;}if(h.includes('e'))r.w=clamp(r.w+dx,min,1-r.x);if(h.includes('n')){const ny=clamp(r.y+dy,0,r.y+r.h-min);r.h+=r.y-ny;r.y=ny;}if(h.includes('s'))r.h=clamp(r.h+dy,min,1-r.y);}rect=r;render();});
    const up=()=>drag=null;box.addEventListener('pointerup',up);box.addEventListener('pointercancel',up);window.addEventListener('resize',render);
    return {show:(r)=>{if(r)set(r);else render();},hide:()=>box.style.display='none',get:()=>({...rect}),set};
  }
  async function cropImage(img,r){const c=document.createElement('canvas'),sx=Math.round(r.x*img.width),sy=Math.round(r.y*img.height),sw=Math.max(1,Math.round(r.w*img.width)),sh=Math.max(1,Math.round(r.h*img.height));c.width=Math.min(sw,img.width-sx);c.height=Math.min(sh,img.height-sy);c.getContext('2d').drawImage(img,sx,sy,c.width,c.height,0,0,c.width,c.height);return canvasImage(c);}
  function addSourceCrop(sectionId,prefix,title){
    const sec=E(sectionId),panel=sec?.querySelector('.compact-tool');if(!panel)return null;
    const output=panel.querySelector('.canvas-wrap');const host=document.createElement('div');host.className='v11-crop-host';host.id=`${prefix}CropHost`;host.style.display='none';const canvas=document.createElement('canvas');canvas.id=`${prefix}SourceCanvas`;host.appendChild(canvas);panel.insertBefore(host,output);
    const actions=document.createElement('div');actions.className='workspace-actions';actions.id=`${prefix}CropActions`;actions.innerHTML=`<button class="ghost-btn" id="${prefix}CropBtn" type="button">Crop</button><button class="primary-btn" id="${prefix}ApplyCrop" type="button" style="display:none">Apply Crop</button><button class="ghost-btn" id="${prefix}CancelCrop" type="button" style="display:none">Cancel</button>`;panel.insertBefore(actions,host);
    const ctrl=cropController(host,canvas,null);
    return {host,canvas,ctrl,actions,title};
  }

  // 3) PHOTO & SIGNATURE flexible crop.
  const resizeCrop=addSourceCrop('resize','resize','Photo & Signature');
  S.v11ResizeOriginal=null;
  function drawResizeSource(){if(!resizeCrop||!S.resizeImg)return;const c=resizeCrop.canvas,img=S.resizeImg,max=1600,s=Math.min(1,max/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));c.getContext('2d').drawImage(img,0,0,c.width,c.height);}
  function wireImageInput(id,handler){const old=E(id);if(!old)return;const c=old.cloneNode(true);old.replaceWith(c);c.addEventListener('change',async()=>{const f=c.files?.[0];if(!f)return;try{await handler(f);}catch(err){console.error(err);alert('Could not load this image.');}finally{c.value='';}});}
  wireImageInput('resizeInput',async f=>{S.resizeImg=await fileImage(f);S.v11ResizeOriginal=S.resizeImg;drawResizeSource();drawResizePreview();E('resizeEmpty')&&(E('resizeEmpty').style.display='none');});
  E('resizeCropBtn')?.addEventListener('click',()=>{if(!S.resizeImg)return alert('Upload photo or signature first.');drawResizeSource();resizeCrop.host.style.display='grid';resizeCrop.ctrl.show({x:.05,y:.05,w:.9,h:.9});E('resizeApplyCrop').style.display='inline-flex';E('resizeCancelCrop').style.display='inline-flex';});
  E('resizeApplyCrop')?.addEventListener('click',async()=>{S.resizeImg=await cropImage(S.resizeImg,resizeCrop.ctrl.get());resizeCrop.ctrl.hide();resizeCrop.host.style.display='none';E('resizeApplyCrop').style.display='none';E('resizeCancelCrop').style.display='none';drawResizePreview();});
  E('resizeCancelCrop')?.addEventListener('click',()=>{resizeCrop.ctrl.hide();resizeCrop.host.style.display='none';E('resizeApplyCrop').style.display='none';E('resizeCancelCrop').style.display='none';});

  // 4) TARGET KB flexible crop + preview; compression uses cropped image.
  const compCrop=addSourceCrop('compressor','compress','Target KB');S.v11CompressImg=null;
  function drawCompressSource(){if(!compCrop||!S.v11CompressImg)return;const c=compCrop.canvas,img=S.v11CompressImg,max=1600,s=Math.min(1,max/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));c.getContext('2d').drawImage(img,0,0,c.width,c.height);}
  wireImageInput('compressInput',async f=>{S.compressFile=f;S.v11CompressImg=await fileImage(f);drawCompressSource();const n=E('compressStatus');if(n)n.textContent=`Selected: ${f.name} • ${(f.size/1024).toFixed(1)} KB • ${S.v11CompressImg.width}×${S.v11CompressImg.height}px`;});
  E('compressCropBtn')?.addEventListener('click',()=>{if(!S.v11CompressImg)return alert('Upload an image first.');drawCompressSource();compCrop.host.style.display='grid';compCrop.ctrl.show({x:.05,y:.05,w:.9,h:.9});E('compressApplyCrop').style.display='inline-flex';E('compressCancelCrop').style.display='inline-flex';});
  E('compressApplyCrop')?.addEventListener('click',async()=>{S.v11CompressImg=await cropImage(S.v11CompressImg,compCrop.ctrl.get());compCrop.ctrl.hide();compCrop.host.style.display='none';E('compressApplyCrop').style.display='none';E('compressCancelCrop').style.display='none';drawCompressSource();const n=E('compressStatus');if(n)n.textContent=`Crop applied • ${S.v11CompressImg.width}×${S.v11CompressImg.height}px`;});
  E('compressCancelCrop')?.addEventListener('click',()=>{compCrop.ctrl.hide();compCrop.host.style.display='none';E('compressApplyCrop').style.display='none';E('compressCancelCrop').style.display='none';});
  const oldCompress=E('compressBtn');if(oldCompress){const b=oldCompress.cloneNode(true);oldCompress.replaceWith(b);b.addEventListener('click',async()=>{if(!S.v11CompressImg)return alert('Upload an image.');let img=S.v11CompressImg,w=img.width,h=img.height,maxW=+E('compressMaxW').value;if(maxW&&w>maxW){h=Math.round(h*maxW/w);w=maxW;}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);const target=+E('targetKb').value||50,type=E('compressFormat').value,blob=await compressCanvasToTarget(c,target,type);E('compressStatus').textContent=`Output: ${(blob.size/1024).toFixed(1)} KB • ${w}×${h}px`;downloadBlob(blob,type==='image/webp'?'compressed.webp':'compressed.jpg');addHistory('Target KB','Compressed image',`${(blob.size/1024).toFixed(1)} KB`);});}

  // 5) PRINT STUDIO complete interaction rebuild: image + PDF load, free move, 8-way resize and per-item crop.
  const printSec=E('print'), printHead=printSec?.querySelector('.workspace-head'), printWrap=E('printCanvasWrap'), printCanvas=E('printCanvas');
  if(printHead){const row=printHead.querySelector('.button-row')||(()=>{const d=document.createElement('div');d.className='button-row';printHead.appendChild(d);return d;})();const oldLabel=printHead.querySelector('label.upload-btn');if(oldLabel){oldLabel.textContent='Load Images';const inp=document.createElement('input');inp.id='printInputV11';inp.type='file';inp.accept='image/*';inp.multiple=true;inp.hidden=true;oldLabel.appendChild(inp);}if(!E('printPdfInputV11')){const lab=document.createElement('label');lab.className='ghost-btn';lab.textContent='Load PDF';const i=document.createElement('input');i.id='printPdfInputV11';i.type='file';i.accept='application/pdf';i.hidden=true;lab.appendChild(i);row.appendChild(lab);}}
  const printControls=printSec?.querySelector('.compact-controls');if(printControls&&!E('printGapV11')){const g=document.createElement('label');g.innerHTML='Gap (mm)<input id="printGapV11" type="number" value="3" min="0" step="0.5">';printControls.appendChild(g);const d=document.createElement('label');d.innerHTML='DPI<select id="printDpiV11"><option value="300" selected>300</option><option value="600">600</option></select>';printControls.appendChild(d);}
  if(printWrap&&!E('printInteractiveLayer')){const l=document.createElement('div');l.id='printInteractiveLayer';l.className='v11-print-layer';printWrap.appendChild(l);}
  const printActions=printSec?.querySelector('.workspace-actions');if(printActions&&!E('cropSelectedPrint')){const b=document.createElement('button');b.id='cropSelectedPrint';b.className='ghost-btn';b.textContent='Crop Selected';printActions.insertBefore(b,printActions.firstChild);const del=document.createElement('button');del.id='deleteSelectedPrint';del.className='ghost-btn';del.textContent='Delete Selected';printActions.insertBefore(del,b.nextSibling);}
  let printCropPanel=null,printCropCanvas=null,printCropCtrl=null;
  if(printWrap&&!E('printCropPanel')){printCropPanel=document.createElement('div');printCropPanel.id='printCropPanel';printCropPanel.className='v11-print-crop-panel';printCropPanel.hidden=true;printCropPanel.innerHTML='<div class="v11-source-title"><strong>Crop selected item</strong><span class="v11-inline-status">Drag rectangle, edges or corners</span></div><div class="v11-crop-host" id="printCropHost"><canvas id="printCropCanvas"></canvas></div><div class="workspace-actions"><button class="primary-btn" id="applyPrintItemCrop">Apply Crop</button><button class="ghost-btn" id="cancelPrintItemCrop">Cancel</button></div>';printWrap.parentElement.insertBefore(printCropPanel,printWrap.nextSibling);printCropCanvas=E('printCropCanvas');printCropCtrl=cropController(E('printCropHost'),printCropCanvas,null);}else{printCropPanel=E('printCropPanel');printCropCanvas=E('printCropCanvas');}
  S.v11PrintItems=[];S.v11PrintSelected=-1;
  function paperSize(){const dpi=+(E('printDpiV11')?.value||300),paper=E('printPaper').value,ori=E('printOrientation').value;let w,h;if(paper==='a4'){w=mmToPx(210,dpi);h=mmToPx(297,dpi);}else{w=6*dpi;h=4*dpi;}if(ori==='landscape'&&h>w)[w,h]=[h,w];if(ori==='portrait'&&w>h)[w,h]=[h,w];return {w,h,dpi};}
  function initialPrintItems(images){const {w,h,dpi}=paperSize(),count=Math.max(images.length,+E('printCount').value||images.length||1),cols=count===4?2:count===6?3:count===9?3:Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols),m=mmToPx(+E('printMargin').value||4,dpi),gap=mmToPx(+(E('printGapV11')?.value||3),dpi),cw=(w-2*m-gap*(cols-1))/cols,ch=(h-2*m-gap*(rows-1))/rows;const out=[];for(let i=0;i<images.length;i++){const col=i%cols,row=Math.floor(i/cols);out.push({img:images[i].img||images[i],name:images[i].name||`Item ${i+1}`,x:(m+col*(cw+gap))/w,y:(m+row*(ch+gap))/h,w:cw/w,h:ch/h,crop:{x:0,y:0,w:1,h:1}});}return out;}
  function drawPrint(){if(!printCanvas)return;const {w,h}=paperSize();printCanvas.width=w;printCanvas.height=h;const ctx=printCanvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';S.v11PrintItems.forEach(it=>{const r=it.crop||{x:0,y:0,w:1,h:1},sx=r.x*it.img.width,sy=r.y*it.img.height,sw=r.w*it.img.width,sh=r.h*it.img.height;ctx.drawImage(it.img,sx,sy,sw,sh,it.x*w,it.y*h,it.w*w,it.h*h);});E('printEmpty')&&(E('printEmpty').style.display=S.v11PrintItems.length?'none':'');requestAnimationFrame(renderPrintOverlay);}
  function renderPrintOverlay(){const layer=E('printInteractiveLayer');if(!layer||!printCanvas)return;const cr=printCanvas.getBoundingClientRect(),hr=printWrap.getBoundingClientRect();layer.style.left=(cr.left-hr.left+printWrap.scrollLeft)+'px';layer.style.top=(cr.top-hr.top+printWrap.scrollTop)+'px';layer.style.width=cr.width+'px';layer.style.height=cr.height+'px';layer.innerHTML='';S.v11PrintItems.forEach((it,i)=>{const d=document.createElement('div');d.className='v11-print-item'+(i===S.v11PrintSelected?' selected':'');d.style.left=(it.x*100)+'%';d.style.top=(it.y*100)+'%';d.style.width=(it.w*100)+'%';d.style.height=(it.h*100)+'%';d.dataset.i=i;const label=document.createElement('span');label.className='v11-print-item-label';label.textContent=`${i+1}`;d.appendChild(label);['nw','n','ne','e','se','s','sw','w'].forEach(h=>{const s=document.createElement('span');s.className=`v11-print-resize ${h}`;s.dataset.h=h;d.appendChild(s);});layer.appendChild(d);
      d.addEventListener('pointerdown',e=>{e.preventDefault();const idx=i;S.v11PrintSelected=idx;renderPrintOverlay();const hnd=e.target.dataset.h||'move',base={...S.v11PrintItems[idx]},sx=e.clientX,sy=e.clientY;const move=ev=>{const dx=(ev.clientX-sx)/cr.width,dy=(ev.clientY-sy)/cr.height,it={...base},min=.025;if(hnd==='move'){it.x=clamp(base.x+dx,0,1-base.w);it.y=clamp(base.y+dy,0,1-base.h);}else{if(hnd.includes('w')){const nx=clamp(base.x+dx,0,base.x+base.w-min);it.w=base.w+(base.x-nx);it.x=nx;}if(hnd.includes('e'))it.w=clamp(base.w+dx,min,1-base.x);if(hnd.includes('n')){const ny=clamp(base.y+dy,0,base.y+base.h-min);it.h=base.h+(base.y-ny);it.y=ny;}if(hnd.includes('s'))it.h=clamp(base.h+dy,min,1-base.y);}S.v11PrintItems[idx]=it;drawPrint();};const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);});});}
  async function addPrintImages(entries,replace=false){if(replace)S.v11PrintItems=[];const existing=S.v11PrintItems.map(x=>({img:x.img,name:x.name})),all=existing.concat(entries);S.v11PrintItems=initialPrintItems(all);S.v11PrintSelected=S.v11PrintItems.length?0:-1;drawPrint();const n=E('printStatus');if(n)n.textContent=`${S.v11PrintItems.length} item(s) loaded • drag anywhere • resize from edges or corners • crop selected item.`;}
  E('printInputV11')?.addEventListener('change',async e=>{const entries=[];for(const f of [...e.target.files]){try{entries.push({img:await fileImage(f),name:f.name});}catch(err){console.warn(err);}}if(entries.length)await addPrintImages(entries,S.v11PrintItems.length===0);e.target.value='';});
  E('printPdfInputV11')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const pages=await pdfPagesToImages(f,2);await addPrintImages(pages,S.v11PrintItems.length===0);}catch(err){console.error(err);alert('Could not load this PDF.');}finally{e.target.value='';}});
  ['printCount','printPaper','printOrientation','printMargin','printGapV11','printDpiV11'].forEach(id=>E(id)?.addEventListener('input',()=>{if(S.v11PrintItems.length){const src=S.v11PrintItems.map(x=>({img:x.img,name:x.name}));S.v11PrintItems=initialPrintItems(src);drawPrint();}}));
  const buildOld=E('buildPrintSheet');if(buildOld){const b=buildOld.cloneNode(true);buildOld.replaceWith(b);b.addEventListener('click',()=>{if(!S.v11PrintItems.length)return alert('Load images or a PDF first.');drawPrint();addHistory('Print Studio','Built editable layout',`${S.v11PrintItems.length} item(s)`);});}
  const pngOld=E('downloadPrintSheet');if(pngOld){const b=pngOld.cloneNode(true);pngOld.replaceWith(b);b.addEventListener('click',()=>{if(!S.v11PrintItems.length)return alert('Load images or a PDF first.');drawPrint();downloadDataURL(printCanvas.toDataURL('image/png'),'print-studio-sheet.png');});}
  const pdfOld=E('downloadPrintSheetPdf');if(pdfOld){const b=pdfOld.cloneNode(true);pdfOld.replaceWith(b);b.addEventListener('click',async()=>{if(!S.v11PrintItems.length)return alert('Load images or a PDF first.');drawPrint();const doc=await PDFLib.PDFDocument.create(),bytes=await(await canvasToBlob(printCanvas,'image/png',1)).arrayBuffer(),img=await doc.embedPng(bytes),p=doc.addPage([img.width,img.height]);p.drawImage(img,{x:0,y:0,width:img.width,height:img.height});downloadBytes(await doc.save(),'print-studio-sheet.pdf','application/pdf');});}
  const prOld=E('browserPrint');if(prOld){const b=prOld.cloneNode(true);prOld.replaceWith(b);b.addEventListener('click',()=>{if(!S.v11PrintItems.length)return alert('Load images or a PDF first.');drawPrint();const w=window.open('');if(w)w.document.write(`<img src="${printCanvas.toDataURL('image/png')}" style="width:100%;max-width:100%"><script>onload=()=>print()<\/script>`);});}
  E('deleteSelectedPrint')?.addEventListener('click',()=>{if(S.v11PrintSelected<0)return;S.v11PrintItems.splice(S.v11PrintSelected,1);S.v11PrintSelected=Math.min(S.v11PrintSelected,S.v11PrintItems.length-1);drawPrint();});
  E('cropSelectedPrint')?.addEventListener('click',()=>{const it=S.v11PrintItems[S.v11PrintSelected];if(!it)return alert('Click an item on the sheet first.');const c=printCropCanvas,img=it.img,max=1600,s=Math.min(1,max/Math.max(img.width,img.height));c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));c.getContext('2d').drawImage(img,0,0,c.width,c.height);printCropPanel.hidden=false;if(!printCropCtrl)printCropCtrl=cropController(E('printCropHost'),c,null);printCropCtrl.show(it.crop||{x:0,y:0,w:1,h:1});});
  E('applyPrintItemCrop')?.addEventListener('click',()=>{const i=S.v11PrintSelected;if(i<0)return;S.v11PrintItems[i].crop=printCropCtrl.get();printCropCtrl.hide();printCropPanel.hidden=true;drawPrint();});
  E('cancelPrintItemCrop')?.addEventListener('click',()=>{printCropCtrl?.hide();printCropPanel.hidden=true;});
  window.addEventListener('resize',renderPrintOverlay);

  // Improve scanner drop zone to accept PDFs as well as images and route to the dedicated loader.
  E('scanCropStage')?.addEventListener('drop',async e=>{const pdf=[...e.dataTransfer.files].find(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name));if(!pdf)return;e.preventDefault();e.stopImmediatePropagation();try{const pages=await pdfPagesToImages(pdf,2.2);S.scanPages=pages;S.scanImg=pages[0]?.img||null;if(S.scanImg){drawScan();renderScanThumbs();E('scanEmpty')&&(E('scanEmpty').style.display='none');}}catch(err){console.error(err);}},true);

  document.title='Shop Studio Pro v11.0';const meta=document.querySelector('meta[name="shop-build"]');if(meta)meta.content='11.0.0';
})();

/* v11.0 final isolation: old Print Studio overlay is superseded by v11 editor. */
(function(){const old=document.getElementById('printEditor');if(old){old.innerHTML='';old.style.display='none';old.style.pointerEvents='none';}const legacy=document.getElementById('printInput');if(legacy)legacy.disabled=true;})();

/* SHOP STUDIO PRO v11.2 — Target KB image/PDF + per-item Print Studio crop */
(function(){
  const $=id=>document.getElementById(id), clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const S=(typeof state!=='undefined')?state:(window.state||{});
  const safeImageFromFile=file=>new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(r.error||new Error('File read failed'));
    r.onload=()=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Image decode failed'));im.src=r.result;};
    r.readAsDataURL(file);
  });
  const imageFromCanvas=c=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=c.toDataURL('image/png');});
  function cropImageNormalized(img,r){
    const sx=Math.max(0,Math.round(r.x*img.width)), sy=Math.max(0,Math.round(r.y*img.height));
    const sw=Math.max(1,Math.min(img.width-sx,Math.round(r.w*img.width))), sh=Math.max(1,Math.min(img.height-sy,Math.round(r.h*img.height)));
    const c=document.createElement('canvas');c.width=sw;c.height=sh;c.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,sw,sh);return imageFromCanvas(c);
  }
  function makeCropController(host,canvas){
    let box=host.querySelector('.v111-crop-box'),rect={x:.05,y:.05,w:.90,h:.90},drag=null,visible=false;
    if(!box){box=document.createElement('div');box.className='v111-crop-box';['nw','n','ne','e','se','s','sw','w'].forEach(h=>{const q=document.createElement('span');q.className='v111-crop-handle '+h;q.dataset.h=h;box.appendChild(q)});host.appendChild(box);}
    const geom=()=>{const cr=canvas.getBoundingClientRect(),hr=host.getBoundingClientRect();return {x:cr.left-hr.left+host.scrollLeft,y:cr.top-hr.top+host.scrollTop,w:cr.width,h:cr.height};};
    const render=()=>{if(!visible){box.style.display='none';return;}if(!canvas.width)return;const g=geom();box.style.display='block';box.style.left=(g.x+rect.x*g.w)+'px';box.style.top=(g.y+rect.y*g.h)+'px';box.style.width=(rect.w*g.w)+'px';box.style.height=(rect.h*g.h)+'px';};
    const set=r=>{rect={x:clamp(r.x,0,.98),y:clamp(r.y,0,.98),w:clamp(r.w,.02,1),h:clamp(r.h,.02,1)};if(rect.x+rect.w>1)rect.w=1-rect.x;if(rect.y+rect.h>1)rect.h=1-rect.y;render();};
    box.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const g=geom(),h=e.target.dataset.h||'move';drag={h,sx:e.clientX,sy:e.clientY,r:{...rect},g};box.setPointerCapture?.(e.pointerId);};
    box.onpointermove=e=>{if(!drag)return;const dx=(e.clientX-drag.sx)/drag.g.w,dy=(e.clientY-drag.sy)/drag.g.h,r={...drag.r},h=drag.h,min=.02;
      if(h==='move'){r.x=clamp(drag.r.x+dx,0,1-drag.r.w);r.y=clamp(drag.r.y+dy,0,1-drag.r.h);}else{
        if(h.includes('w')){const nx=clamp(drag.r.x+dx,0,drag.r.x+drag.r.w-min);r.w=drag.r.w+(drag.r.x-nx);r.x=nx;}
        if(h.includes('e'))r.w=clamp(drag.r.w+dx,min,1-drag.r.x);
        if(h.includes('n')){const ny=clamp(drag.r.y+dy,0,drag.r.y+drag.r.h-min);r.h=drag.r.h+(drag.r.y-ny);r.y=ny;}
        if(h.includes('s'))r.h=clamp(drag.r.h+dy,min,1-drag.r.y);
      } rect=r;render();
    };
    box.onpointerup=box.onpointercancel=()=>drag=null;
    window.addEventListener('resize',render);
    return {show:r=>{visible=true;if(r)set(r);else render();},hide:()=>{visible=false;box.style.display='none';},get:()=>({...rect}),set,render};
  }

  // SMART CARD — authoritative repeatable crop. Saving a side no longer destroys the source,
  // so Front and Back can be cropped repeatedly from one image/PDF page.
  (function(){
    const sec=$('cards'),stage=$('cardPerspectiveStage'),canvas=$('cardSourceCanvas');if(!sec||!stage||!canvas)return;
    let layer=$('cardV111CropHost');
    if(!layer){layer=document.createElement('div');layer.id='cardV111CropHost';layer.className='v111-card-crop-host';stage.appendChild(layer);}
    const ctrl=makeCropController(layer,canvas);let simpleActive=false;
    function hideLegacy(){['cardFreeCropLayer','cardPerspectiveLayer'].forEach(id=>{const n=$(id);if(n)n.style.display='none';});S.cardFreeCrop=null;S.cardPerspectiveMode=false;S.cardPerspectivePts=null;}
    function startSimple(){if(!canvas.width)return alert('Open a PDF or image first.');hideLegacy();simpleActive=true;layer.style.display='block';ctrl.show({x:.06,y:.08,w:.88,h:.84});const s=$('cardStatus');if(s)s.textContent='Crop active • move the rectangle or resize from any edge/corner • Apply & Save when ready.';}
    function stopSimple(){simpleActive=false;ctrl.hide();layer.style.display='none';}
    async function rectangularCardOutput(){const r=ctrl.get(),dpi=+$('cardExportDpi')?.value||600,out=document.createElement('canvas');out.width=mmToPx(85.6,dpi);out.height=mmToPx(54,dpi);const ctx=out.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(canvas,r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height,0,0,out.width,out.height);return out;}
    const cropBtn=$('cardSimpleCropBtn');if(cropBtn){const b=cropBtn.cloneNode(true);cropBtn.replaceWith(b);b.addEventListener('click',startSimple);}
    const persp=$('manualCardPerspectiveBtn');if(persp){const b=persp.cloneNode(true);persp.replaceWith(b);b.addEventListener('click',()=>{stopSimple();const auto=$('autoDetectCardBtn');if(auto)auto.click();else if(typeof enableCardPerspective==='function')enableCardPerspective();});}
    const save=$('saveCardCrop');if(save){const b=save.cloneNode(true);save.replaceWith(b);b.addEventListener('click',async()=>{
      if(!canvas.width)return alert('Open a PDF or image first.');
      try{
        const side=$('cardCropAction')?.value||'front';let crop=null;
        if(simpleActive) crop=await rectangularCardOutput();
        else if(S.cardPerspectiveMode&&S.cardPerspectivePts&&typeof perspectiveCardCanvas==='function') crop=await perspectiveCardCanvas(canvas,S.cardPerspectivePts,+$('cardExportDpi')?.value||600);
        else {startSimple();return;}
        if(side==='front')S.cardFrontCrop=crop;else S.cardBackCrop=crop;
        if(typeof previewCardCanvas==='function')previewCardCanvas(side==='front'?'cardFrontPreview':'cardBackPreview',crop);
        stopSimple();S.cardPerspectiveMode=false;const pl=$('cardPerspectiveLayer');if(pl)pl.style.display='none';
        const st=$('cardStatus');if(st)st.textContent=`${side.toUpperCase()} saved • crop can be started again without re-uploading the file.`;
        addHistory?.('Smart Card',`Saved ${side} crop`,`repeatable crop • ${crop.width}×${crop.height}px`);
      }catch(err){console.error(err);const st=$('cardStatus');if(st)st.textContent='Crop failed • source remains loaded. Start Crop and try again.';}
    });}
    document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.querySelector('.section.active')?.id==='cards'&&simpleActive&&!e.target.matches('input,select,textarea')){e.preventDefault();$('saveCardCrop')?.click();}});
  })();

  // PHOTO & SIGNATURE — no implicit crop. Preview uses contain, not cover.
  (function(){
    window.drawResizePreview=drawResizePreview=function(signatureClean=false){
      if(!S.resizeImg)return;const empty=$('resizeEmpty');if(empty)empty.style.display='none';
      const w=unitToPx($('resizeW').value,$('resizeUnit').value,$('resizeDpi').value),h=unitToPx($('resizeH').value,$('resizeUnit').value,$('resizeDpi').value),c=$('resizeCanvas'),ctx=c.getContext('2d');
      c.width=w;c.height=h;ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);fitContain(ctx,S.resizeImg,0,0,w,h);
      if(signatureClean){const d=ctx.getImageData(0,0,w,h),p=d.data;for(let i=0;i<p.length;i+=4){const g=.299*p[i]+.587*p[i+1]+.114*p[i+2],v=g>210?255:(g<120?0:g);p[i]=p[i+1]=p[i+2]=v;}ctx.putImageData(d,0,0);}
    };
    const st=$('resize')?.querySelector('.status-inline')||(()=>{const n=document.createElement('div');n.className='status-inline';n.id='resizeV111Status';n.textContent='No crop is applied automatically. Use Crop only when needed.';const p=$('resize')?.querySelector('.compact-controls');p?.insertAdjacentElement('afterend',n);return n;})();
    if(st)st.textContent='No crop is applied automatically. The full image is preserved unless you press Apply Crop.';
  })();

  // TARGET KB — image/PDF loader, optional image crop, resize/compress, export in the same file family.
  (function(){
    const sec=$('compressor'); if(!sec) return;
    let sourceFile=null, img=null, pdfBytes=null, sourceKind=null;
    const oldCropActions=$('compressCropActions'); if(oldCropActions) oldCropActions.style.display='none';
    const oldCropHost=$('compressCropHost'); if(oldCropHost) oldCropHost.style.display='none';

    // Make the existing picker accept both images and PDFs.
    const oldInput=$('compressInput');
    let input=oldInput;
    if(oldInput){
      input=oldInput.cloneNode(true);
      input.accept='image/*,application/pdf,.pdf';
      oldInput.replaceWith(input);
      const label=input.closest('label');
      if(label) label.childNodes[0].nodeValue='Upload Image / PDF';
    }

    let preview=$('compressV112Host'), canvas=$('compressV112Canvas');
    if(!preview){
      preview=document.createElement('div');
      preview.id='compressV112Host';
      preview.className='v111-source-host';
      canvas=document.createElement('canvas');
      canvas.id='compressV112Canvas';
      preview.appendChild(canvas);
      const status=$('compressStatus');
      status?.insertAdjacentElement('afterend',preview);
    }

    const ctrl=makeCropController(preview,canvas); ctrl.hide();

    let actions=$('compressV112Actions');
    if(!actions){
      actions=document.createElement('div');
      actions.id='compressV112Actions';
      actions.className='workspace-actions';
      actions.innerHTML='<button class="ghost-btn" id="compressV112Crop">Crop Image</button><button class="primary-btn" id="compressV112Apply" style="display:none">Apply Crop</button><button class="ghost-btn" id="compressV112Cancel" style="display:none">Cancel Crop</button>';
      preview.insertAdjacentElement('afterend',actions);
    }

    function sameImageMime(file){
      const t=(file?.type||'').toLowerCase();
      if(t==='image/jpeg'||t==='image/png'||t==='image/webp') return t;
      const ext=(file?.name||'').split('.').pop().toLowerCase();
      if(ext==='jpg'||ext==='jpeg') return 'image/jpeg';
      if(ext==='webp') return 'image/webp';
      return 'image/png';
    }
    function sameImageName(file){
      const n=file?.name||'compressed-image.png';
      const dot=n.lastIndexOf('.');
      const base=dot>0?n.slice(0,dot):n;
      const ext=(dot>0?n.slice(dot+1).toLowerCase():'png');
      const outExt=(ext==='jpg'||ext==='jpeg')?'jpg':(ext==='webp'?'webp':'png');
      return `${base}-target-kb.${outExt}`;
    }
    function drawImagePreview(){
      if(!img) return;
      const max=1500, sc=Math.min(1,max/Math.max(img.width,img.height));
      canvas.width=Math.max(1,Math.round(img.width*sc));
      canvas.height=Math.max(1,Math.round(img.height*sc));
      const ctx=canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      preview.style.display='grid';
      ctrl.render();
      $('compressV112Crop').style.display='';
    }
    async function drawPdfPreview(bytes){
      try{
        const mod=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
        mod.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
        const pdf=await mod.getDocument({data:new Uint8Array(bytes)}).promise;
        const pg=await pdf.getPage(1), vp=pg.getViewport({scale:1.4});
        canvas.width=Math.ceil(vp.width); canvas.height=Math.ceil(vp.height);
        await pg.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
        preview.style.display='grid';
      }catch(err){
        console.error(err);
        canvas.width=1; canvas.height=1;
      }
      ctrl.hide();
      $('compressV112Crop').style.display='none';
      $('compressV112Apply').style.display='none';
      $('compressV112Cancel').style.display='none';
    }

    async function canvasBlobAt(canvas,mime,q){
      return await new Promise(res=>canvas.toBlob(res,mime,q));
    }
    async function compressImageSameType(image,targetKb,maxW,mime){
      const target=Math.max(1,targetKb)*1024;
      let w=image.width,h=image.height;
      if(maxW && w>maxW){h=Math.max(1,Math.round(h*maxW/w));w=maxW;}

      // JPEG/WebP: search quality first, then dimensions if necessary.
      if(mime==='image/jpeg'||mime==='image/webp'){
        let scale=1,best=null;
        for(let pass=0;pass<8;pass++){
          const c=document.createElement('canvas');
          c.width=Math.max(1,Math.round(w*scale)); c.height=Math.max(1,Math.round(h*scale));
          const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
          ctx.drawImage(image,0,0,c.width,c.height);
          let lo=.08,hi=.98,localBest=null;
          for(let i=0;i<10;i++){
            const q=(lo+hi)/2, b=await canvasBlobAt(c,mime,q);
            if(!localBest || Math.abs(b.size-target)<Math.abs(localBest.size-target)) localBest=b;
            if(b.size>target) hi=q; else lo=q;
          }
          best=localBest;
          if(best.size<=target*1.03 || scale<.25) return {blob:best,w:c.width,h:c.height};
          scale*=.82;
        }
        return {blob:best,w:Math.round(w*scale),h:Math.round(h*scale)};
      }

      // PNG: dimension reduction is the dependable way to reduce byte size while keeping PNG output.
      let scale=1,best=null,bw=w,bh=h;
      for(let pass=0;pass<12;pass++){
        const c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(w*scale)); c.height=Math.max(1,Math.round(h*scale));
        const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        ctx.drawImage(image,0,0,c.width,c.height);
        const b=await canvasBlobAt(c,'image/png',1);
        best=b;bw=c.width;bh=c.height;
        if(b.size<=target*1.03 || scale<.18) break;
        const ratio=Math.sqrt(target/Math.max(1,b.size));
        scale*=Math.max(.55,Math.min(.9,ratio*.96));
      }
      return {blob:best,w:bw,h:bh};
    }

    async function renderPdfToImages(bytes,scale,quality){
      const mod=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
      mod.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
      const pdf=await mod.getDocument({data:new Uint8Array(bytes)}).promise;
      const pages=[];
      for(let n=1;n<=pdf.numPages;n++){
        const pg=await pdf.getPage(n), vp=pg.getViewport({scale});
        const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(vp.width));c.height=Math.max(1,Math.ceil(vp.height));
        await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
        const blob=await canvasBlobAt(c,'image/jpeg',quality);
        pages.push({blob,w:c.width,h:c.height});
      }
      return pages;
    }
    async function buildRasterPdf(pages){
      const doc=await PDFLib.PDFDocument.create();
      for(const pg of pages){
        const bytes=await pg.blob.arrayBuffer(), im=await doc.embedJpg(bytes);
        const p=doc.addPage([pg.w,pg.h]);
        p.drawImage(im,{x:0,y:0,width:pg.w,height:pg.h});
      }
      return await doc.save();
    }
    async function compressPdfToTarget(bytes,targetKb){
      const target=Math.max(5,targetKb)*1024;
      let best=null;
      // Search combinations from higher fidelity to lower, keeping the closest result.
      const scales=[1.6,1.35,1.15,.95,.8,.68,.56,.46,.38];
      const qualities=[.82,.68,.55,.43,.32,.24,.18,.12];
      for(const sc of scales){
        for(const q of qualities){
          const pages=await renderPdfToImages(bytes,sc,q);
          const out=await buildRasterPdf(pages);
          if(!best || Math.abs(out.byteLength-target)<Math.abs(best.byteLength-target)) best=out;
          if(out.byteLength<=target*1.03) return out;
        }
      }
      return best;
    }

    input?.addEventListener('change',async e=>{
      const f=e.target.files?.[0]; if(!f) return;
      sourceFile=f; img=null; pdfBytes=null; sourceKind=null;
      try{
        if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){
          sourceKind='pdf'; pdfBytes=await f.arrayBuffer(); await drawPdfPreview(pdfBytes);
          $('compressStatus').textContent=`Loaded PDF: ${f.name} • ${(f.size/1024).toFixed(1)} KB • export stays PDF`;
        }else{
          sourceKind='image'; img=await safeImageFromFile(f); S.v11CompressImg=img; S.compressFile=f;
          drawImagePreview(); ctrl.hide();
          $('compressStatus').textContent=`Loaded image: ${f.name} • ${(f.size/1024).toFixed(1)} KB • ${img.width}×${img.height}px • export keeps image type`;
        }
      }catch(err){
        console.error(err);
        sourceKind=null;sourceFile=null;img=null;pdfBytes=null;
        $('compressStatus').textContent='Could not load this file. Please choose a valid image or PDF.';
      }finally{e.target.value='';}
    });

    $('compressV112Crop').onclick=()=>{
      if(sourceKind!=='image'||!img) return alert('Crop is available for images. Load an image first.');
      ctrl.show({x:.05,y:.05,w:.9,h:.9});
      $('compressV112Apply').style.display='inline-flex';
      $('compressV112Cancel').style.display='inline-flex';
    };
    $('compressV112Apply').onclick=async()=>{
      if(!img) return;
      img=await cropImageNormalized(img,ctrl.get());S.v11CompressImg=img;
      drawImagePreview();ctrl.hide();
      $('compressV112Apply').style.display='none';$('compressV112Cancel').style.display='none';
      $('compressStatus').textContent=`Crop applied • ${img.width}×${img.height}px`;
    };
    $('compressV112Cancel').onclick=()=>{
      ctrl.hide();$('compressV112Apply').style.display='none';$('compressV112Cancel').style.display='none';
    };

    const oldBtn=$('compressBtn');
    if(oldBtn){
      const b=oldBtn.cloneNode(true); oldBtn.replaceWith(b);
      b.textContent='Resize / Compress & Export';
      b.addEventListener('click',async()=>{
        if(!sourceFile||!sourceKind) return alert('Upload an image or PDF first.');
        const target=+$('targetKb').value||50, maxW=+$('compressMaxW').value||0;
        b.disabled=true;
        try{
          if(sourceKind==='image'){
            const mime=sameImageMime(sourceFile);
            $('compressStatus').textContent='Processing image…';
            const out=await compressImageSameType(img,target,maxW,mime);
            $('compressStatus').textContent=`Output: ${(out.blob.size/1024).toFixed(1)} KB • ${out.w}×${out.h}px • ${mime.replace('image/','').toUpperCase()}`;
            downloadBlob(out.blob,sameImageName(sourceFile));
            addHistory?.('Target KB','Resized/compressed image',`${(out.blob.size/1024).toFixed(1)} KB`);
          }else{
            $('compressStatus').textContent='Processing PDF… this can take a little longer for multi-page files.';
            const outBytes=await compressPdfToTarget(pdfBytes,target);
            const blob=new Blob([outBytes],{type:'application/pdf'});
            const base=(sourceFile.name||'document.pdf').replace(/\.pdf$/i,'');
            $('compressStatus').textContent=`Output PDF: ${(blob.size/1024).toFixed(1)} KB • PDF format preserved`;
            downloadBlob(blob,`${base}-target-kb.pdf`);
            addHistory?.('Target KB','Compressed PDF',`${(blob.size/1024).toFixed(1)} KB`);
          }
        }catch(err){
          console.error(err);$('compressStatus').textContent='Could not process this file.';
          alert('Could not resize/compress this file.');
        }finally{b.disabled=false;}
      });
    }

    // The old output-format selector is image-specific and is no longer needed; export follows the input type.
    const format=$('compressFormat')?.closest('label'); if(format) format.style.display='none';
  })();

  // PRINT STUDIO — isolated editor with reliable load/select/move/8-way resize/crop.
  (function(){
    const sec=$('print'),wrap=$('printCanvasWrap'),canvas=$('printCanvas');if(!sec||!wrap||!canvas)return;
    // Hide older interaction layers so only this editor receives pointer events.
    ['printInteractiveLayer','printEditor'].forEach(id=>{const n=$(id);if(n){n.style.display='none';n.style.pointerEvents='none';}});
    const header=sec.querySelector('.workspace-head');let row=header?.querySelector('.v111-print-loaders');
    if(!row&&header){row=document.createElement('div');row.className='button-row v111-print-loaders';row.innerHTML='<label class="upload-btn">Load Images<input id="printImagesV111" type="file" accept="image/*" multiple hidden></label><label class="ghost-btn">Load PDF<input id="printPdfV111" type="file" accept="application/pdf" hidden></label>';header.querySelectorAll('label.upload-btn,.button-row').forEach(n=>{if(n!==row&&!row.contains(n))n.style.display='none';});header.appendChild(row);}
    let layer=$('printV111Layer');if(!layer){layer=document.createElement('div');layer.id='printV111Layer';layer.className='v111-print-layer';wrap.appendChild(layer);}
    let sources=[],items=[],selected=-1;
    const paper=()=>{const dpi=+(document.getElementById('printDpiV11')?.value||300),p=$('printPaper').value,o=$('printOrientation').value;let w=p==='a4'?mmToPx(210,dpi):6*dpi,h=p==='a4'?mmToPx(297,dpi):4*dpi;if(o==='landscape'&&h>w)[w,h]=[h,w];if(o==='portrait'&&w>h)[w,h]=[h,w];return {w,h,dpi};};
    function layoutFromSources(){if(!sources.length){items=[];selected=-1;draw();return;}const {w,h,dpi}=paper(),wanted=Math.max(+$('printCount').value||sources.length,sources.length),cols=wanted===4?2:wanted===6?3:wanted===9?3:Math.ceil(Math.sqrt(wanted)),rows=Math.ceil(wanted/cols),m=mmToPx(+$('printMargin').value||4,dpi),gap=mmToPx(+(document.getElementById('printGapV11')?.value||3),dpi),cw=(w-2*m-gap*(cols-1))/cols,ch=(h-2*m-gap*(rows-1))/rows;items=[];for(let i=0;i<wanted;i++){const src=sources[i%sources.length];items.push({img:src.img,name:src.name,x:(m+(i%cols)*(cw+gap))/w,y:(m+Math.floor(i/cols)*(ch+gap))/h,w:cw/w,h:ch/h,crop:{x:0,y:0,w:1,h:1}});}selected=items.length?0:-1;draw();}
    function draw(){const {w,h}=paper();canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';for(const it of items){const r=it.crop||{x:0,y:0,w:1,h:1};ctx.drawImage(it.img,r.x*it.img.width,r.y*it.img.height,r.w*it.img.width,r.h*it.img.height,it.x*w,it.y*h,it.w*w,it.h*h);}const e=$('printEmpty');if(e)e.style.display=items.length?'none':'';requestAnimationFrame(renderOverlay);}
    function renderOverlay(){const cr=canvas.getBoundingClientRect(),wr=wrap.getBoundingClientRect();layer.style.left=(cr.left-wr.left+wrap.scrollLeft)+'px';layer.style.top=(cr.top-wr.top+wrap.scrollTop)+'px';layer.style.width=cr.width+'px';layer.style.height=cr.height+'px';layer.innerHTML='';items.forEach((it,i)=>{const d=document.createElement('div');d.className='v111-print-item'+(i===selected?' selected':'');d.style.left=it.x*100+'%';d.style.top=it.y*100+'%';d.style.width=it.w*100+'%';d.style.height=it.h*100+'%';d.dataset.i=i;const lab=document.createElement('span');lab.className='v111-print-label';lab.textContent=String(i+1);d.appendChild(lab);const crop=document.createElement('button');crop.type='button';crop.className='v112-item-crop';crop.textContent='Crop';crop.title='Crop this image';crop.onpointerdown=e=>{e.preventDefault();e.stopPropagation();};crop.onclick=e=>{e.preventDefault();e.stopPropagation();selected=i;renderOverlay();cropBtn?.click();};d.appendChild(crop);['nw','n','ne','e','se','s','sw','w'].forEach(h=>{const q=document.createElement('span');q.className='v111-print-resize '+h;q.dataset.h=h;d.appendChild(q);});layer.appendChild(d);
        d.onpointerdown=e=>{if(e.target.closest('.v112-item-crop'))return;e.preventDefault();e.stopPropagation();selected=i;renderOverlay();const hnd=e.target.dataset.h||'move',base={...items[i]},sx=e.clientX,sy=e.clientY,cbox=canvas.getBoundingClientRect();const mv=ev=>{const dx=(ev.clientX-sx)/cbox.width,dy=(ev.clientY-sy)/cbox.height,n={...base},min=.02;if(hnd==='move'){n.x=clamp(base.x+dx,0,1-base.w);n.y=clamp(base.y+dy,0,1-base.h);}else{if(hnd.includes('w')){const nx=clamp(base.x+dx,0,base.x+base.w-min);n.w=base.w+(base.x-nx);n.x=nx;}if(hnd.includes('e'))n.w=clamp(base.w+dx,min,1-base.x);if(hnd.includes('n')){const ny=clamp(base.y+dy,0,base.y+base.h-min);n.h=base.h+(base.y-ny);n.y=ny;}if(hnd.includes('s'))n.h=clamp(base.h+dy,min,1-base.y);}items[i]=n;draw();};const up=()=>{document.removeEventListener('pointermove',mv,true);document.removeEventListener('pointerup',up,true);};document.addEventListener('pointermove',mv,true);document.addEventListener('pointerup',up,true);};
      });}
    async function loadPdf(file){const mod=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');mod.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';const pdf=await mod.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,out=[];for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n),vp=pg.getViewport({scale:2}),c=document.createElement('canvas');c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;out.push({img:await imageFromCanvas(c),name:`${file.name} • page ${n}`});}return out;}
    $('printImagesV111')?.addEventListener('change',async e=>{const files=[...e.target.files];if(!files.length)return;const loaded=[];for(const f of files){try{loaded.push({img:await safeImageFromFile(f),name:f.name});}catch(err){console.error(err);}}sources=sources.concat(loaded);layoutFromSources();const st=$('printStatus');if(st)st.textContent=`${items.length} item(s) ready • first item selected • drag to move • resize from 4 sides or 4 corners.`;e.target.value='';});
    $('printPdfV111')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{sources=sources.concat(await loadPdf(f));layoutFromSources();const st=$('printStatus');if(st)st.textContent=`PDF loaded • ${items.length} editable item(s) • first item selected.`;}catch(err){console.error(err);alert('Could not load this PDF.');}finally{e.target.value='';}});
    // Dedicated crop panel.
    let panel=$('printV111CropPanel'),cc=$('printV111CropCanvas'),cropCtrl=null;
    if(!panel){panel=document.createElement('div');panel.id='printV111CropPanel';panel.className='v111-print-crop-panel';panel.hidden=true;panel.innerHTML='<div class="v11-source-title"><strong>Crop selected item</strong><span class="v11-inline-status">Move / resize from edges or corners</span></div><div class="v111-source-host" id="printV111CropHost"><canvas id="printV111CropCanvas"></canvas></div><div class="workspace-actions"><button class="primary-btn" id="printV111ApplyCrop">Apply Crop</button><button class="ghost-btn" id="printV111CancelCrop">Cancel</button></div>';wrap.insertAdjacentElement('afterend',panel);cc=$('printV111CropCanvas');cropCtrl=makeCropController($('printV111CropHost'),cc);}else cropCtrl=makeCropController($('printV111CropHost'),cc);
    const actions=sec.querySelector('.workspace-actions');let cropBtn=$('printV111Crop');if(!cropBtn&&actions){cropBtn=document.createElement('button');cropBtn.id='printV111Crop';cropBtn.className='ghost-btn';cropBtn.textContent='Crop Selected';actions.insertBefore(cropBtn,actions.firstChild);}
    cropBtn.onclick=()=>{if(selected<0&&items.length)selected=0;if(selected<0)return alert('Load an image or PDF first.');const it=items[selected],max=1600,s=Math.min(1,max/Math.max(it.img.width,it.img.height));cc.width=Math.max(1,Math.round(it.img.width*s));cc.height=Math.max(1,Math.round(it.img.height*s));cc.getContext('2d').drawImage(it.img,0,0,cc.width,cc.height);panel.hidden=false;cropCtrl.show(it.crop||{x:0,y:0,w:1,h:1});};
    $('printV111ApplyCrop').onclick=()=>{if(selected<0)return;items[selected].crop=cropCtrl.get();cropCtrl.hide();panel.hidden=true;draw();};
    $('printV111CancelCrop').onclick=()=>{cropCtrl.hide();panel.hidden=true;};
    const oldCrop=$('cropSelectedPrint');if(oldCrop)oldCrop.style.display='none';const oldDelete=$('deleteSelectedPrint');if(oldDelete)oldDelete.style.display='none';
    let del=$('printV111Delete');if(!del&&actions){del=document.createElement('button');del.id='printV111Delete';del.className='ghost-btn';del.textContent='Delete Selected';actions.insertBefore(del,cropBtn.nextSibling);}del.onclick=()=>{if(selected<0&&items.length)selected=0;if(selected<0)return;items.splice(selected,1);selected=Math.min(selected,items.length-1);draw();};
    let rot=$('printV111Rotate');if(!rot&&actions){rot=document.createElement('button');rot.id='printV111Rotate';rot.className='ghost-btn';rot.textContent='↻ Rotate Selected';actions.insertBefore(rot,del.nextSibling);}
    rot.onclick=async()=>{if(selected<0&&items.length)selected=0;if(selected<0)return alert('Load an image or PDF first.');const it=items[selected],src=it.img,c=document.createElement('canvas');c.width=src.height;c.height=src.width;const cx=c.getContext('2d');cx.translate(c.width/2,c.height/2);cx.rotate(Math.PI/2);cx.drawImage(src,-src.width/2,-src.height/2);it.img=await imageFromCanvas(c);it.crop={x:0,y:0,w:1,h:1};draw();const st=$('printStatus');if(st)st.textContent=`Item ${selected+1} rotated 90° clockwise • layout position and size preserved.`;};
    const build=$('buildPrintSheet');if(build){const b=build.cloneNode(true);build.replaceWith(b);b.addEventListener('click',()=>{if(!sources.length)return alert('Load images or a PDF first.');layoutFromSources();});}
    const png=$('downloadPrintSheet');if(png){const b=png.cloneNode(true);png.replaceWith(b);b.addEventListener('click',()=>{if(!items.length)return alert('Load images or a PDF first.');draw();downloadDataURL(canvas.toDataURL('image/png'),'print-studio-sheet.png');});}
    const pdf=$('downloadPrintSheetPdf');if(pdf){const b=pdf.cloneNode(true);pdf.replaceWith(b);b.addEventListener('click',async()=>{if(!items.length)return alert('Load images or a PDF first.');draw();const doc=await PDFLib.PDFDocument.create(),bytes=await(await canvasToBlob(canvas,'image/png',1)).arrayBuffer(),im=await doc.embedPng(bytes),p=doc.addPage([im.width,im.height]);p.drawImage(im,{x:0,y:0,width:im.width,height:im.height});downloadBytes(await doc.save(),'print-studio-sheet.pdf','application/pdf');});}
    const pr=$('browserPrint');if(pr){const b=pr.cloneNode(true);pr.replaceWith(b);b.addEventListener('click',()=>{if(!items.length)return alert('Load images or a PDF first.');draw();const w=window.open('');w?.document.write(`<img src="${canvas.toDataURL('image/png')}" style="width:100%;max-width:100%"><script>onload=()=>print()<\/script>`);});}
    ['printPaper','printOrientation'].forEach(id=>$(id)?.addEventListener('change',draw));
    $('printCount')?.addEventListener('change',()=>{if(sources.length)layoutFromSources();});
    window.addEventListener('resize',renderOverlay);
  })();

  document.title='Shop Studio Pro v11.3';document.querySelector('meta[name="shop-build"]')?.setAttribute('content','11.3.0');
  const bs=document.querySelector('.brand-subtitle');if(bs)bs.textContent='PRO TOOLKIT • V11.3';
})();

/* SHOP STUDIO PRO v11.4 — consolidated Target KB, scanner persistence, advanced PDF workspace */
(function(){
  const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const S=typeof state!=='undefined'?state:(window.state||{});
  const pdfJs=async()=>{const m=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');m.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';return m;};
  const toImg=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});
  const canvasImg=c=>toImg(c.toDataURL('image/png'));
  const blobOf=(c,t='image/jpeg',q=.85)=>new Promise(r=>c.toBlob(r,t,q));

  // ---------- TARGET KB v11.5: strict image/PDF loader + preview + compression ----------
  (function(){
    const sec=$('compressor'), oldInput=$('compressInput'), oldBtn=$('compressBtn'); if(!sec||!oldInput||!oldBtn)return;
    const input=oldInput.cloneNode(true); input.accept='image/*,application/pdf,.pdf'; oldInput.replaceWith(input);
    const btn=oldBtn.cloneNode(true); oldBtn.replaceWith(btn); btn.textContent='Resize / Compress & Export';
    ['compressV112Host','compressV112Actions','compressCropHost','compressCropActions','compressV114Host','compressV114Actions'].forEach(id=>$(id)?.remove());
    const host=document.createElement('div'); host.id='compressV115Host'; host.className='v114-compress-host';
    host.innerHTML='<canvas id="compressV115Canvas"></canvas><div id="compressV115Crop" class="v114-crop-box" hidden><i data-h="nw"></i><i data-h="n"></i><i data-h="ne"></i><i data-h="e"></i><i data-h="se"></i><i data-h="s"></i><i data-h="sw"></i><i data-h="w"></i></div>';
    $('compressStatus').insertAdjacentElement('afterend',host);
    const actions=document.createElement('div'); actions.id='compressV115Actions'; actions.className='workspace-actions';
    actions.innerHTML='<button class="ghost-btn" id="compressV115CropBtn" hidden>Crop Image</button><button class="primary-btn" id="compressV115Apply" hidden>Apply Crop</button><button class="ghost-btn" id="compressV115Cancel" hidden>Cancel Crop</button>';
    host.insertAdjacentElement('afterend',actions);
    const canvas=$('compressV115Canvas'), box=$('compressV115Crop');
    let file=null, kind=null, image=null, pdfBytes=null, crop={x:.05,y:.05,w:.9,h:.9}, drag=null;
    const status=t=>$('compressStatus').textContent=t;
    const readImage=f=>new Promise((resolve,reject)=>{const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);resolve(im)};im.onerror=e=>{URL.revokeObjectURL(u);reject(e)};im.src=u});
    const renderCropBox=()=>{if(box.hidden||!canvas.width)return;const cr=canvas.getBoundingClientRect(),hr=host.getBoundingClientRect();box.style.left=(cr.left-hr.left+crop.x*cr.width)+'px';box.style.top=(cr.top-hr.top+crop.y*cr.height)+'px';box.style.width=(crop.w*cr.width)+'px';box.style.height=(crop.h*cr.height)+'px'};
    function drawImagePreview(){if(!image)return;const max=1500,sc=Math.min(1,max/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height));canvas.width=Math.max(1,Math.round((image.naturalWidth||image.width)*sc));canvas.height=Math.max(1,Math.round((image.naturalHeight||image.height)*sc));const x=canvas.getContext('2d');x.clearRect(0,0,canvas.width,canvas.height);x.drawImage(image,0,0,canvas.width,canvas.height);host.hidden=false;$('compressV115CropBtn').hidden=false;requestAnimationFrame(renderCropBox)}
    async function drawPdfPreview(){const m=await pdfJs(),pdf=await m.getDocument({data:new Uint8Array(pdfBytes.slice(0))}).promise,pg=await pdf.getPage(1),vp=pg.getViewport({scale:1.35});canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);const x=canvas.getContext('2d');x.clearRect(0,0,canvas.width,canvas.height);await pg.render({canvasContext:x,viewport:vp}).promise;host.hidden=false;box.hidden=true;$('compressV115CropBtn').hidden=true;$('compressV115Apply').hidden=true;$('compressV115Cancel').hidden=true}
    function resetCrop(){crop={x:.05,y:.05,w:.9,h:.9};box.hidden=true;$('compressV115Apply').hidden=true;$('compressV115Cancel').hidden=true}
    input.addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;file=f;image=null;pdfBytes=null;kind=null;resetCrop();status('Loading file…');try{if((f.type||'').toLowerCase()==='application/pdf'||/\.pdf$/i.test(f.name)){kind='pdf';pdfBytes=await f.arrayBuffer();await drawPdfPreview();status(`Loaded PDF • ${(f.size/1024).toFixed(1)} KB • ${f.name}`)}else{kind='image';image=await readImage(f);drawImagePreview();status(`Loaded image • ${(f.size/1024).toFixed(1)} KB • ${image.naturalWidth||image.width}×${image.naturalHeight||image.height}px`)} }catch(err){console.error(err);file=kind=image=pdfBytes=null;canvas.width=canvas.height=0;status('Could not load this file. Please try another image or PDF.')}finally{e.target.value=''}});
    $('compressV115CropBtn').onclick=()=>{if(kind!=='image'||!image)return status('Load an image first.');crop={x:.05,y:.05,w:.9,h:.9};box.hidden=false;$('compressV115Apply').hidden=false;$('compressV115Cancel').hidden=false;requestAnimationFrame(renderCropBox)};
    $('compressV115Cancel').onclick=resetCrop;
    $('compressV115Apply').onclick=async()=>{if(!image)return;const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,c=document.createElement('canvas');c.width=Math.max(1,Math.round(iw*crop.w));c.height=Math.max(1,Math.round(ih*crop.h));c.getContext('2d').drawImage(image,iw*crop.x,ih*crop.y,iw*crop.w,ih*crop.h,0,0,c.width,c.height);image=await canvasImg(c);resetCrop();drawImagePreview();status(`Crop applied • ${c.width}×${c.height}px`)};
    box.addEventListener('pointerdown',e=>{e.preventDefault();const cr=canvas.getBoundingClientRect();drag={id:e.pointerId,h:e.target.dataset.h||'move',sx:e.clientX,sy:e.clientY,r:{...crop},cw:cr.width,ch:cr.height};box.setPointerCapture?.(e.pointerId)});
    window.addEventListener('pointermove',e=>{if(!drag)return;const dx=(e.clientX-drag.sx)/drag.cw,dy=(e.clientY-drag.sy)/drag.ch,r={...drag.r},h=drag.h,min=.025;if(h==='move'){r.x=clamp(r.x+dx,0,1-r.w);r.y=clamp(r.y+dy,0,1-r.h)}else{if(h.includes('w')){const nx=clamp(r.x+dx,0,r.x+r.w-min);r.w+=r.x-nx;r.x=nx}if(h.includes('e'))r.w=clamp(r.w+dx,min,1-r.x);if(h.includes('n')){const ny=clamp(r.y+dy,0,r.y+r.h-min);r.h+=r.y-ny;r.y=ny}if(h.includes('s'))r.h=clamp(r.h+dy,min,1-r.y)}crop=r;renderCropBox()});
    window.addEventListener('pointerup',()=>drag=null);window.addEventListener('resize',renderCropBox);
    const mime=f=>{const t=(f.type||'').toLowerCase();if(['image/jpeg','image/png','image/webp'].includes(t))return t;return /\.png$/i.test(f.name)?'image/png':/\.webp$/i.test(f.name)?'image/webp':'image/jpeg'};
    async function compressImage(targetKb,maxW){const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;let w=iw,h=ih;if(maxW&&w>maxW){h=Math.max(1,Math.round(h*maxW/w));w=maxW}const target=targetKb*1024,type=mime(file);let best=null,bestDiff=Infinity,bw=w,bh=h,scale=1;for(let pass=0;pass<14;pass++){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));const x=c.getContext('2d');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(image,0,0,c.width,c.height);if(type==='image/png'){const b=await blobOf(c,'image/png',1),d=Math.abs(b.size-target);if(d<bestDiff){best=b;bestDiff=d;bw=c.width;bh=c.height}}else{let lo=.04,hi=.98;for(let i=0;i<13;i++){const q=(lo+hi)/2,b=await blobOf(c,type,q),d=Math.abs(b.size-target);if(d<bestDiff){best=b;bestDiff=d;bw=c.width;bh=c.height}if(b.size>target)hi=q;else lo=q}}if(best&&best.size<=target*1.025&&best.size>=target*.72)break;scale*=.84}return{blob:best,w:bw,h:bh,type}}
    async function compressPdf(targetKb){const target=targetKb*1024,m=await pdfJs(),src=await m.getDocument({data:new Uint8Array(pdfBytes.slice(0))}).promise;let best=null,bestDiff=Infinity;for(const sc of [1.7,1.45,1.25,1.05,.9,.76,.64,.52,.42,.34]){for(const q of [.82,.7,.58,.46,.36,.28,.21,.15,.1]){const doc=await PDFLib.PDFDocument.create();for(let n=1;n<=src.numPages;n++){const pg=await src.getPage(n),vp=pg.getViewport({scale:sc}),c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(vp.width));c.height=Math.max(1,Math.ceil(vp.height));await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;const b=await blobOf(c,'image/jpeg',q),im=await doc.embedJpg(await b.arrayBuffer()),p=doc.addPage([im.width,im.height]);p.drawImage(im,{x:0,y:0,width:im.width,height:im.height})}const out=await doc.save({useObjectStreams:true}),d=Math.abs(out.byteLength-target);if(d<bestDiff){best=out;bestDiff=d}if(out.byteLength<=target*1.025&&out.byteLength>=target*.65)return out}}return best}
    btn.addEventListener('click',async()=>{if(!file||!kind)return status('Upload an image or PDF first.');btn.disabled=true;try{const target=Math.max(5,+$('targetKb').value||50),maxW=Math.max(0,+$('compressMaxW').value||0);if(kind==='image'){status('Compressing image…');const o=await compressImage(target,maxW),ext=o.type==='image/png'?'png':o.type==='image/webp'?'webp':'jpg',base=file.name.replace(/\.[^.]+$/,'');downloadBlob(o.blob,`${base}-target-kb.${ext}`);status(`Output ${(o.blob.size/1024).toFixed(1)} KB • ${o.w}×${o.h}px`)}else{status('Compressing PDF pages…');const out=await compressPdf(target),blob=new Blob([out],{type:'application/pdf'}),base=file.name.replace(/\.pdf$/i,'');downloadBlob(blob,`${base}-target-kb.pdf`);status(`Output PDF ${(blob.size/1024).toFixed(1)} KB`)} }catch(err){console.error(err);status('Compression failed. The source file was not changed.')}finally{btn.disabled=false}});
  })();

  // ---------- SCANNER: saved device/settings + stronger auto document crop ----------
  (function(){
    const side=$('scanner')?.querySelector('.tool-sidebar');if(!side)return;
    let g=$('scannerDevicePrefs');if(!g){g=document.createElement('div');g.id='scannerDevicePrefs';g.className='control-group';g.innerHTML='<h4>Device Defaults</h4><label>DPI<select id="savedScanDpi"><option>150</option><option selected>300</option><option>600</option></select></label><label>Mode<select id="savedScanBit"><option value="24" selected>Color</option><option value="8">Grayscale</option><option value="1">B&W</option></select></label><label>Source<select id="savedScanSource"><option value="flatbed">Flatbed</option><option value="feeder">Feeder</option></select></label><label><input id="scanRememberDevice" type="checkbox" checked> Remember scanner & settings</label><div class="v11-inline-status" id="scanSavedDeviceLabel">No scanner saved yet</div>';side.appendChild(g)}
    let pref={};try{pref=JSON.parse(localStorage.getItem('shopstudio_scan_device')||'{}')}catch{};['savedScanDpi','savedScanBit','savedScanSource'].forEach(id=>{if(pref[id]!=null&&$(id))$(id).value=pref[id]});if($('scanRememberDevice'))$('scanRememberDevice').checked=pref.remember!==false;if(pref.name)$('scanSavedDeviceLabel').textContent=`Saved: ${pref.name}`;
    const savePref=extra=>{if(!$('scanRememberDevice')?.checked)return;pref={...pref,...extra,savedScanDpi:$('savedScanDpi').value,savedScanBit:$('savedScanBit').value,savedScanSource:$('savedScanSource').value,remember:true};localStorage.setItem('shopstudio_scan_device',JSON.stringify(pref));if(pref.name)$('scanSavedDeviceLabel').textContent=`Saved: ${pref.name}`};['savedScanDpi','savedScanBit','savedScanSource'].forEach(id=>$(id)?.addEventListener('change',()=>savePref({})));
    const old=$('scannerBridgeBtn');if(old){const b=old.cloneNode(true);old.replaceWith(b);b.addEventListener('click',async()=>{const label=b.textContent;b.disabled=true;b.textContent='Scanning…';try{const r=await fetch('http://127.0.0.1:17899/scanners',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('Scanner bridge not responding.');const data=await r.json(),scanners=data.scanners||[];if(!scanners.length)throw new Error('No WIA/TWAIN scanner detected.');let s=scanners.find(x=>x.name===pref.name&&x.driver===pref.driver);if(!s){const choices=scanners.map((x,i)=>`${i+1}. [${String(x.driver).toUpperCase()}] ${x.name}`).join('\n');const pick=prompt(`Choose scanner once (it will be remembered):\n\n${choices}`,'1');if(pick===null)return;s=scanners[Math.max(0,Math.min(scanners.length-1,(parseInt(pick)||1)-1))];savePref({name:s.name,driver:s.driver})}const url=`http://127.0.0.1:17899/scan?driver=${encodeURIComponent(s.driver)}&device=${encodeURIComponent(s.name)}&dpi=${encodeURIComponent($('savedScanDpi').value)}&bitdepth=${encodeURIComponent($('savedScanBit').value)}&source=${encodeURIComponent($('savedScanSource').value)}&deskew=true`;const rr=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!rr.ok)throw new Error('Scan failed.');const blob=await rr.blob(),im=await fileToImage(blob);S.scanImg=im;S.scanPages.push({img:im,name:`${s.name} scan`});S.scanCurrentIndex=S.scanPages.length-1;drawScan();renderScanThumbs();$('scanSavedDeviceLabel').textContent=`Saved: ${s.name} • ${$('savedScanDpi').value} DPI`;savePref({name:s.name,driver:s.driver})}catch(err){console.error(err);alert(`${err.message}\n\nStart the Windows Scanner Bridge and check the scanner driver.`)}finally{b.disabled=false;b.textContent=label}})}
    async function detectQuad(c){if(typeof cv==='undefined'||!cv.Mat)return null;const max=1800,sc=Math.min(1,max/Math.max(c.width,c.height)),dc=document.createElement('canvas');dc.width=Math.round(c.width*sc);dc.height=Math.round(c.height*sc);dc.getContext('2d').drawImage(c,0,0,dc.width,dc.height);const src=cv.imread(dc),gray=new cv.Mat(),blur=new cv.Mat(),edge=new cv.Mat(),cont=new cv.MatVector(),hier=new cv.Mat();let best=null;try{cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);cv.Canny(blur,35,130,edge);cv.dilate(edge,edge,cv.Mat.ones(3,3,cv.CV_8U));cv.findContours(edge,cont,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);const areaAll=dc.width*dc.height;for(let i=0;i<cont.size();i++){const q=cont.get(i),area=Math.abs(cv.contourArea(q));if(area<areaAll*.16)continue;const peri=cv.arcLength(q,true),ap=new cv.Mat();cv.approxPolyDP(q,ap,.018*peri,true);if(ap.rows===4&&cv.isContourConvex(ap)){const pts=[];for(let j=0;j<4;j++){const p=ap.intPtr(j,0);pts.push({x:p[0],y:p[1]})}const ar=area/areaAll,score=ar*10-(ar>.99?8:0);if(!best||score>best.score)best={pts,score}}ap.delete()}if(!best)return null;const pts=best.pts.map(p=>({x:p.x/sc,y:p.y/sc})),sum=p=>p.x+p.y,diff=p=>p.x-p.y;return [pts.reduce((a,b)=>sum(a)<sum(b)?a:b),pts.reduce((a,b)=>diff(a)>diff(b)?a:b),pts.reduce((a,b)=>sum(a)>sum(b)?a:b),pts.reduce((a,b)=>diff(a)<diff(b)?a:b)]}finally{[src,gray,blur,edge,hier].forEach(x=>x.delete());cont.delete()}}
  })();

  // ---------- ADVANCED PDF STUDIO v11.5 ----------
  (function(){
    const sec=$('pdf');if(!sec)return;
    $('pdfAdvancedV114')?.remove();
    let launch=$('openAdvancedPdfV115');
    if(!launch){const card=document.createElement('div');card.className='utility-card';card.innerHTML='<h3>Advanced PDF Studio</h3><p class="muted">Crop, perspective, arrange pages, color, export PDF/images.</p><button class="primary-btn" id="openAdvancedPdfV115">Open Studio</button>';sec.querySelector('.utility-grid')?.appendChild(card);launch=card.querySelector('button')}
    const panel=document.createElement('div');panel.id='pdfAdvancedV115';panel.className='pdf-v114 panel';panel.hidden=true;panel.innerHTML=`
      <div class="workspace-head"><div><span class="eyebrow">ADVANCED PDF STUDIO</span><h2>Crop, Arrange & Enhance PDF</h2></div><div class="workspace-actions"><label class="upload-btn">Open PDF<input id="pdfV115Input" type="file" accept="application/pdf,.pdf" hidden></label><button class="ghost-btn" id="pdfV115Close">Close</button></div></div>
      <div class="pdf-v114-toolbar">
        <button class="ghost-btn" id="pdfV115Pages">Show All Pages</button>
        <label>Apply to<select id="pdfV115Scope"><option value="current">Current page</option><option value="selected">Selected pages</option><option value="all">All pages</option><option value="even">Even pages</option><option value="odd">Odd pages</option></select></label>
        <button class="ghost-btn" id="pdfV115Crop">Crop</button><button class="ghost-btn" id="pdfV115Auto">Auto Detect</button><button class="ghost-btn" id="pdfV115Perspective">Perspective Crop</button>
        <button class="ghost-btn" id="pdfV115RotL">↶ 90°</button><button class="ghost-btn" id="pdfV115RotR">↷ 90°</button>
        <label>Color<select id="pdfV115Color"><option value="original">Original</option><option value="document">Document</option><option value="gray">Grayscale</option><option value="bw">B&W</option><option value="vivid">Vivid</option></select></label>
        <button class="ghost-btn" id="pdfV115Blank">Add Blank After Current</button><label class="upload-btn">Add PDF After Current<input id="pdfV115InsertPdf" type="file" accept="application/pdf,.pdf" hidden></label><button class="ghost-btn" id="pdfV115Delete">Delete</button><button class="ghost-btn" id="pdfV115Numbers">Page Numbers: Off</button>
      </div>
      <div class="pdf-v114-body" id="pdfV115Body"><div class="pdf-v114-thumbs" id="pdfV115Thumbs"></div><div class="pdf-v114-stage" id="pdfV115Stage"><canvas id="pdfV115Canvas"></canvas><div class="v114-crop-box" id="pdfV115CropBox" hidden><i data-h="nw"></i><i data-h="n"></i><i data-h="ne"></i><i data-h="e"></i><i data-h="se"></i><i data-h="s"></i><i data-h="sw"></i><i data-h="w"></i></div><div id="pdfV115PerspectiveLayer" hidden><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon id="pdfV115Poly"></polygon></svg><b data-i="0"></b><b data-i="1"></b><b data-i="2"></b><b data-i="3"></b></div><div class="pdf-v115-page-grid" id="pdfV115Grid" hidden></div></div></div>
      <div class="pdf-v114-export"><label>Export<select id="pdfV115ExportMode"><option value="all">All</option><option value="selected">Selected</option><option value="even">Even</option><option value="odd">Odd</option><option value="range">Range</option></select></label><input id="pdfV115Range" placeholder="1-3,5"><button class="primary-btn" id="pdfV115ExportPdf">Export PDF</button><label>Image<select id="pdfV115ImageType"><option value="png">PNG</option><option value="jpeg">JPG</option></select></label><button class="ghost-btn" id="pdfV115ExportImage">Export as Image</button><span id="pdfV115Status" class="status-inline">Open a PDF to start.</span></div>`;
    sec.appendChild(panel);
    launch.onclick=()=>{panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'})};$('pdfV115Close').onclick=()=>panel.hidden=true;
    let pages=[],current=0,selectedSet=new Set(),pageNums=false,gridMode=false,cropMode=false,perspMode=false,crop={x:.05,y:.05,w:.9,h:.9},pts=null,cropDrag=null,perspDrag=null;
    const stage=$('pdfV115Stage'),canvas=$('pdfV115Canvas'),box=$('pdfV115CropBox'),pl=$('pdfV115PerspectiveLayer'),grid=$('pdfV115Grid'),status=t=>$('pdfV115Status').textContent=t;
    function rotateCanvas(src,deg){const r=((deg%360)+360)%360;if(!r)return src;const o=document.createElement('canvas');if(r===90||r===270){o.width=src.height;o.height=src.width}else{o.width=src.width;o.height=src.height}const x=o.getContext('2d');x.translate(o.width/2,o.height/2);x.rotate(r*Math.PI/180);x.drawImage(src,-src.width/2,-src.height/2);return o}
    function colorCanvas(src,mode){if(!mode||mode==='original')return src;const o=document.createElement('canvas');o.width=src.width;o.height=src.height;const x=o.getContext('2d');x.drawImage(src,0,0);const d=x.getImageData(0,0,o.width,o.height),a=d.data;for(let i=0;i<a.length;i+=4){const lum=.299*a[i]+.587*a[i+1]+.114*a[i+2];if(mode==='gray')a[i]=a[i+1]=a[i+2]=lum;else if(mode==='bw'){const v=lum>170?255:0;a[i]=a[i+1]=a[i+2]=v}else if(mode==='document'){const v=lum>208?255:lum<92?0:clamp((lum-92)*2.25,0,255);a[i]=a[i+1]=a[i+2]=v}else if(mode==='vivid'){a[i]=clamp((a[i]-128)*1.18+128,0,255);a[i+1]=clamp((a[i+1]-128)*1.18+128,0,255);a[i+2]=clamp((a[i+2]-128)*1.18+128,0,255)}}x.putImageData(d,0,0);return o}
    function cropCanvas(src,r){if(!r)return src;const o=document.createElement('canvas');o.width=Math.max(1,Math.round(src.width*r.w));o.height=Math.max(1,Math.round(src.height*r.h));o.getContext('2d').drawImage(src,src.width*r.x,src.height*r.y,src.width*r.w,src.height*r.h,0,0,o.width,o.height);return o}
    function processed(p,{ignoreCrop=false,ignoreColor=false}={}){let c=document.createElement('canvas');c.width=p.canvas.width;c.height=p.canvas.height;c.getContext('2d').drawImage(p.canvas,0,0);c=rotateCanvas(c,p.rotation||0);if(!ignoreCrop)c=cropCanvas(c,p.crop);if(!ignoreColor)c=colorCanvas(c,p.color);return c}
    function render(){const p=pages[current];if(!p){canvas.width=canvas.height=0;return}const out=processed(p,{ignoreCrop:cropMode,ignoreColor:false});canvas.width=out.width;canvas.height=out.height;canvas.getContext('2d').drawImage(out,0,0);requestAnimationFrame(()=>{renderCrop();renderPerspective()})}
    async function pdfToPages(f){const m=await pdfJs(),pdf=await m.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise,out=[];for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n),vp=pg.getViewport({scale:1.65}),c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(vp.width));c.height=Math.max(1,Math.ceil(vp.height));await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;out.push({canvas:c,name:`Page ${n}`,rotation:0,crop:null,color:'original'})}return out}
    async function openPdf(f){status('Loading PDF pages…');pages=await pdfToPages(f);current=0;selectedSet=new Set([0]);gridMode=false;grid.hidden=true;canvas.hidden=false;thumbs();render();status(`Loaded ${pages.length} page(s). Drag thumbnails or use Show All Pages to arrange.`)}
    $('pdfV115Input').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{await openPdf(f)}catch(err){console.error(err);status('Could not load this PDF.')}e.target.value=''};
    function selectPage(i,add=false){current=clamp(i,0,Math.max(0,pages.length-1));if(add){selectedSet.has(current)?selectedSet.delete(current):selectedSet.add(current)}else selectedSet=new Set([current]);thumbs();render();if(gridMode)renderGrid()}
    function thumbCanvas(p,max=130){const src=processed(p),sc=Math.min(1,max/Math.max(src.width,src.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(src.width*sc));c.height=Math.max(1,Math.round(src.height*sc));c.getContext('2d').drawImage(src,0,0,c.width,c.height);return c}
    function reorder(from,to){if(from===to||from<0||to<0||from>=pages.length||to>=pages.length)return;const [p]=pages.splice(from,1);pages.splice(to,0,p);const remap=i=>i===from?to:(from<to&&i>from&&i<=to?i-1:(to<from&&i>=to&&i<from?i+1:i));current=remap(current);selectedSet=new Set([...selectedSet].map(remap));thumbs();render();if(gridMode)renderGrid()}
    function thumbs(){const w=$('pdfV115Thumbs');w.innerHTML='';pages.forEach((p,i)=>{const d=document.createElement('div');d.className='pdf-v114-thumb'+(i===current?' active':'')+(selectedSet.has(i)?' selected':'');d.draggable=true;d.dataset.i=i;d.appendChild(thumbCanvas(p));const s=document.createElement('span');s.textContent=`${i+1}${selectedSet.has(i)?' ✓':''}`;d.appendChild(s);d.onclick=e=>selectPage(i,e.ctrlKey||e.metaKey||e.shiftKey);d.ondragstart=e=>e.dataTransfer.setData('text/plain',String(i));d.ondragover=e=>e.preventDefault();d.ondrop=e=>{e.preventDefault();reorder(+e.dataTransfer.getData('text/plain'),i)};w.appendChild(d)})}
    function renderGrid(){grid.innerHTML='';pages.forEach((p,i)=>{const d=document.createElement('div');d.className='pdf-v115-grid-item'+(i===current?' active':'')+(selectedSet.has(i)?' selected':'');d.draggable=true;d.dataset.i=i;d.appendChild(thumbCanvas(p,220));const bar=document.createElement('div');bar.className='pdf-v115-grid-actions';bar.innerHTML=`<span>Page ${i+1}</span><button data-a="rot">↷</button><button data-a="del">🗑</button>`;d.appendChild(bar);d.onclick=e=>{const a=e.target.dataset.a;if(a==='rot'){p.rotation=(p.rotation+90)%360;thumbs();renderGrid();if(i===current)render();return}if(a==='del'){deleteIndices([i]);return}selectPage(i,e.ctrlKey||e.metaKey||e.shiftKey)};d.ondragstart=e=>e.dataTransfer.setData('text/plain',String(i));d.ondragover=e=>e.preventDefault();d.ondrop=e=>{e.preventDefault();reorder(+e.dataTransfer.getData('text/plain'),i)};grid.appendChild(d)})}
    $('pdfV115Pages').onclick=()=>{if(!pages.length)return status('Open a PDF first.');gridMode=!gridMode;grid.hidden=!gridMode;canvas.hidden=gridMode;box.hidden=true;pl.hidden=true;cropMode=perspMode=false;$('pdfV115Pages').textContent=gridMode?'Back to Page':'Show All Pages';if(gridMode)renderGrid();else render()};
    function indicesFor(mode){const all=pages.map((_,i)=>i);if(mode==='current')return pages[current]?[current]:[];if(mode==='selected')return [...selectedSet].sort((a,b)=>a-b);if(mode==='even')return all.filter(i=>(i+1)%2===0);if(mode==='odd')return all.filter(i=>(i+1)%2===1);return all}
    function actionIndices(){return indicesFor($('pdfV115Scope').value)}
    function deleteIndices(idx){const del=new Set(idx);pages=pages.filter((_,i)=>!del.has(i));current=Math.min(current,Math.max(0,pages.length-1));selectedSet=pages.length?new Set([current]):new Set();thumbs();if(gridMode)renderGrid();else render();status(`Deleted ${del.size} page(s).`)}
    $('pdfV115Delete').onclick=()=>{const idx=actionIndices();if(!idx.length)return;deleteIndices(idx)};
    $('pdfV115RotL').onclick=()=>{actionIndices().forEach(i=>pages[i].rotation=(pages[i].rotation-90)%360);thumbs();render();if(gridMode)renderGrid()};
    $('pdfV115RotR').onclick=()=>{actionIndices().forEach(i=>pages[i].rotation=(pages[i].rotation+90)%360);thumbs();render();if(gridMode)renderGrid()};
    $('pdfV115Color').onchange=e=>{actionIndices().forEach(i=>pages[i].color=e.target.value);thumbs();render();if(gridMode)renderGrid()};
    $('pdfV115Blank').onclick=()=>{const ref=pages[current]?.canvas,c=document.createElement('canvas');c.width=ref?.width||1240;c.height=ref?.height||1754;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);const at=pages.length?current+1:0;pages.splice(at,0,{canvas:c,name:'Blank page',rotation:0,crop:null,color:'original'});selectPage(at);if(gridMode)renderGrid();status('Blank page inserted after current page.')};
    $('pdfV115InsertPdf').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{status('Importing PDF pages…');const add=await pdfToPages(f),at=pages.length?current+1:0;pages.splice(at,0,...add);selectPage(at);if(gridMode)renderGrid();status(`Inserted ${add.length} page(s) after current page.`)}catch(err){console.error(err);status('Could not insert this PDF.')}e.target.value=''};
    function renderCrop(){if(box.hidden||!canvas.width)return;const cr=canvas.getBoundingClientRect(),sr=stage.getBoundingClientRect();box.style.left=(cr.left-sr.left+crop.x*cr.width)+'px';box.style.top=(cr.top-sr.top+crop.y*cr.height)+'px';box.style.width=(crop.w*cr.width)+'px';box.style.height=(crop.h*cr.height)+'px'}
    box.addEventListener('pointerdown',e=>{e.preventDefault();const cr=canvas.getBoundingClientRect();cropDrag={h:e.target.dataset.h||'move',sx:e.clientX,sy:e.clientY,r:{...crop},cw:cr.width,ch:cr.height};box.setPointerCapture?.(e.pointerId)});
    window.addEventListener('pointermove',e=>{if(!cropDrag)return;const dx=(e.clientX-cropDrag.sx)/cropDrag.cw,dy=(e.clientY-cropDrag.sy)/cropDrag.ch,r={...cropDrag.r},h=cropDrag.h,min=.02;if(h==='move'){r.x=clamp(r.x+dx,0,1-r.w);r.y=clamp(r.y+dy,0,1-r.h)}else{if(h.includes('w')){const nx=clamp(r.x+dx,0,r.x+r.w-min);r.w+=r.x-nx;r.x=nx}if(h.includes('e'))r.w=clamp(r.w+dx,min,1-r.x);if(h.includes('n')){const ny=clamp(r.y+dy,0,r.y+r.h-min);r.h+=r.y-ny;r.y=ny}if(h.includes('s'))r.h=clamp(r.h+dy,min,1-r.y)}crop=r;renderCrop()});window.addEventListener('pointerup',()=>cropDrag=null);
    function enterCrop(r){cropMode=true;perspMode=false;pl.hidden=true;crop=r||{x:.04,y:.04,w:.92,h:.92};render();box.hidden=false;$('pdfV115Crop').textContent='Apply Crop';requestAnimationFrame(renderCrop)}
    $('pdfV115Crop').onclick=()=>{if(!pages.length)return status('Open a PDF first.');if(!cropMode){enterCrop(pages[current].crop||{x:.04,y:.04,w:.92,h:.92})}else{actionIndices().forEach(i=>pages[i].crop={...crop});cropMode=false;box.hidden=true;$('pdfV115Crop').textContent='Crop';thumbs();render();if(gridMode)renderGrid();status(`Crop applied to ${actionIndices().length} page(s).`)}};
    function detectRect(src){if(typeof cv==='undefined'||!cv.Mat)return null;const max=1700,sc=Math.min(1,max/Math.max(src.width,src.height)),dc=document.createElement('canvas');dc.width=Math.max(1,Math.round(src.width*sc));dc.height=Math.max(1,Math.round(src.height*sc));dc.getContext('2d').drawImage(src,0,0,dc.width,dc.height);const im=cv.imread(dc),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat(),contours=new cv.MatVector(),hier=new cv.Mat();let best=null;try{cv.cvtColor(im,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);for(const pair of [[25,90],[40,130],[60,180]]){cv.Canny(blur,pair[0],pair[1],edges);cv.dilate(edges,edges,cv.Mat.ones(3,3,cv.CV_8U));cv.findContours(edges,contours,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);for(let i=0;i<contours.size();i++){const q=contours.get(i),area=Math.abs(cv.contourArea(q));if(area<dc.width*dc.height*.08)continue;const r=cv.boundingRect(q),ar=(r.width*r.height)/(dc.width*dc.height),fill=area/Math.max(1,r.width*r.height),touch=(r.x<3&&r.y<3&&r.x+r.width>dc.width-3&&r.y+r.height>dc.height-3);const score=ar+fill*.35-(touch?.7:0);if(r.width>dc.width*.25&&r.height>dc.height*.25&&(!best||score>best.score))best={r,score}}if(best&&best.score>.45)break}if(!best)return null;const r=best.r;return{x:clamp(r.x/dc.width,0,1),y:clamp(r.y/dc.height,0,1),w:clamp(r.width/dc.width,.02,1-r.x/dc.width),h:clamp(r.height/dc.height,.02,1-r.y/dc.height)}}finally{[im,gray,blur,edges,hier].forEach(x=>x.delete());contours.delete()}}
    $('pdfV115Auto').onclick=()=>{if(!pages.length)return status('Open a PDF first.');const base=processed(pages[current],{ignoreCrop:true,ignoreColor:true}),r=detectRect(base);if(r){enterCrop(r);status('Document boundary detected. Adjust the crop if needed, then Apply Crop.')}else{enterCrop({x:.02,y:.02,w:.96,h:.96});status('No strong edge was found; a full-page crop is ready for manual adjustment.')}};
    function renderPerspective(){if(pl.hidden||!pts||!canvas.width)return;const cr=canvas.getBoundingClientRect(),sr=stage.getBoundingClientRect();pl.style.left=(cr.left-sr.left)+'px';pl.style.top=(cr.top-sr.top)+'px';pl.style.width=cr.width+'px';pl.style.height=cr.height+'px';$('pdfV115Poly').setAttribute('points',pts.map(p=>`${p.x*100},${p.y*100}`).join(' '));pl.querySelectorAll('b').forEach((b,i)=>{b.style.left=pts[i].x*100+'%';b.style.top=pts[i].y*100+'%'})}
    pl.querySelectorAll('b').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();perspDrag=+b.dataset.i;b.setPointerCapture?.(e.pointerId)};b.onpointermove=e=>{if(perspDrag==null)return;const cr=canvas.getBoundingClientRect();pts[perspDrag]={x:clamp((e.clientX-cr.left)/cr.width,0,1),y:clamp((e.clientY-cr.top)/cr.height,0,1)};renderPerspective()};b.onpointerup=b.onpointercancel=()=>perspDrag=null});
    $('pdfV115Perspective').onclick=async()=>{if(!pages.length)return status('Open a PDF first.');if(!perspMode){perspMode=true;cropMode=false;box.hidden=true;const base=processed(pages[current],{ignoreCrop:true,ignoreColor:true});canvas.width=base.width;canvas.height=base.height;canvas.getContext('2d').drawImage(base,0,0);pts=[{x:.04,y:.04},{x:.96,y:.04},{x:.96,y:.96},{x:.04,y:.96}];pl.hidden=false;$('pdfV115Perspective').textContent='Apply Perspective';requestAnimationFrame(renderPerspective);return}if(typeof cv==='undefined'||!cv.Mat)return status('Perspective engine is still loading.');try{const src=canvas,px=pts.map(p=>({x:p.x*src.width,y:p.y*src.height})),w=Math.max(Math.hypot(px[1].x-px[0].x,px[1].y-px[0].y),Math.hypot(px[2].x-px[3].x,px[2].y-px[3].y)),h=Math.max(Math.hypot(px[3].x-px[0].x,px[3].y-px[0].y),Math.hypot(px[2].x-px[1].x,px[2].y-px[1].y)),sm=cv.imread(src),sp=cv.matFromArray(4,1,cv.CV_32FC2,px.flatMap(p=>[p.x,p.y])),dp=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]),M=cv.getPerspectiveTransform(sp,dp),dst=new cv.Mat();cv.warpPerspective(sm,dst,M,new cv.Size(Math.max(1,Math.round(w)),Math.max(1,Math.round(h))),cv.INTER_CUBIC,cv.BORDER_REPLICATE,new cv.Scalar());const o=document.createElement('canvas');cv.imshow(o,dst);[sm,sp,dp,M,dst].forEach(x=>x.delete());pages[current]={...pages[current],canvas:o,rotation:0,crop:null};perspMode=false;pl.hidden=true;$('pdfV115Perspective').textContent='Perspective Crop';thumbs();render();if(gridMode)renderGrid();status('Perspective crop applied.')}catch(err){console.error(err);status('Perspective crop could not be applied. Adjust the four corners and try again.')}};
    $('pdfV115Numbers').onclick=()=>{pageNums=!pageNums;$('pdfV115Numbers').textContent=`Page Numbers: ${pageNums?'On':'Off'}`};
    function parseRange(s,max){const out=[];for(const part of String(s||'').split(',').map(x=>x.trim()).filter(Boolean)){if(part.includes('-')){let[a,b]=part.split('-').map(Number);if(a>b)[a,b]=[b,a];for(let n=a;n<=b;n++)if(n>=1&&n<=max)out.push(n-1)}else{const n=+part;if(n>=1&&n<=max)out.push(n-1)}}return[...new Set(out)]}
    function exportIndices(){const m=$('pdfV115ExportMode').value;if(m==='range')return parseRange($('pdfV115Range').value,pages.length);return indicesFor(m)}
    $('pdfV115ExportPdf').onclick=async()=>{const idx=exportIndices();if(!idx.length)return status('No pages selected for export.');status('Exporting PDF…');try{const doc=await PDFLib.PDFDocument.create(),font=pageNums?await doc.embedFont(PDFLib.StandardFonts.Helvetica):null;for(let k=0;k<idx.length;k++){const out=processed(pages[idx[k]]),b=await blobOf(out,'image/jpeg',.93),im=await doc.embedJpg(await b.arrayBuffer()),pg=doc.addPage([im.width,im.height]);pg.drawImage(im,{x:0,y:0,width:im.width,height:im.height});if(pageNums)pg.drawText(String(k+1),{x:pg.getWidth()/2-4,y:12,size:10,font,color:PDFLib.rgb(.15,.15,.15)})}downloadBytes(await doc.save({useObjectStreams:true}),'pdf-studio-export.pdf','application/pdf');status(`Exported ${idx.length} page(s) as PDF.`)}catch(err){console.error(err);status('PDF export failed.')}};
    $('pdfV115ExportImage').onclick=async()=>{const idx=exportIndices();if(!idx.length)return status('No pages selected for export.');const type=$('pdfV115ImageType').value==='jpeg'?'image/jpeg':'image/png',ext=type==='image/jpeg'?'jpg':'png';status(`Exporting ${idx.length} image(s)…`);try{if(idx.length===1){const out=processed(pages[idx[0]]),b=await blobOf(out,type,.94);downloadBlob(b,`pdf-page-${idx[0]+1}.${ext}`)}else if(typeof JSZip!=='undefined'){const zip=new JSZip();for(const i of idx){const out=processed(pages[i]),b=await blobOf(out,type,.94);zip.file(`pdf-page-${i+1}.${ext}`,b)}downloadBlob(await zip.generateAsync({type:'blob'}),`pdf-pages-${ext}.zip`)}else{for(const i of idx){const out=processed(pages[i]),b=await blobOf(out,type,.94);downloadBlob(b,`pdf-page-${i+1}.${ext}`);await new Promise(r=>setTimeout(r,150))}}status(`Exported ${idx.length} page(s) as ${ext.toUpperCase()}.`)}catch(err){console.error(err);status('Image export failed.')}};
    window.addEventListener('resize',()=>{renderCrop();renderPerspective()});
  })();


  document.title='Shop Studio Pro v11.9.2'; const bs=document.querySelector('.brand-subtitle');if(bs)bs.textContent='PRO TOOLKIT • V11.9.2';
})();
