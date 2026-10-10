/* Shop Studio Pro v11.7 — focused stabilization: Print Studio, Target-KB removal, Smart Card drag/drop */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mm2px=(mm,dpi=300)=>Math.max(1,Math.round((+mm||0)/25.4*dpi));
const blobOf=(c,t='image/png',q=.95)=>new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Canvas export failed')),t,q));
const imgFile=f=>new Promise((res,rej)=>{const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=e=>{URL.revokeObjectURL(u);rej(e)};im.src=u});
const imgCanvas=c=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=c.toDataURL('image/png')});
const download=(b,n)=>{const a=document.createElement('a'),u=URL.createObjectURL(b);a.href=u;a.download=window.shopAutoFilename?window.shopAutoFilename(n):n;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)};
const pdfjs=async()=>{const m=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');m.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';return m};

function removeTargetKbUI(){
  document.querySelectorAll('[data-section="compressor"],[data-section-jump="compressor"]').forEach(n=>n.remove());
  const sec=$('compressor');if(sec){sec.hidden=true;sec.setAttribute('aria-hidden','true');sec.classList.remove('active');}
  const rt=$('resizeTargetKb');if(rt){const lab=rt.closest('label');if(lab)lab.hidden=true;rt.value='';}
  if(location.hash==='#compressor')window.__shopShowSection?.('home');
}

function setPassportDefaults(){
  const set=()=>{const m=$('ps116Margin'),g=$('ps116Gap'),bm=$('passportMargin'),bg=$('passportGap');if(m)m.value='3';if(g)g.value='4.5';if(bm)bm.value='3';if(bg)bg.value='4.5';};
  set();
  const b=$('makePassportSheet');if(b)b.addEventListener('click',()=>setTimeout(()=>{set();$('passportSheetRegenV116')?.click()},0),true);
}

