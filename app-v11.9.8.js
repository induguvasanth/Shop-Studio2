(()=>{
'use strict';
const $=id=>document.getElementById(id);
function printCanvas(canvas,title='Shop Studio Print'){
  if(!canvas||!canvas.width)return alert('Build the sheet first.');
  const u=canvas.toDataURL('image/png'),w=window.open('','_blank');if(!w)return alert('Allow pop-ups to print.');
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>@page{margin:0}html,body{margin:0;min-height:100%}body{display:grid;place-items:center;background:#fff}img{display:block;max-width:100%;max-height:100vh;object-fit:contain}</style></head><body><img src="${u}" onload="setTimeout(()=>window.print(),100)"></body></html>`);w.document.close();
}
function init(){
  document.title='Shop Studio Pro v11.9.8';
  const sub=document.querySelector('.brand-subtitle');if(sub)sub.textContent='PRO TOOLKIT • V11.9.8';
  const meta=document.querySelector('meta[name="shop-build"]');if(meta)meta.content='11.9.8';

  // One clear Apply Crop action directly below Crop / Perspective Crop.
  $('applyCardCrop')?.addEventListener('click',()=>{
    const free=$('cardFreeCropLayer'),persp=$('cardPerspectiveLayer');
    if(free&&getComputedStyle(free).display!=='none') return $('applyCardFlexibleCrop')?.click();
    if(persp&&getComputedStyle(persp).display!=='none') return $('saveCardCrop')?.click();
    // If no overlay is open, open normal crop first so Apply is never destructive/unexpected.
    $('cardSimpleCropBtn')?.click();
  });

  $('printCardSheet')?.addEventListener('click',()=>{
    const c=$('cardCanvas');if(!c?.width){$('buildCardSheet')?.click();setTimeout(()=>printCanvas($('cardCanvas'),'Smart Card Print'),80);return;}printCanvas(c,'Smart Card Print');
  });

  // Google-Lens-like OCR flow: image preview above text, then extract/copy/print.
  const input=$('ocrInput'),preview=$('ocrPreview'),empty=$('ocrPreviewEmpty');let objectUrl='';
  input?.addEventListener('change',()=>{
    const f=input.files?.[0];if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';
    if(!f){if(preview)preview.style.display='none';if(empty)empty.style.display='grid';return;}
    objectUrl=URL.createObjectURL(f);if(preview){preview.src=objectUrl;preview.style.display='block'}if(empty)empty.style.display='none';
    const st=$('ocrStatus');if(st)st.textContent=`Ready to extract • ${f.name}`;
  });
  $('copyOcr')?.addEventListener('click',()=>{const st=$('ocrStatus');if(st&&$('ocrText')?.value)st.textContent='Text copied to clipboard.';});
  $('printOcr')?.addEventListener('click',()=>{
    const src=preview?.src||'',txt=$('ocrText')?.value||'';if(!src&&!txt)return alert('Upload an image or extract text first.');
    const w=window.open('','_blank');if(!w)return alert('Allow pop-ups to print.');
    const safe=txt.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    w.document.write(`<!doctype html><html><head><title>OCR Print</title><style>@page{margin:12mm}body{font-family:Arial,sans-serif;color:#111}img{display:block;max-width:100%;max-height:45vh;margin:0 auto 16px}pre{white-space:pre-wrap;font:14px/1.5 Arial,sans-serif}</style></head><body>${src?`<img src="${src}">`:''}<pre>${safe}</pre><script>onload=()=>setTimeout(()=>print(),150)<\/script></body></html>`);w.document.close();
  });

  // Enhance card/print layout editor after every build: 4 sides + 4 corners + rotate.
  const enhance=()=>document.querySelectorAll('.layout-editor .layout-item').forEach((d,i)=>{
    if(d.dataset.v1198)return;d.dataset.v1198='1';
    ['n','e','s','w'].forEach(pos=>{if(!d.querySelector('.layout-resize.'+pos)){const h=document.createElement('span');h.className='layout-resize '+pos;h.dataset.handle=pos;d.appendChild(h);installSideResize(d,h,pos)}});
    if(!d.querySelector('.layout-rotate')){const r=document.createElement('span');r.className='layout-rotate';r.title='Drag to rotate';d.appendChild(r);installRotate(d,r)}
  });
  function getLayout(node){const ed=node.parentElement,idx=[...ed.children].indexOf(node);try{if(ed.id==='cardSheetEditor')return {arr:state.cardSheetLayout,idx,canvas:$('cardCanvas')};if(ed.id==='printEditor')return {arr:state.printLayout,idx,canvas:$('printCanvas')};}catch{}return null;}
  function redraw(info){const c=info?.canvas,it=info?.arr;if(!c?.width||!it)return;const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);it.forEach(o=>{if(!o.img)return;const px=o.x*c.width,py=o.y*c.height,pw=o.w*c.width,ph=o.h*c.height,a=+o.rotation||0,sc=Math.min(pw/o.img.width,ph/o.img.height),dw=o.img.width*sc,dh=o.img.height*sc;x.save();x.translate(px+pw/2,py+ph/2);x.rotate(a*Math.PI/180);x.drawImage(o.img,-dw/2,-dh/2,dw,dh);x.restore();});}
  function installSideResize(node,h,pos){h.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const info=getLayout(node);if(!info||!info.arr?.[info.idx])return;const base={...info.arr[info.idx]},sx=e.clientX,sy=e.clientY,rect=info.canvas.getBoundingClientRect(),min=.025;const move=ev=>{let n={...base},dx=(ev.clientX-sx)/rect.width,dy=(ev.clientY-sy)/rect.height;if(pos==='e')n.w=Math.max(min,Math.min(1-base.x,base.w+dx));if(pos==='s')n.h=Math.max(min,Math.min(1-base.y,base.h+dy));if(pos==='w'){const nx=Math.max(0,Math.min(base.x+base.w-min,base.x+dx));n.w=base.w+(base.x-nx);n.x=nx}if(pos==='n'){const ny=Math.max(0,Math.min(base.y+base.h-min,base.y+dy));n.h=base.h+(base.y-ny);n.y=ny}info.arr[info.idx]=n;node.style.left=n.x*100+'%';node.style.top=n.y*100+'%';node.style.width=n.w*100+'%';node.style.height=n.h*100+'%';redraw(info)};const up=()=>{document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true)};document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true)},true)}
  function installRotate(item,handle){
    handle.addEventListener('pointerdown',e=>{
      e.preventDefault();e.stopPropagation();const rect=item.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      const base=parseFloat(item.dataset.rotation||'0'),start=Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI;
      const move=ev=>{let a=base+(Math.atan2(ev.clientY-cy,ev.clientX-cx)*180/Math.PI-start);if(ev.shiftKey)a=Math.round(a/15)*15;item.dataset.rotation=String(a);item.style.rotate=a+'deg';syncCanvasRotation(item,a)};
      const up=()=>{document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',up,true)};
      document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);
    },true);
  }
  // Store rotation on the underlying layout item by matching editor/index. The renderer patch in v11.5 reads it.
  function syncCanvasRotation(node,a){
    const ed=node.parentElement,idx=[...ed.children].indexOf(node);try{
      if(ed.id==='cardSheetEditor'&&typeof state!=='undefined'&&state.cardSheetLayout?.[idx])state.cardSheetLayout[idx].rotation=a;
      if(ed.id==='printEditor'&&typeof state!=='undefined'&&state.printLayout?.[idx])state.printLayout[idx].rotation=a;
    }catch{}
  }
  const mo=new MutationObserver(enhance);document.querySelectorAll('.layout-editor').forEach(x=>mo.observe(x,{childList:true,subtree:true}));
  ['buildCardSheet','buildPrintSheet'].forEach(id=>$(id)?.addEventListener('click',()=>setTimeout(enhance,0)));
  enhance();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,120));else setTimeout(init,120);
})();
