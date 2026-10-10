/* Smart Card v19: rebuilt isolated fit-to-view canvas controller. Other tools untouched. */
(()=>{'use strict';
  const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const init=()=>{
    const section=$('cards'),stage=$('cardPerspectiveStage'),canvas=$('cardSourceCanvas'),zoom=$('cardZoom'),preset=$('cardAspect');
    if(!section||!stage||!canvas||!zoom||!preset)return;
    // Preserve the existing controls and colour scheme. Free is an additional size choice.
    if(!preset.querySelector('[value="free"]'))preset.insertAdjacentHTML('afterbegin','<option value="free">Free — adjustable crop</option>');
    if(!preset.querySelector('[value="aadhaar-wide"]'))preset.insertAdjacentHTML('beforeend','<option value="aadhaar-wide">Aadhaar Wide 6.74 × 2.125 in</option>');
    preset.value='free';
    const size=()=>preset.value==='aadhaar-wide'?[6.74*25.4,2.125*25.4]:preset.value==='free'?null:[85.6,54];
    const ratio=()=>{const s=size();return s?s[0]/s[1]:null};
    const status=txt=>{if($('cardStatus'))$('cardStatus').textContent=txt};
    const modeButtons=()=>{$('cardSimpleCropBtn')?.classList.toggle('active',mode==='rect');$('manualCardPerspectiveBtn')?.classList.toggle('active',mode==='quad')};
    const clone=src=>{const c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);return c};
    let sourceOriginal=null,mode='none',rect=null,quad=null,loadedLabel='',loadTicket=0,drag=null,applied=false;
    const undoStack=[],redoStack=[];const maxHistory=12;let restoringHistory=false;
    function snapshot(){return {image:clone(canvas),mode,rect:rect?{...rect}:null,quad:quad?quad.map(p=>({...p})):null}}
    function remember(){if(restoringHistory||!canvas.width)return;undoStack.push(snapshot());if(undoStack.length>maxHistory)undoStack.shift();redoStack.length=0;refreshHistory()}
    function restoreSnapshot(s){restoringHistory=true;canvas.width=s.image.width;canvas.height=s.image.height;canvas.getContext('2d').drawImage(s.image,0,0);rect=s.rect;quad=s.quad;mode=s.mode;updateOverlay();screen();restoringHistory=false;refreshHistory()}
    function undo(){if(!undoStack.length)return;redoStack.push(snapshot());restoreSnapshot(undoStack.pop());status('Undo complete.')}
    function redo(){if(!redoStack.length)return;undoStack.push(snapshot());restoreSnapshot(redoStack.pop());status('Redo complete.')}
    let undoButton,redoButton;function refreshHistory(){if(undoButton)undoButton.disabled=!undoStack.length;if(redoButton)redoButton.disabled=!redoStack.length}
    const host=$('cardV111CropHost')||document.createElement('div');host.id='cardV111CropHost';host.className='v111-card-crop-host sc13-host';stage.appendChild(host);
    // Keep canvas and selection in a single scrollable content box.
    const viewport=document.createElement('div');viewport.id='card19Viewport';viewport.className='card19-viewport';
    stage.insertBefore(viewport,canvas);viewport.appendChild(canvas);viewport.appendChild(host);
    // Replace the contents of the old host: old pointers are detached, so only one crop overlay can exist.
    host.innerHTML='<div id="sc13Rect" class="v111-crop-box sc13-rect">'+['nw','n','ne','e','se','s','sw','w'].map(h=>`<span class="v111-crop-handle ${h}" data-h="${h}"></span>`).join('')+'</div><div id="sc13Quad" class="sc13-quad"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon id="sc13Poly" points="5,5 95,5 95,95 5,95"></polygon></svg>'+Array.from({length:4},(_,i)=>`<span class="sc13-point" data-point="${i}"></span>`).join('')+'</div>';
    const rectBox=$('sc13Rect'),quadBox=$('sc13Quad'),poly=$('sc13Poly');
    const hideOld=()=>{
      for(const id of ['cardFreeCropLayer','cardPerspectiveLayer']){const n=$(id);if(n){n.style.display='none';n.style.pointerEvents='none';}}
      // Older auto-crop handlers must not display their own polygon above ours.
      if(typeof state!=='undefined'){state.cardFreeCrop=null;state.cardPerspectiveMode=false;state.cardPerspectivePts=null;}
    };
    const endOverlay=()=>{mode='none';rectBox.style.display='none';quadBox.style.display='none';host.style.display='none';modeButtons();hideOld()};
    function screen(){
      if(!canvas.width||!canvas.height)return;
      stage.style.display='block';stage.style.position='relative';stage.style.overflow='auto';
      stage.style.width='100%';stage.style.minWidth='0';stage.style.boxSizing='border-box';
      stage.style.height='68vh';stage.style.maxHeight='68vh';stage.style.minHeight='320px';
      const availableW=Math.max(100,stage.clientWidth-36);
      const availableH=Math.max(100,stage.clientHeight-36);
      // Fit the complete page at 100%; zoom changes its CSS size, not its pixel resolution.
      const fit=Math.min(availableW/canvas.width,availableH/canvas.height);
      const factor=(Number(zoom.value)||100)/100;
      const w=Math.max(1,Math.round(canvas.width*fit*factor));
      const h=Math.max(1,Math.round(canvas.height*fit*factor));
      viewport.style.width=w+'px';viewport.style.height=h+'px';
      viewport.style.marginLeft=w<availableW?'auto':'0px';
      viewport.style.marginRight=w<availableW?'auto':'0px';
      viewport.style.marginTop=h<availableH?Math.max(0,(availableH-h)/2)+'px':'0px';
      viewport.style.marginBottom='0px';
      canvas.style.setProperty('width','100%','important');
      canvas.style.setProperty('height','100%','important');
      canvas.style.setProperty('max-width','none','important');
      canvas.style.setProperty('max-height','none','important');
      canvas.style.setProperty('transform','none','important');
      canvas.style.margin='0';canvas.style.display='block';
      Object.assign(host.style,{left:'0',top:'0',right:'auto',bottom:'auto',margin:'0',padding:'0',boxSizing:'border-box',width:'100%',height:'100%'});
      updateOverlay();
    }
    function updateOverlay(){
      host.style.display=mode==='none'?'none':'block';rectBox.style.display=mode==='rect'?'block':'none';quadBox.style.display=mode==='quad'?'block':'none';
      if(mode==='rect'&&rect){Object.assign(rectBox.style,{left:rect.x*100+'%',top:rect.y*100+'%',width:rect.w*100+'%',height:rect.h*100+'%'});}
      if(mode==='quad'&&quad){poly.setAttribute('points',quad.map(p=>p.x*100+','+p.y*100).join(' '));quadBox.querySelectorAll('.sc13-point').forEach((el,i)=>{el.style.left=quad[i].x*100+'%';el.style.top=quad[i].y*100+'%';});}
      modeButtons();
    }
    function centered(candidate){
      const aspect=ratio();let r=candidate||{x:.06,y:.08,w:.88,h:.84};r={...r};
      r.x=clamp(r.x,0,.99);r.y=clamp(r.y,0,.99);r.w=clamp(r.w,.02,1-r.x);r.h=clamp(r.h,.02,1-r.y);
      if(aspect){const imageAR=canvas.width/canvas.height,normalized=aspect/imageAR;let w=Math.min(r.w,r.h*normalized),h=w/normalized;if(h>r.h){h=r.h;w=h*normalized}r.x+=(r.w-w)/2;r.y+=(r.h-h)/2;r.w=w;r.h=h;}
      return r;
    }
    const baseRect=()=>centered({x:.08,y:.08,w:.84,h:.84});
    function activateRect(r){hideOld();mode='rect';rect=centered(r||rect||baseRect());quad=null;updateOverlay();}
    function activatePerspective(points){hideOld();mode='quad';quad=points||[{x:.06,y:.08},{x:.94,y:.08},{x:.94,y:.92},{x:.06,y:.92}];rect=null;updateOverlay();}
    function rectFromPixels(points){const xs=points.map(p=>p.x/canvas.width),ys=points.map(p=>p.y/canvas.height);return {x:clamp(Math.min(...xs),0,1),y:clamp(Math.min(...ys),0,1),w:clamp(Math.max(...xs)-Math.min(...xs),.02,1),h:clamp(Math.max(...ys)-Math.min(...ys),.02,1)}}
    function orderFour(points){const p=points.map(o=>({...o}));if(p.length!==4)return null;const sums=p.map(x=>x.x+x.y),diff=p.map(x=>x.x-x.y);return [p[sums.indexOf(Math.min(...sums))],p[diff.indexOf(Math.max(...diff))],p[sums.indexOf(Math.max(...sums))],p[diff.indexOf(Math.min(...diff))]]}
    // Automatically detect the card edges after upload/page change; fall back to a manually adjustable ratio-sized rectangle.
    async function detect(){
      if(!canvas.width||!canvas.height)return;const ticket=++loadTicket;let points=null;
      try{
        if(typeof cv!=='undefined'&&cv.Mat&&typeof detectCardQuadrilaterals==='function'){
          const found=await detectCardQuadrilaterals(canvas,6);const target=ratio();
          if(found?.length){const rank=[...found].sort((a,b)=>{
            const value=q=>{const xs=q.points.map(p=>p.x),ys=q.points.map(p=>p.y);const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys),actual=w/Math.max(1,h),err=target?Math.abs(Math.log(actual/target)):0,area=w*h/(canvas.width*canvas.height);return (q.score||0)+Math.min(area,1)*2-err*2};
            return value(b)-value(a);
          });points=rank[0].points;}
        }
        if(!points&&typeof bestDocumentPoints==='function'&&typeof cv!=='undefined'&&cv.Mat)points=await bestDocumentPoints(canvas,false);
      }catch(e){console.warn('Smart Card edge detection unavailable; using adjustable crop',e)}
      if(ticket!==loadTicket)return;
      const conf=points?.length===4?Math.max(0,Math.min(100,Math.round((1-Math.abs(Math.log(Math.max(.01,(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)))/Math.max(1,(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))))/(ratio()||canvas.width/canvas.height)))))*100))):0;
      if(confidenceLabel)confidenceLabel.textContent=points?.length===4?'Edge confidence: '+conf+'% • manually verify corners':'Edge confidence: unavailable • manual crop';
      if(points?.length===4){activateRect(rectFromPixels(points));status('Document detected. Adjust the single crop rectangle, then click Apply Crop.');}
      else{activateRect(baseRect());status('Adjust the single crop rectangle and click Apply Crop. Automatic edges were not available.');}
    }
    function updatePreset(){if(!canvas.width)return;const s=size();if(typeof state!=='undefined')state.cardOutputSizeMm=s;
      if(mode!=='quad'){activateRect(baseRect())}else{updateOverlay()}
      status(s?`Crop ratio: ${s[0].toFixed(2)} × ${s[1].toFixed(2)} mm. Drag to reposition or resize.`:'Free crop: drag any edge or corner to choose the output size.');
    }
    // Rect is a single normalized selection; all pointer input uses the untransformed canvas display bounds.
    function downRect(e){if(mode!=='rect')return;remember();e.preventDefault();e.stopPropagation();const handle=e.target.dataset.h||'move';drag={kind:'rect',handle,x:e.clientX,y:e.clientY,start:{...rect}};rectBox.setPointerCapture(e.pointerId)}
    function moveRect(e){if(!drag||drag.kind!=='rect')return;const start=drag.start,dx=(e.clientX-drag.x)/Math.max(1,host.clientWidth),dy=(e.clientY-drag.y)/Math.max(1,host.clientHeight);let x=start.x,y=start.y,w=start.w,h=start.h;const handle=drag.handle,as=ratio(),n=as?as*canvas.height/canvas.width:null;
      if(handle==='move'){x=clamp(x+dx,0,1-w);y=clamp(y+dy,0,1-h)}
      else if(n){
        // Anchor the opposite edge/corner. Never allow a resize to exceed canvas bounds.
        const anchorX=handle.includes('w')?start.x+start.w:handle.includes('e')?start.x:start.x+start.w/2;
        const anchorY=handle.includes('n')?start.y+start.h:handle.includes('s')?start.y:start.y+start.h/2;
        let desiredW=start.w;
        if(handle.includes('e'))desiredW=start.w+dx;
        if(handle.includes('w'))desiredW=start.w-dx;
        if(handle==='n')desiredW=(start.h-dy)*n;
        if(handle==='s')desiredW=(start.h+dy)*n;
        if(handle.length===2&&Math.abs(dy*n)>Math.abs(dx))desiredW=start.w+(handle.includes('n')?-dy:dy)*n;
        const maxX=handle.includes('w')?anchorX:handle.includes('e')?1-anchorX:2*Math.min(anchorX,1-anchorX);
        const maxY=handle.includes('n')?anchorY:handle.includes('s')?1-anchorY:2*Math.min(anchorY,1-anchorY);
        w=clamp(desiredW,Math.min(.02,maxX,maxY*n),Math.max(.02,Math.min(maxX,maxY*n)));
        h=w/n;
        x=handle.includes('w')?anchorX-w:handle.includes('e')?anchorX:anchorX-w/2;
        y=handle.includes('n')?anchorY-h:handle.includes('s')?anchorY:anchorY-h/2;
        x=clamp(x,0,1-w);y=clamp(y,0,1-h);
      }else{
        if(handle.includes('w')){const right=x+w;x=clamp(x+dx,0,right-.02);w=right-x}
        if(handle.includes('e'))w=clamp(w+dx,.02,1-x);
        if(handle.includes('n')){const bottom=y+h;y=clamp(y+dy,0,bottom-.02);h=bottom-y}
        if(handle.includes('s'))h=clamp(h+dy,.02,1-y);
      }
      rect={x,y,w,h};updateOverlay();
    }
    rectBox.addEventListener('pointerdown',downRect);rectBox.addEventListener('pointermove',moveRect);rectBox.addEventListener('pointerup',()=>drag=null);rectBox.addEventListener('pointercancel',()=>drag=null);
    function downQuad(e){if(mode!=='quad')return;remember();e.preventDefault();e.stopPropagation();drag={kind:'quad',i:e.target.classList.contains('sc13-point')?Number(e.target.dataset.point):-1,x:e.clientX,y:e.clientY,start:quad.map(p=>({...p}))};quadBox.setPointerCapture(e.pointerId)}
    function moveQuad(e){if(drag?.kind!=='quad')return;const dx=(e.clientX-drag.x)/Math.max(1,host.clientWidth),dy=(e.clientY-drag.y)/Math.max(1,host.clientHeight);const p=drag.start.map(x=>({...x}));if(drag.i>=0){p[drag.i]={x:clamp(p[drag.i].x+dx,0,1),y:clamp(p[drag.i].y+dy,0,1)}}else{const minX=Math.min(...p.map(x=>x.x)),maxX=Math.max(...p.map(x=>x.x)),minY=Math.min(...p.map(x=>x.y)),maxY=Math.max(...p.map(x=>x.y));const x=clamp(dx,-minX,1-maxX),y=clamp(dy,-minY,1-maxY);p.forEach(q=>{q.x+=x;q.y+=y})}quad=p;updateOverlay();}
    quadBox.addEventListener('pointerdown',downQuad);quadBox.addEventListener('pointermove',moveQuad);
    async function cropped(){
      if(mode==='rect'&&rect){const r=rect,out=document.createElement('canvas');out.width=Math.max(1,Math.round(canvas.width*r.w));out.height=Math.max(1,Math.round(canvas.height*r.h));out.getContext('2d').drawImage(canvas,r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height,0,0,out.width,out.height);return out;}
      if(mode==='quad'&&quad){
        if(typeof cv==='undefined'||!cv.Mat)throw new Error('Perspective correction needs OpenCV to finish loading.');
        const ordered=orderFour(quad.map(p=>({x:p.x*canvas.width,y:p.y*canvas.height})));if(!ordered)throw new Error('Invalid perspective corners');
        const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),w=Math.min(10000,Math.max(1,Math.round(Math.max(dist(ordered[0],ordered[1]),dist(ordered[3],ordered[2]))))),h=Math.min(10000,Math.max(1,Math.round(Math.max(dist(ordered[0],ordered[3]),dist(ordered[1],ordered[2])))));
        let src,srcPts,dstPts,M,dst;try{src=cv.imread(canvas);srcPts=cv.matFromArray(4,1,cv.CV_32FC2,ordered.flatMap(p=>[p.x,p.y]));dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]);M=cv.getPerspectiveTransform(srcPts,dstPts);dst=new cv.Mat();cv.warpPerspective(src,dst,M,new cv.Size(w,h),cv.INTER_LINEAR,cv.BORDER_REPLICATE,new cv.Scalar());const out=document.createElement('canvas');out.width=w;out.height=h;cv.imshow(out,dst);return out;}finally{[src,srcPts,dstPts,M,dst].forEach(m=>m?.delete())}
      }
      return null;
    }
    async function applyOnly(){
      if(!canvas.width||!canvas.height){status('Upload an image or PDF page first.');return;}
      if(mode==='none'){activateRect(baseRect());status('Crop area ready — adjust it and click Apply Crop.');return;}
      try{remember();const out=await cropped();if(!out)return; if(!sourceOriginal)sourceOriginal=clone(canvas);canvas.width=out.width;canvas.height=out.height;canvas.getContext('2d').drawImage(out,0,0);applied=true;endOverlay();zoom.value='100';$('cardZoomValue').textContent='100%';screen();stage.scrollLeft=0;stage.scrollTop=0;status('Crop applied to the main canvas. Save Front / Back or drag the cropped canvas to a card preview.');}
      catch(e){console.error(e);status(e.message||'Unable to apply crop. Original image has been retained.')}
    }
    function save(side){
      if(!canvas.width||!canvas.height){status('Upload a document first.');return;}
      const s=size(),dpi=Number($('cardExportDpi')?.value)||300;
      const w=s?Math.max(1,Math.round(s[0]/25.4*dpi)):canvas.width,h=s?Math.max(1,Math.round(s[1]/25.4*dpi)):canvas.height;
      const out=document.createElement('canvas');out.width=w;out.height=h;const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      // Contain protects text at all times, including when a detected boundary is imperfect.
      const scale=Math.min(w/canvas.width,h/canvas.height);ctx.drawImage(canvas,(w-canvas.width*scale)/2,(h-canvas.height*scale)/2,canvas.width*scale,canvas.height*scale);
      state[side==='front'?'cardFrontCrop':'cardBackCrop']=out;
      state.cardSavedDimensions=state.cardSavedDimensions||{};state.cardSavedDimensions[side]=s||[canvas.width/dpi*25.4,canvas.height/dpi*25.4];
      const preview=$(side==='front'?'cardFrontPreview':'cardBackPreview');if(preview){const ratio=Math.min(380/w,190/h,1);preview.width=Math.max(1,Math.round(w*ratio));preview.height=Math.max(1,Math.round(h*ratio));preview.getContext('2d').drawImage(out,0,0,preview.width,preview.height)}
      status(side.toUpperCase()+' saved at '+w+'×'+h+' px. The other side is unchanged.');
    }
    function replaceClick(id,fn){const old=$(id);if(!old)return;const next=old.cloneNode(true);old.replaceWith(next);next.addEventListener('click',fn);return next}
    replaceClick('cardSimpleCropBtn',()=>{if(!canvas.width)return status('Upload a document first.');activateRect(baseRect());status('Single crop selection: drag edges/corners or move the rectangle.');});
    replaceClick('manualCardPerspectiveBtn',()=>{if(!canvas.width)return status('Upload a document first.');activatePerspective();status('Perspective crop enabled. Drag the four corner points, then Apply Crop.');});
    replaceClick('applyCardCrop',applyOnly);
    replaceClick('saveCardCrop',()=>save($('cardCropAction')?.value==='back'?'back':'front'));
    replaceClick('restoreCardSourceBtn',()=>{if(sourceOriginal)remember();if(!sourceOriginal)return status('No previous original to restore.');canvas.width=sourceOriginal.width;canvas.height=sourceOriginal.height;canvas.getContext('2d').drawImage(sourceOriginal,0,0);applied=false;zoom.value='100';$('cardZoomValue').textContent='100%';activateRect(baseRect());screen();status('Original restored. Adjust the single crop selection.');});
    replaceClick('exportCardCropImage',()=>{const side=$('cardCropAction')?.value==='back'?'back':'front',c=state[side==='front'?'cardFrontCrop':'cardBackCrop'];if(!c)return status('Save '+side+' first.');const type=$('cardOutputFormat')?.value||'image/png';if(typeof downloadCanvas==='function')downloadCanvas(c,'smart-card-'+side,type,1);});
    const viewControl=zoom.closest('label');
    if(viewControl){
      const fitBtn=document.createElement('button');fitBtn.type='button';fitBtn.className='mini-btn';
      fitBtn.id='card19FitPage';fitBtn.textContent='Fit Page';fitBtn.title='Show the entire uploaded page';
      viewControl.after(fitBtn);
      fitBtn.addEventListener('click',()=>{zoom.value='100';$('cardZoomValue').textContent='100%';screen();stage.scrollLeft=0;stage.scrollTop=0;});
    }
    // Undo and redo remain available exclusively with Ctrl/Cmd+Z and Ctrl/Cmd+Y.
    // Automatic edge detection remains on upload, but has no manual 1-click button.
    const confidenceLabel=document.createElement('div');confidenceLabel.className='sc14-confidence';confidenceLabel.textContent='Edge confidence: waiting for document';(preset.closest('.control-group')||section).appendChild(confidenceLabel);
    const calibration=document.createElement('label');calibration.className='sc14-calibration';calibration.innerHTML='Print calibration (%) <input id="sc14PrintScale" type="number" min="90" max="110" step="0.1" value="100" title="Measure a printed 100 mm ruler and adjust: 100 × 100 / measured millimeters">';
    const printGroup=$('cardPrintMargin')?.closest('.control-group');if(printGroup)printGroup.append(calibration);
    const calInput=$('sc14PrintScale');
    calInput?.addEventListener('change',()=>{let v=Number(calInput.value);if(!Number.isFinite(v))v=100;calInput.value=String(clamp(v,90,110));status('Calibration '+calInput.value+'%. Build Sheet again, then print at Actual Size / 100%.')});
    // Calibrate card dimensions during sheet building; never rescale the whole A4 page.
    $('buildCardSheet')?.addEventListener('click',()=>{const v=Number(calInput?.value)||100;if(v===100||!state.cardSheetLayout?.length)return;const factor=v/100;for(const item of state.cardSheetLayout){const cx=item.x+item.w/2,cy=item.y+item.h/2;item.w*=factor;item.h*=factor;item.x=cx-item.w/2;item.y=cy-item.h/2;}if(typeof buildFromLayout==='function')buildFromLayout($('cardCanvas'),state.cardSheetLayout,$('cardCanvas').width,$('cardCanvas').height);if(typeof renderLayoutEditor==='function')renderLayoutEditor($('cardSheetEditor'),$('cardCanvas'),state.cardSheetLayout,'CARD');status('Calibrated card layout '+v+'%. Print at actual size, without Fit to Page.');});

    // Old hidden buttons only manipulate old overlays, so leave them hidden and inactive.
    preset.addEventListener('change',e=>{e.stopImmediatePropagation();loadTicket++;updatePreset();if($('cardPageLabel')?.textContent!=='No file')detect();},true);
    zoom.addEventListener('input',e=>{e.stopImmediatePropagation();const oldW=stage.scrollWidth||1,oldH=stage.scrollHeight||1,px=(stage.scrollLeft+stage.clientWidth/2)/oldW,py=(stage.scrollTop+stage.clientHeight/2)/oldH;screen();stage.scrollLeft=Math.max(0,px*stage.scrollWidth-stage.clientWidth/2);stage.scrollTop=Math.max(0,py*stage.scrollHeight-stage.clientHeight/2);$('cardZoomValue').textContent=zoom.value+'%';},true);
    document.addEventListener('keydown',e=>{if(section.classList.contains('active')&&!e.target.closest('input,textarea,select,[contenteditable=true]')&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();e.shiftKey?redo():undo();return;}if(section.classList.contains('active')&&!e.target.closest('input,textarea,select,[contenteditable=true]')&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();e.stopImmediatePropagation();redo();return;}if(e.key!=='Enter'||!section.classList.contains('active')||e.target.closest('input,textarea,select,button'))return;e.preventDefault();e.stopImmediatePropagation();applyOnly();},true);
    // The loader updates the page label *after* the PDF/image pixels are rendered.
    const pageLabel=$('cardPageLabel');
    if(pageLabel){const observer=new MutationObserver(()=>{
      const label=pageLabel.textContent;if(!label||label==='No file'||label===loadedLabel)return;loadedLabel=label;loadTicket++;sourceOriginal=null;applied=false;undoStack.length=0;redoStack.length=0;refreshHistory();zoom.value='100';$('cardZoomValue').textContent='100%';endOverlay();requestAnimationFrame(()=>requestAnimationFrame(()=>{screen();stage.scrollLeft=0;stage.scrollTop=0;detect()}));
    });observer.observe(pageLabel,{childList:true,characterData:true,subtree:true});}
    for(const uploadId of ['cardPdfInput','cardImageInput']){
      $(uploadId)?.addEventListener('change',()=>{
        const ticket=++loadTicket;
        // A page can load asynchronously, especially when PDF.js renders a large page.
        const check=(attempt=0)=>{
          if(ticket!==loadTicket)return;
          if(canvas.width>1&&canvas.height>1){
            zoom.value='100';$('cardZoomValue').textContent='100%';
            screen();stage.scrollLeft=0;stage.scrollTop=0;
            detect();return;
          }
          if(attempt<40)setTimeout(()=>check(attempt+1),100);
        };
        setTimeout(()=>check(),200);
      });
    }
    // Canvas size is also changed by PDF rendering and the Apply Crop action.
    const observer=new MutationObserver(()=>requestAnimationFrame(screen));observer.observe(canvas,{attributes:true,attributeFilter:['width','height']});
    window.addEventListener('resize',()=>requestAnimationFrame(screen));
    if(typeof ResizeObserver!=='undefined'){new ResizeObserver(()=>requestAnimationFrame(screen)).observe(stage);}
    // Refresh the crop alignment if the viewport scrollbars/layout shift.
    // Scrolling does not change canvas geometry; rebuilding styles on every scroll causes jumps.
    // Canvas and crop host share the same viewport, so scrolling cannot desynchronise them.
    const src=canvas;src.draggable=true;src.addEventListener('dragstart',e=>{if(!canvas.width)return;e.dataTransfer.setData('text/x-shop-card','current-canvas');e.dataTransfer.setData('text/plain','smart-card-canvas');e.dataTransfer.effectAllowed='copy'},true);
    for(const [side,id] of [['front','cardFrontPreview'],['back','cardBackPreview']]){
      const el=$(id);if(!el)continue;const container=el.parentElement;container.addEventListener('drop',e=>{const hasCard=e.dataTransfer?.types?.includes('text/x-shop-card')||e.dataTransfer?.types?.includes('text/plain');if(!hasCard||e.dataTransfer.files.length)return;e.preventDefault();e.stopImmediatePropagation();save(side)},true);
      container.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('text/x-shop-card'))e.preventDefault()},true);
    }
    const notice=section.querySelector('.compact-notice');if(notice)notice.textContent='Free, PVC, Aadhaar / PAN or Aadhaar Wide crop size. Only one crop area appears. Export preserves aspect ratio.';
    if(typeof state!=='undefined')state.cardOutputSizeMm=null;
    endOverlay();screen();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,450));else setTimeout(init,450);
})();