function rebuildPrintStudio(){
  const old=$('print');if(!old)return;
  const sec=document.createElement('section');sec.className='section';sec.id='print';sec.innerHTML=`
    <div class="panel compact-tool print117-panel">
      <div class="workspace-head"><div><span class="eyebrow">PRINT STUDIO</span><h2>Collage & Layout</h2></div><div class="button-row"><label class="upload-btn">Load Images<input id="p117Images" type="file" accept="image/*" multiple hidden></label><label class="ghost-btn">Load PDF<input id="p117Pdf" type="file" accept="application/pdf" hidden></label></div></div>
      <div class="compact-controls">
        <label>Layout<select id="p117Count"><option>4</option><option>6</option><option selected>8</option><option>9</option><option>12</option></select></label>
        <label>Paper<select id="p117Paper"><option value="6x4">6×4</option><option value="a4">A4</option></select></label>
        <label>Orientation<select id="p117Orientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
        <label>Margin (mm)<input id="p117Margin" type="number" value="4" min="0" step="0.5"></label>
        <label>Gap (mm)<input id="p117Gap" type="number" value="3" min="0" step="0.5"></label>
        <label>DPI<select id="p117Dpi"><option value="300" selected>300</option><option value="600">600</option></select></label>
        <label>Snap<input id="p117Snap" type="checkbox" checked></label>
      </div>
      <div class="print117-tools"><button class="ghost-btn" id="p117Crop">Crop Selected</button><button class="ghost-btn" id="p117ResetCrop">Reset Crop</button><button class="ghost-btn" id="p117AlignL">Align Left</button><button class="ghost-btn" id="p117AlignCX">Center X</button><button class="ghost-btn" id="p117AlignT">Align Top</button><button class="ghost-btn" id="p117AlignCY">Center Y</button><button class="ghost-btn" id="p117Delete">Delete</button></div>
      <div class="status-inline" id="p117Status">Load images or a PDF. Click an image to select it; drag to move, use blue handles to resize, or click Crop.</div>
      <div class="canvas-wrap print117-wrap" id="p117Wrap"><canvas id="p117Canvas"></canvas><div id="p117Layer" class="print117-layer"></div><div class="empty-state" id="p117Empty">Upload images to begin</div></div>
      <div class="print117-crop-panel" id="p117CropPanel" hidden><div class="workspace-head"><div><span class="eyebrow">INDIVIDUAL IMAGE CROP</span><h3 id="p117CropTitle">Crop selected image</h3></div><button class="ghost-btn" id="p117CropClose">Close</button></div><div class="print117-crop-stage" id="p117CropStage"><div class="print117-crop-shell"><canvas id="p117CropCanvas"></canvas><div id="p117CropBox" class="print117-crop-box">${['nw','n','ne','e','se','s','sw','w'].map(h=>`<i class="${h}" data-h="${h}"></i>`).join('')}</div></div></div><div class="workspace-actions"><button class="ghost-btn" id="p117RotateLeft" type="button">↶ Rotate Left</button><button class="ghost-btn" id="p117RotateRight" type="button">↷ Rotate Right</button><button class="primary-btn" id="p117CropApply">Apply Crop</button><button class="ghost-btn" id="p117CropReset">Full Image</button></div></div>
      <div class="workspace-actions"><button class="primary-btn" id="p117Build">Build / Reset Layout</button><button class="ghost-btn" id="p117Png">PNG</button><button class="ghost-btn" id="p117PdfOut">PDF</button><button class="ghost-btn" id="p117Print">Print</button></div>
    </div>`;
  const active=old.classList.contains('active');old.replaceWith(sec);if(active)sec.classList.add('active');

  const canvas=$('p117Canvas'),wrap=$('p117Wrap'),layer=$('p117Layer');let sources=[],items=[],selected=new Set(),activeIndex=-1;
  const paper=()=>{const dpi=+$('p117Dpi').value||300,p=$('p117Paper').value,o=$('p117Orientation').value;let w=p==='a4'?mm2px(210,dpi):6*dpi,h=p==='a4'?mm2px(297,dpi):4*dpi;if(o==='landscape'&&h>w)[w,h]=[h,w];if(o==='portrait'&&w>h)[w,h]=[h,w];return{w,h,dpi}};
  function status(t){$('p117Status').textContent=t}
  function layout(){if(!sources.length)return draw();const {w,h,dpi}=paper(),n=Math.max(1,+$('p117Count').value||sources.length),cols=Math.ceil(Math.sqrt(n*w/h)),rows=Math.ceil(n/cols),m=mm2px(+$('p117Margin').value,dpi),g=mm2px(+$('p117Gap').value,dpi),cw=(w-2*m-(cols-1)*g)/cols,ch=(h-2*m-(rows-1)*g)/rows;items=[];for(let i=0;i<n;i++){const s=sources[i%sources.length];items.push({img:s.img,name:s.name,x:(m+(i%cols)*(cw+g))/w,y:(m+Math.floor(i/cols)*(ch+g))/h,w:cw/w,h:ch/h,crop:{x:0,y:0,w:1,h:1}})}selected=new Set(items.length?[0]:[]);activeIndex=items.length?0:-1;draw();status(`${items.length} item(s) • drag image to move • blue handles resize • Crop edits only the selected image.`)}
  function draw(){const {w,h}=paper();canvas.width=w;canvas.height=h;const x=canvas.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';for(const it of items){const r=it.crop||{x:0,y:0,w:1,h:1};x.drawImage(it.img,r.x*it.img.width,r.y*it.img.height,r.w*it.img.width,r.h*it.img.height,it.x*w,it.y*h,it.w*w,it.h*h)}$('p117Empty').style.display=items.length?'none':'';requestAnimationFrame(overlay)}
  function overlay(){const cr=canvas.getBoundingClientRect(),wr=wrap.getBoundingClientRect();if(!cr.width)return;Object.assign(layer.style,{left:(cr.left-wr.left+wrap.scrollLeft)+'px',top:(cr.top-wr.top+wrap.scrollTop)+'px',width:cr.width+'px',height:cr.height+'px'});layer.innerHTML='';items.forEach((it,i)=>{const d=document.createElement('div');d.className='print117-item'+(selected.has(i)?' selected':'');Object.assign(d.style,{left:it.x*100+'%',top:it.y*100+'%',width:it.w*100+'%',height:it.h*100+'%'});d.dataset.i=i;const cropBtn=document.createElement('button');cropBtn.type='button';cropBtn.className='print117-crop-mini';cropBtn.textContent='Crop';cropBtn.onclick=e=>{e.stopPropagation();activeIndex=i;selected=new Set([i]);openCrop();overlay()};d.appendChild(cropBtn);['nw','n','ne','e','se','s','sw','w'].forEach(h=>{const q=document.createElement('i');q.className='print117-handle '+h;q.dataset.h=h;d.appendChild(q)});d.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();e.stopPropagation();if(!e.ctrlKey&&!e.metaKey&&!selected.has(i))selected.clear();selected.add(i);activeIndex=i;overlay();const hnd=e.target.dataset.h||'move',base=items.map(v=>({...v,crop:{...v.crop}})),sx=e.clientX,sy=e.clientY;const mv=ev=>{const dx=(ev.clientX-sx)/cr.width,dy=(ev.clientY-sy)/cr.height,min=.025;selected.forEach(k=>{const b=base[k],n={...b,crop:{...b.crop}};if(hnd==='move'){n.x=clamp(b.x+dx,0,1-b.w);n.y=clamp(b.y+dy,0,1-b.h)}else{if(hnd.includes('w')){const nx=clamp(b.x+dx,0,b.x+b.w-min);n.w=b.w+(b.x-nx);n.x=nx}if(hnd.includes('e'))n.w=clamp(b.w+dx,min,1-b.x);if(hnd.includes('n')){const ny=clamp(b.y+dy,0,b.y+b.h-min);n.h=b.h+(b.y-ny);n.y=ny}if(hnd.includes('s'))n.h=clamp(b.h+dy,min,1-b.y)}items[k]=n});draw()};const up=()=>{document.removeEventListener('pointermove',mv,true);document.removeEventListener('pointerup',up,true)};document.addEventListener('pointermove',mv,true);document.addEventListener('pointerup',up,true)});layer.appendChild(d)})}
  async function addFiles(files){for(const f of files){try{sources.push({img:await imgFile(f),name:f.name})}catch(e){console.warn(e)}}layout()}
  $('p117Images').onchange=e=>{addFiles([...e.target.files]);e.target.value=''};
  $('p117Pdf').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;status('Loading PDF pages…');try{const m=await pdfjs(),pdf=await m.getDocument({data:new Uint8Array(await f.arrayBuffer())}).promise;for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),v=p.getViewport({scale:2}),c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;sources.push({img:await imgCanvas(c),name:`${f.name} p${n}`})}layout()}catch(err){console.error(err);status('Could not load this PDF.')}e.target.value=''};
  // Individual crop editor.
  const cp=$('p117CropPanel'),cc=$('p117CropCanvas'),cb=$('p117CropBox');let crop={x:0,y:0,w:1,h:1},cd=null;
  function renderCrop(){cb.style.left=crop.x*100+'%';cb.style.top=crop.y*100+'%';cb.style.width=crop.w*100+'%';cb.style.height=crop.h*100+'%'}
  function openCrop(){if(activeIndex<0||!items[activeIndex])return status('Select an image first.');const it=items[activeIndex];cc.width=it.img.width;cc.height=it.img.height;cc.getContext('2d').drawImage(it.img,0,0);crop={...(it.crop||{x:0,y:0,w:1,h:1})};$('p117CropTitle').textContent=`Crop • ${it.name}`;cp.hidden=false;renderCrop();cp.scrollIntoView({behavior:'smooth',block:'nearest'})}
  const cmove=e=>{if(!cd||e.pointerId!==cd.id)return;e.preventDefault();const r=cc.getBoundingClientRect(),dx=(e.clientX-cd.sx)/r.width,dy=(e.clientY-cd.sy)/r.height,n={...cd.r},h=cd.h,min=.02;if(h==='move'){n.x=clamp(cd.r.x+dx,0,1-cd.r.w);n.y=clamp(cd.r.y+dy,0,1-cd.r.h)}else{if(h.includes('w')){const nx=clamp(cd.r.x+dx,0,cd.r.x+cd.r.w-min);n.w=cd.r.w+(cd.r.x-nx);n.x=nx}if(h.includes('e'))n.w=clamp(cd.r.w+dx,min,1-cd.r.x);if(h.includes('n')){const ny=clamp(cd.r.y+dy,0,cd.r.y+cd.r.h-min);n.h=cd.r.h+(cd.r.y-ny);n.y=ny}if(h.includes('s'))n.h=clamp(cd.r.h+dy,min,1-cd.r.y)}crop=n;renderCrop()};
  const cup=e=>{if(!cd||e.pointerId!==cd.id)return;cd=null;document.removeEventListener('pointermove',cmove,true);document.removeEventListener('pointerup',cup,true);document.removeEventListener('pointercancel',cup,true)};
  cb.onpointerdown=e=>{e.preventDefault();e.stopPropagation();cd={id:e.pointerId,h:e.target.dataset.h||'move',sx:e.clientX,sy:e.clientY,r:{...crop}};document.addEventListener('pointermove',cmove,true);document.addEventListener('pointerup',cup,true);document.addEventListener('pointercancel',cup,true)};
  async function rotateCropImage(dir){
    if(activeIndex<0||!items[activeIndex])return status('Select an image first.');
    const it=items[activeIndex],src=it.img,c=document.createElement('canvas');c.width=src.height;c.height=src.width;const x=c.getContext('2d');
    x.translate(c.width/2,c.height/2);x.rotate(dir*Math.PI/2);x.drawImage(src,-src.width/2,-src.height/2);
    it.img=await imgCanvas(c);
    const r={...crop};crop=dir>0?{x:1-r.y-r.h,y:r.x,w:r.h,h:r.w}:{x:r.y,y:1-r.x-r.w,w:r.h,h:r.w};
    it.crop={...crop};cc.width=it.img.width;cc.height=it.img.height;cc.getContext('2d').drawImage(it.img,0,0);renderCrop();draw();status(`Item ${activeIndex+1} rotated ${dir>0?'right':'left'} 90°.`);
  }
  $('p117Crop').onclick=openCrop;$('p117CropClose').onclick=()=>cp.hidden=true;$('p117CropReset').onclick=()=>{crop={x:0,y:0,w:1,h:1};renderCrop()};$('p117RotateLeft').onclick=()=>rotateCropImage(-1);$('p117RotateRight').onclick=()=>rotateCropImage(1);$('p117CropApply').onclick=()=>{if(activeIndex<0)return;items[activeIndex].crop={...crop};cp.hidden=true;draw();status(`Crop applied to item ${activeIndex+1}.`)};$('p117ResetCrop').onclick=()=>{if(activeIndex<0)return;items[activeIndex].crop={x:0,y:0,w:1,h:1};draw()};
  function align(kind){if(!selected.size)return;const a=[...selected].map(i=>items[i]);if(kind==='l'){const v=Math.min(...a.map(x=>x.x));selected.forEach(i=>items[i].x=v)}if(kind==='cx')selected.forEach(i=>items[i].x=(1-items[i].w)/2);if(kind==='t'){const v=Math.min(...a.map(x=>x.y));selected.forEach(i=>items[i].y=v)}if(kind==='cy')selected.forEach(i=>items[i].y=(1-items[i].h)/2);draw()}
  $('p117AlignL').onclick=()=>align('l');$('p117AlignCX').onclick=()=>align('cx');$('p117AlignT').onclick=()=>align('t');$('p117AlignCY').onclick=()=>align('cy');$('p117Delete').onclick=()=>{if(!selected.size)return;items=items.filter((_,i)=>!selected.has(i));selected=new Set(items.length?[0]:[]);activeIndex=items.length?0:-1;draw()};
  ['p117Count','p117Paper','p117Orientation','p117Margin','p117Gap','p117Dpi'].forEach(id=>$(id).onchange=()=>sources.length&&layout());$('p117Build').onclick=()=>sources.length?layout():$('p117Images').click();
  $('p117Png').onclick=async()=>items.length&&download(await blobOf(canvas,'image/png'),'print-layout.png');$('p117PdfOut').onclick=async()=>{if(!items.length||!window.PDFLib)return;const doc=await PDFLib.PDFDocument.create(),im=await doc.embedPng(await (await blobOf(canvas,'image/png')).arrayBuffer()),p=doc.addPage([im.width,im.height]);p.drawImage(im,{x:0,y:0,width:im.width,height:im.height});download(new Blob([await doc.save()],{type:'application/pdf'}),'print-layout.pdf')};$('p117Print').onclick=()=>{if(!items.length)return;const u=canvas.toDataURL('image/png'),w=open('','_blank');if(!w)return;w.document.write(`<html><head><style>@page{margin:0}body{margin:0;display:grid;place-items:center}img{max-width:100%;max-height:100vh}</style></head><body><img src="${u}" onload="print();setTimeout(()=>close(),500)"></body></html>`);w.document.close()};
  window.addEventListener('resize',overlay);
}

