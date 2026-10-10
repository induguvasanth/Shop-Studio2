/* Shop Studio Pro v11.9.9 — Smart Card Apply Crop fix + Lens-style OCR selection */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
function init(){
  document.title='Shop Studio Pro v11.9.9';
  const sub=document.querySelector('.brand-subtitle');if(sub)sub.textContent='PRO TOOLKIT • V11.9.9';
  const meta=document.querySelector('meta[name="shop-build"]');if(meta)meta.content='11.9.9';

  // Fix the public Apply Crop button so it applies the CURRENT crop controller.
  const apply=$('applyCardCrop');
  if(apply){
    const fresh=apply.cloneNode(true);apply.replaceWith(fresh);
    fresh.addEventListener('click',()=>{
      const host=$('cardV111CropHost');
      const simpleOpen=host && getComputedStyle(host).display!=='none' && host.querySelector('.v111-crop-box') && getComputedStyle(host.querySelector('.v111-crop-box')).display!=='none';
      let perspectiveOpen=false;
      try{ perspectiveOpen=!!(state?.cardPerspectiveMode && state?.cardPerspectivePts); }catch{}
      if($('cardFreeCropLayer') && getComputedStyle($('cardFreeCropLayer')).display!=='none' && !simpleOpen){ $('applyCardFlexibleCrop')?.click(); return; }
      if(simpleOpen||perspectiveOpen){ $('saveCardCrop')?.click(); return; }
      $('cardSimpleCropBtn')?.click();
    });
  }

  // OCR: reliable preview via FileReader and Google-Lens-like drag selection.
  const input=$('ocrInput'),preview=$('ocrPreview'),wrap=$('ocrImageWrap'),shell=$('ocrPreviewShell'),empty=$('ocrPreviewEmpty'),box=$('ocrSelectBox'),status=$('ocrStatus'),text=$('ocrText');
  if(!input||!preview||!wrap||!shell||!box)return;
  let file=null, drag=null, selection=null;

  function setPreview(f){
    file=f||null;selection=null;box.hidden=true;
    if(!file){wrap.style.display='none';shell.classList.remove('has-image');if(empty)empty.style.display='grid';return;}
    const reader=new FileReader();
    reader.onload=()=>{preview.onload=()=>{wrap.style.display='inline-block';shell.classList.add('has-image');if(empty)empty.style.display='none';if(status)status.textContent=`Ready • drag over text to extract selection • ${file.name}`;};preview.src=reader.result;};
    reader.onerror=()=>{if(status)status.textContent='Could not preview this image.';};reader.readAsDataURL(file);
  }
  input.addEventListener('change',()=>setPreview(input.files?.[0]),true);

  function point(e){const r=preview.getBoundingClientRect();return{x:Math.max(0,Math.min(r.width,e.clientX-r.left)),y:Math.max(0,Math.min(r.height,e.clientY-r.top)),w:r.width,h:r.height};}
  function showRect(a,b){const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);box.hidden=false;box.style.left=x+'px';box.style.top=y+'px';box.style.width=w+'px';box.style.height=h+'px';return{x,y,w,h,displayW:a.w,displayH:a.h};}
  wrap.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();const p=point(e);drag={start:p,last:p};wrap.setPointerCapture?.(e.pointerId);showRect(p,p);});
  wrap.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();drag.last=point(e);selection=showRect(drag.start,drag.last);});
  wrap.addEventListener('pointerup',async e=>{if(!drag)return;e.preventDefault();drag.last=point(e);selection=showRect(drag.start,drag.last);drag=null;if(selection.w<8||selection.h<8){box.hidden=true;selection=null;return;}await recognizeSelection();});
  wrap.addEventListener('pointercancel',()=>{drag=null;});

  async function recognizeSelection(){
    if(!selection||!preview.naturalWidth||!window.Tesseract)return;
    const sx=preview.naturalWidth/selection.displayW,sy=preview.naturalHeight/selection.displayH;
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(selection.w*sx));c.height=Math.max(1,Math.round(selection.h*sy));
    c.getContext('2d').drawImage(preview,Math.round(selection.x*sx),Math.round(selection.y*sy),c.width,c.height,0,0,c.width,c.height);
    if(status)status.textContent='Reading selected text...';
    try{
      const r=await Tesseract.recognize(c,'eng',{logger:m=>{if(m.progress&&status)status.textContent=`${m.status} • ${Math.round(m.progress*100)}%`;}});
      const value=(r.data.text||'').trim();text.value=value;
      if(!value){if(status)status.textContent='No clear text found in the selected area.';return;}
      let copied=false;try{await navigator.clipboard.writeText(value);copied=true;}catch{}
      if(status)status.textContent=copied?'Selected text extracted and copied.':'Selected text extracted • press Copy Text to copy it.';
    }catch(err){console.error(err);if(status)status.textContent='Selected-area OCR failed. Try a clearer/larger selection.';}
  }

  // Keep whole-image Extract Text working and ensure preview exists even if another handler replaced state.
  $('ocrBtn')?.addEventListener('click',()=>{if(input.files?.[0]&&preview.src==='')setPreview(input.files[0]);},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,180));else setTimeout(init,180);
})();