function installSmartCardDragDrop(){
  const sec=$('cards'),source=$('cardSourceCanvas'),front=$('cardFrontPreview'),back=$('cardBackPreview');if(!sec||!source||!front||!back)return;
  const row=front.closest('.saved-card-row');if(!row)return;
  row.classList.add('card117-drop-row');
  const decorate=(canvas,side)=>{const box=canvas.parentElement;box.classList.add('card117-drop-zone');box.dataset.side=side;let hint=box.querySelector('.card117-hint');if(!hint){hint=document.createElement('div');hint.className='card117-hint';hint.innerHTML=`Drop current canvas here for <b>${side.toUpperCase()}</b><br><small>or click to select ${side}</small>`;box.appendChild(hint)}box.tabIndex=0;box.onclick=e=>{if(e.target.closest('button'))return;setSide(side)};['dragenter','dragover'].forEach(ev=>box.addEventListener(ev,e=>{e.preventDefault();box.classList.add('drag-over')}));['dragleave','drop'].forEach(ev=>box.addEventListener(ev,e=>{e.preventDefault();box.classList.remove('drag-over')}));box.addEventListener('drop',e=>{const files=[...e.dataTransfer.files];if(files.length){const f=files[0],inp=f.type==='application/pdf'||/\.pdf$/i.test(f.name)?$('cardPdfInput'):$('cardImageInput');if(inp){const dt=new DataTransfer();dt.items.add(f);inp.files=dt.files;inp.dispatchEvent(new Event('change',{bubbles:true}));setSide(side);setTimeout(()=>$('saveCardCrop')?.click(),500)}return}setSide(side);$('saveCardCrop')?.click()});};
  function setSide(side){const sel=$('cardCropAction');if(sel){sel.value=side;sel.dispatchEvent(new Event('change',{bubbles:true}))}document.querySelectorAll('#cardSideTabs button').forEach(b=>b.classList.toggle('active',b.dataset.side===side));const btn=$('saveCardCrop');if(btn)btn.textContent=`Apply & Save ${side[0].toUpperCase()+side.slice(1)}`;}
  decorate(front,'front');decorate(back,'back');
  source.draggable=true;source.title='Drag this canvas to Front or Back after adjusting crop.';source.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('text/x-shop-card','current-canvas');});
  let flow=$('card117Flow');if(!flow){flow=document.createElement('div');flow.id='card117Flow';flow.className='status-inline card117-flow';flow.innerHTML='<strong>Fast flow:</strong> Open PDF/Image → crop if required → drag the main canvas to Front/Back, or choose a side and click Apply & Save → Export PVC.';row.insertAdjacentElement('beforebegin',flow)}
}

function strictSectionVisibility(){
  const st=document.createElement('style');st.id='v117StrictVisibility';st.textContent='.section{display:none!important}.section.active{display:block!important}.section:target:not(.active){display:none!important}#compressor{display:none!important}';document.head.appendChild(st);
}

function start(){
  removeTargetKbUI();strictSectionVisibility();rebuildPrintStudio();installSmartCardDragDrop();setPassportDefaults();
  document.title='Shop Studio Pro v11.7';document.querySelector('.brand-subtitle')?.replaceChildren(document.createTextNode('PRO TOOLKIT • V11.7'));const meta=document.querySelector('meta[name="shop-build"]');if(meta)meta.content='11.7.0';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,40));else setTimeout(start,40);
})();
