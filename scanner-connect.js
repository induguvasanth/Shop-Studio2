(()=>{
  const endpoint=window.location.hostname==='127.0.0.1'&&['17899','17898'].includes(window.location.port) ? window.location.origin : 'http://127.0.0.1:17899';
  const isLocalScannerMode=true; // Hosted page may connect to the installed loopback bridge directly.
  const localScannerUrl='http://127.0.0.1:17899/app/#scanner';
  function openLocalScannerMode(){
    // Direct user gesture: browsers may block a delayed popup.
    const w=window.open(localScannerUrl,'_blank','noopener');
    if(!w)window.location.href=localScannerUrl;
  }
  const $=id=>document.getElementById(id);
  const KEY='shopstudio_scan_device';
  const scanSection=$('scanner');
  const sidebar=scanSection?.querySelector('.tool-sidebar');
  if(!scanSection||!sidebar)return;

  const defaults={
    name:'',driver:'',savedScanDpi:'200',savedScanBit:'24',savedScanSource:'flatbed',
    remember:true,autoClean:true,scanCleanMode:'fastcolor',scanPreset:'fastcolor'
  };

  let prefs={...defaults};
  try{prefs={...prefs,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{}
  let selected={name:prefs.name||'',driver:prefs.driver||''};
  let isBound=false;

  function say(msg){
    const st=$('scanSavedDeviceLabel')||$('scanPresetStatus')||$('scanStatus');
    if(st)st.textContent=msg;
    const inline=$('scanStatus');
    if(inline && st!==inline) inline.textContent = msg;
  }

  function currentSettings(){
    return {
      name:selected.name,
      driver:selected.driver,
      savedScanDpi:$('savedScanDpi')?.value||'200',
      savedScanBit:$('savedScanBit')?.value||'24',
      savedScanSource:$('savedScanSource')?.value||'flatbed',
      remember:$('scanRememberDevice')?.checked!==false,
      autoClean:$('autoCleanScans')?.checked!==false,
      scanCleanMode:$('scanCleanMode')?.value||'fastcolor',
      scanPreset:$('scanPresetCurrent')?.value||'fastcolor'
    };
  }

  function save(){
    const p=currentSettings();
    try{
      if(p.remember) localStorage.setItem(KEY, JSON.stringify(p));
      else localStorage.removeItem(KEY);
    }catch(e){console.warn(e)}
    const label = p.name ? `Saved: ${p.name} • ${p.savedScanDpi} DPI • ${presetLabel(p.scanPreset)}` : `Settings saved • ${p.savedScanDpi} DPI • ${presetLabel(p.scanPreset)}`;
    if($('scanSavedDeviceLabel')) $('scanSavedDeviceLabel').textContent = label;
    if($('scanPresetStatus')) $('scanPresetStatus').textContent = `${presetLabel(p.scanPreset)} ready • ${cleanLabel(p.scanCleanMode)}`;
  }

  function presetLabel(v){
    return v==='printcolor' ? 'Print Quality' : 'Fast Color';
  }
  function cleanLabel(v){
    if(v==='printcolor') return 'Print clean';
    if(v==='none') return 'No auto clean';
    return 'Fast clean';
  }

  function ensureControlGroup(id,title){
    let group=$(id);
    if(group) return group;
    group=document.createElement('div');
    group.id=id; group.className='control-group';
    group.innerHTML=`<h4>${title}</h4>`;
    sidebar.appendChild(group);
    return group;
  }

  function ensureUI(){
    const deviceGroup = $('scannerDevicePrefs') || ensureControlGroup('scannerDevicePrefs','Device Defaults');
    document.getElementById('scannerLocalModeBanner')?.remove();
    if(!$('savedScanDpi')){
      deviceGroup.innerHTML = `
        <h4>Device Defaults</h4>
        <label>DPI<select id="savedScanDpi"><option value="150">150</option><option value="200">200</option><option value="300">300</option><option value="600">600</option></select></label>
        <label>Mode<select id="savedScanBit"><option value="24">Color</option><option value="8">Grayscale</option><option value="1">B&W</option></select></label>
        <label>Source<select id="savedScanSource"><option value="flatbed">Flatbed</option><option value="feeder">Feeder</option></select></label>
        <label><input id="scanRememberDevice" type="checkbox" checked> Remember scanner & settings</label>
        <div class="v11-inline-status" id="scanSavedDeviceLabel">No scanner selected • default 200 DPI</div>
      `;
    }

    const presetGroup=ensureControlGroup('scannerPresetGroup','Scan Mode');
    presetGroup.innerHTML = `
      <h4>Scan Mode</h4>
      <div class="v11-toolbar" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="mini-btn" id="scanPresetFastColor" type="button">Fast Color</button>
        <button class="mini-btn" id="scanPresetPrintColor" type="button">Print Quality</button>
      </div>
      <input type="hidden" id="scanPresetCurrent" value="${prefs.scanPreset||'fastcolor'}">
      <label>Auto Clean<select id="scanCleanMode">
        <option value="fastcolor">Fast Color Clean</option>
        <option value="printcolor">Print Quality Clean</option>
        <option value="none">No Auto Clean</option>
      </select></label>
      <label><input id="autoCleanScans" type="checkbox" checked> Clean scanned page automatically</label>
      <div class="v11-inline-status" id="scanPresetStatus">Fast Color ready • Fast clean</div>
    `;

    const actionGroup=ensureControlGroup('scannerActionGroup','Scanner');
    actionGroup.innerHTML = `
      <h4>Scanner</h4>
      <div class="v11-toolbar" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="mini-btn" id="chooseScannerBtn" type="button">Choose Scanner</button>
        <span class="v11-inline-status" id="scanDeviceSummary">Choose a connected scanner</span>
      </div>
      <div class="v11-toolbar" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="mini-btn" id="scanSaveSettings" type="button">Save Settings</button>
        <button class="mini-btn" id="scanResetSettings" type="button">Reset</button>
      </div>
      <div class="v11-settings-note" id="scanDirectNote" style="margin-top:8px">Scanned pages go directly into the canvas and page strip, one after another.</div>

    `;

    // Repurpose the old slow AI background button for fast document cleaning.
    const oldCleanBtn=$('scanWhiteBgBtn');
    if(oldCleanBtn) oldCleanBtn.textContent='Clean Doc';

    // restore prefs in UI
    if($('savedScanDpi')) {
      const el=$('savedScanDpi');
      if(![...el.options].some(o=>o.value==='200')) el.add(new Option('200','200'), Math.min(1,el.options.length));
      el.value = prefs.savedScanDpi || defaults.savedScanDpi;
    }
    if($('savedScanBit')) $('savedScanBit').value = prefs.savedScanBit || defaults.savedScanBit;
    if($('savedScanSource')) $('savedScanSource').value = prefs.savedScanSource || defaults.savedScanSource;
    if($('scanRememberDevice')) $('scanRememberDevice').checked = prefs.remember !== false;
    if($('autoCleanScans')) $('autoCleanScans').checked = prefs.autoClean !== false;
    if($('scanCleanMode')) $('scanCleanMode').value = prefs.scanCleanMode || defaults.scanCleanMode;
    if($('scanPresetCurrent')) $('scanPresetCurrent').value = prefs.scanPreset || defaults.scanPreset;

    syncPresetButtons();
    if($('scanDeviceSummary') && selected.name) $('scanDeviceSummary').textContent=selected.name+' ('+selected.driver.toUpperCase()+')';
    save();
  }

  function syncPresetButtons(){
    const current=$('scanPresetCurrent')?.value || 'fastcolor';
    $('scanPresetFastColor')?.classList.toggle('active', current==='fastcolor');
    $('scanPresetPrintColor')?.classList.toggle('active', current==='printcolor');
    if($('scanPresetStatus')) $('scanPresetStatus').textContent = `${presetLabel(current)} ready • ${cleanLabel($('scanCleanMode')?.value||'fastcolor')}`;
  }

  function applyPreset(kind){
    if(!$('savedScanDpi')) return;
    if(kind==='printcolor'){
      $('savedScanDpi').value='300';
      $('savedScanBit').value='24';
      $('savedScanSource').value='flatbed';
      if($('scanCleanMode')) $('scanCleanMode').value='printcolor';
      if($('autoCleanScans')) $('autoCleanScans').checked=true;
      if($('scanPresetCurrent')) $('scanPresetCurrent').value='printcolor';
      say('Print Quality preset applied • 300 DPI color • print clean');
    }else{
      $('savedScanDpi').value='200';
      $('savedScanBit').value='24';
      $('savedScanSource').value='flatbed';
      if($('scanCleanMode')) $('scanCleanMode').value='fastcolor';
      if($('autoCleanScans')) $('autoCleanScans').checked=true;
      if($('scanPresetCurrent')) $('scanPresetCurrent').value='fastcolor';
      say('Fast Color preset applied • 200 DPI color • fast clean');
    }
    syncPresetButtons();
    save();
  }

  // TWAIN initialization and flatbed scans can legitimately take several minutes.
  // Distinguish a timed out scan from a bridge connection failure.
  const SCANNER_DISCOVERY_TIMEOUT=45000;
  const SCAN_ACQUIRE_TIMEOUT=600000;
  async function get(url,timeout=SCANNER_DISCOVERY_TIMEOUT){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const r=await fetch(url,{mode:'cors',signal:controller.signal,cache:'no-store',headers:{Accept:'*/*'}});
      if(!r.ok){
        let detail='';
        try{const data=await r.json();detail=data.error||data.message||''}catch{}
        throw new Error(detail||`Scanner bridge returned HTTP ${r.status}`);
      }
      return r;
    }catch(err){
      if(controller.signal.aborted)throw new Error(url.includes('/scan?')
        ? 'Scan timed out after 10 minutes. Close any open VueScan/ScanGear dialog, check whether NAPS2 is waiting for scanner input, then restart the bridge.'
        : 'Scanner discovery timed out after 45 seconds. NAPS2 may be busy. Close other scanner programs and restart the bridge.');
      throw err;
    }finally{clearTimeout(timer)}
  }
  async function scanners(){const response=await get(endpoint+'/scanners',SCANNER_DISCOVERY_TIMEOUT);const data=await response.json();return data.scanners||[]}
  function vuescanDevice(list){return list.find(x=>x.driver==='twain' && /vuescan/i.test(x.name))}
  function preferredDevice(list){
    return list.find(x=>x.name===selected.name&&x.driver===selected.driver) || list.find(x=>/canon.*g3010|brother.*(l2541|l2520)/i.test(x.name)) || list[0];
  }
  async function chooseScanner(list){
    const currentIndex=Math.max(0, list.findIndex(x=>x.name===selected.name&&x.driver===selected.driver));
    const lines=list.map((x,i)=>`${i+1}. ${x.name} (${String(x.driver).toUpperCase()})`);
    const choice=prompt('Choose scanner:\n'+lines.join('\n'), String(currentIndex+1||1));
    if(choice===null)return null;
    const n=Math.max(0,Math.min(list.length-1,(parseInt(choice,10)||1)-1));
    selected={name:list[n].name,driver:list[n].driver}; save(); if($('scanDeviceSummary')) $('scanDeviceSummary').textContent=selected.name+' ('+selected.driver.toUpperCase()+')';
    return list[n];
  }
  async function chooseVueScan(){
    const list=await scanners();
    const vue=vuescanDevice(list);
    if(!vue) throw new Error('VueScan TWAIN was not detected by the bridge.');
    selected={name:vue.name,driver:vue.driver}; save();
    return vue;
  }

  function canvasToImg(canvas){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=reject;
      img.src=canvas.toDataURL('image/png');
    });
  }

  function cleanDocumentColor(canvas, mode='fastcolor'){
    const ctx=canvas.getContext('2d', { willReadFrequently:true });
    const w=canvas.width,h=canvas.height;
    const im=ctx.getImageData(0,0,w,h);
    const d=im.data;
    const borderStep=Math.max(8, Math.floor(Math.max(w,h)/200));
    let samples=[];
    // sample borders to estimate page white
    for(let x=0;x<w;x+=borderStep){
      let i1=(0*w + x)*4, i2=((h-1)*w + x)*4;
      samples.push((d[i1]+d[i1+1]+d[i1+2])/3, (d[i2]+d[i2+1]+d[i2+2])/3);
    }
    for(let y=0;y<h;y+=borderStep){
      let i1=(y*w + 0)*4, i2=(y*w + (w-1))*4;
      samples.push((d[i1]+d[i1+1]+d[i1+2])/3, (d[i2]+d[i2+1]+d[i2+2])/3);
    }
    samples=samples.filter(v=>Number.isFinite(v)).sort((a,b)=>a-b);
    const p75=samples[Math.floor(samples.length*0.75)] || 220;
    const targetWhite=248;
    const threshold = mode==='printcolor' ? Math.max(150, p75-35) : Math.max(170, p75-20);
    const baseStrength = mode==='printcolor' ? 0.92 : 0.72;
    const contrast = mode==='printcolor' ? 1.06 : 1.02;

    for(let i=0;i<d.length;i+=4){
      let r=d[i], g=d[i+1], b=d[i+2];
      const max=Math.max(r,g,b), min=Math.min(r,g,b);
      const l=(r*0.299 + g*0.587 + b*0.114);
      const sat=max-min;
      // mild contrast for print readability
      r=Math.max(0, Math.min(255, (r-128)*contrast+128));
      g=Math.max(0, Math.min(255, (g-128)*contrast+128));
      b=Math.max(0, Math.min(255, (b-128)*contrast+128));
      if(l>=threshold){
        const t=Math.min(1, Math.max(0, (l-threshold)/(255-threshold||1)));
        const protect = sat>55 ? 0.45 : sat>30 ? 0.65 : 1.0; // keep strong colors / stamps
        const f = Math.min(1, baseStrength*(0.45 + 0.55*t))*protect;
        r = r + (targetWhite-r)*f;
        g = g + (targetWhite-g)*f;
        b = b + (targetWhite-b)*f;
      }
      d[i]=Math.max(0,Math.min(255,Math.round(r)));
      d[i+1]=Math.max(0,Math.min(255,Math.round(g)));
      d[i+2]=Math.max(0,Math.min(255,Math.round(b)));
    }
    ctx.putImageData(im,0,0);
    return canvas;
  }

  async function processScannedBlob(blob){
    const url=URL.createObjectURL(blob);
    try{
      const img = await new Promise((resolve,reject)=>{const i=new Image(); i.onload=()=>resolve(i); i.onerror=()=>reject(new Error('Scanner returned an unreadable image')); i.src=url;});
      const cleanMode = $('scanCleanMode')?.value || 'fastcolor';
      const autoClean = $('autoCleanScans')?.checked !== false;
      if(!autoClean || cleanMode==='none') return img;
      const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
      const x=c.getContext('2d'); x.imageSmoothingEnabled=true; x.imageSmoothingQuality='high'; x.drawImage(img,0,0);
      cleanDocumentColor(c, cleanMode);
      return await canvasToImg(c);
    } finally { URL.revokeObjectURL(url); }
  }

  function appendPage(img, label){
    if(typeof state === "undefined") throw new Error('Scanner state not ready yet. Refresh the page and try again.');
    if(!Array.isArray(state.scanPages)) state.scanPages=[];
    const next=state.scanPages.length+1;
    state.scanPages.push({img, name:label || `Scan ${next}`, thumb:img.src});
    state.scanCurrentIndex=state.scanPages.length-1;
    state.scanImg=img;
    state.scanCropMode=false;
    state.scanCropPts=null;
    try{ drawScan(); renderScanThumbs(); }catch(err){ console.warn(err); }
    if($('scanEmpty')) $('scanEmpty').style.display='none';
    if(typeof addHistory==='function') addHistory('Scanner','Scanned page',`Page ${next} • ${label||'scanner'}`);
  }

  async function scanFrom(device, list){
    const options=currentSettings();
    const url=endpoint+'/scan?'+new URLSearchParams({
      device:device.name, driver:device.driver,
      dpi:options.savedScanDpi,
      bitdepth:({'24':'color','8':'gray','1':'bw'}[options.savedScanBit]||options.savedScanBit),
      source:({'flatbed':'glass','feeder':'feeder'}[options.savedScanSource]||options.savedScanSource)
    });
    let blob;
    try{
      blob=await (await get(url,SCAN_ACQUIRE_TIMEOUT)).blob();
    }catch(scanError){
      const vue=vuescanDevice(list);
      if(vue && (device.name!==vue.name || device.driver!==vue.driver) && confirm('Selected scanner failed. Retry with VueScan TWAIN and add the page directly to the canvas?')){
        const retryUrl=endpoint+'/scan?'+new URLSearchParams({device:vue.name,driver:'twain',dpi:options.savedScanDpi,bitdepth:({'24':'color','8':'gray','1':'bw'}[options.savedScanBit]||options.savedScanBit),source:({'flatbed':'glass','feeder':'feeder'}[options.savedScanSource]||options.savedScanSource)});
        blob=await (await get(retryUrl,SCAN_ACQUIRE_TIMEOUT)).blob();
        device=vue; selected={name:vue.name,driver:vue.driver}; save();
      }else{
        throw new Error(scanError.message);
      }
    }
    if(!blob.type.startsWith('image/')) throw new Error('Scanner returned an unsupported image format.');
    say(($('scanCleanMode')?.value||'none')==='none' ? 'Loading scanned page…' : 'Cleaning scanned page…');
    const img=await processScannedBlob(blob);
    appendPage(img, `Scan ${Array.isArray(state.scanPages)?state.scanPages.length+1:1} — ${device.name}`);
    say(`${device.name} • ${options.savedScanDpi} DPI • ${state.scanPages.length} page(s) scanned`);
  }

  function bindButtons(){
    if(isBound) return;
    isBound=true;

    $('scanPresetFastColor')?.addEventListener('click', ()=>applyPreset('fastcolor'));
    $('scanPresetPrintColor')?.addEventListener('click', ()=>applyPreset('printcolor'));
    $('scanCleanMode')?.addEventListener('change', ()=>{ syncPresetButtons(); save(); });
    $('autoCleanScans')?.addEventListener('change', save);
    $('savedScanDpi')?.addEventListener('change', save);
    $('savedScanBit')?.addEventListener('change', save);
    $('savedScanSource')?.addEventListener('change', save);
    $('scanRememberDevice')?.addEventListener('change', save);
    $('scanSaveSettings')?.addEventListener('click', save);
    $('scanResetSettings')?.addEventListener('click', ()=>{
      selected={name:'',driver:''};
      try{ localStorage.removeItem(KEY); }catch{}
      prefs={...defaults};
      if($('savedScanDpi')) $('savedScanDpi').value='200';
      if($('savedScanBit')) $('savedScanBit').value='24';
      if($('savedScanSource')) $('savedScanSource').value='flatbed';
      if($('scanRememberDevice')) $('scanRememberDevice').checked=true;
      if($('autoCleanScans')) $('autoCleanScans').checked=true;
      if($('scanCleanMode')) $('scanCleanMode').value='fastcolor';
      if($('scanPresetCurrent')) $('scanPresetCurrent').value='fastcolor';
      syncPresetButtons();
      save(); say('Scanner settings reset • Fast Color is ready');
    });
    $('chooseScannerBtn')?.addEventListener('click', async()=>{
      try{ const list=await scanners(); if(!list.length) throw new Error('No scanner was found.'); await chooseScanner(list); }
      catch(err){ alert(err.message); }
    });
    $('useVueScanBtn')?.addEventListener('click', async()=>{
      try{ await chooseVueScan(); alert('VueScan TWAIN selected. Future scans will go directly to the canvas.'); }
      catch(err){ alert(err.message); }
    });

    // Override slow AI doc cleaning button with fast color-safe cleaner.
    const cleanBtn=$('scanWhiteBgBtn');
    if(cleanBtn){
      const b=cleanBtn.cloneNode(true); cleanBtn.replaceWith(b); b.textContent='Clean Doc';
      b.addEventListener('click', async()=>{
        if(typeof state === "undefined" || !state.scanImg) return alert('Upload or scan a document first.');
        const old=b.textContent; b.disabled=true; b.textContent='Cleaning…';
        try{
          const c=document.createElement('canvas'); c.width=state.scanImg.width; c.height=state.scanImg.height;
          c.getContext('2d').drawImage(state.scanImg,0,0);
          cleanDocumentColor(c, $('scanCleanMode')?.value || 'fastcolor');
          const img=await canvasToImg(c);
          state.scanImg=img;
          if(state.scanPages[state.scanCurrentIndex]) { state.scanPages[state.scanCurrentIndex].img=img; state.scanPages[state.scanCurrentIndex].thumb=img.src; }
          state.scanCropMode=false; state.scanCropPts=null;
          drawScan(); renderScanThumbs();
          say('Current page cleaned for printing.');
        }catch(err){ console.error(err); alert('Clean failed. Original page was preserved.'); }
        finally{ b.disabled=false; b.textContent=old; }
      });
    }

    // Replace scan button to remove older conflicting listeners.
    const oldScan=$('scannerBridgeBtn');
    if(oldScan){
      const btn=oldScan.cloneNode(true); oldScan.replaceWith(btn);
      btn.addEventListener('click', async(e)=>{
        e.preventDefault(); e.stopImmediatePropagation(); if(btn.disabled) return;
          const old=btn.textContent; btn.disabled=true; btn.textContent='Connecting…';
        try{
          let list;
          try{ list = await scanners(); }
          catch(err){ throw new Error('Cannot reach the Windows scanner bridge at 127.0.0.1:17899. Run START-BRIDGE.cmd or INSTALL-BRIDGE.cmd and check /health. Browser private-network restrictions may require using the local app. Details: '+err.message); }
          if(!list.length) throw new Error('Bridge connected but no scanner was found through WIA or TWAIN.');
          let device = preferredDevice(list);
          if(!selected.name && device){ selected={name:device.name,driver:device.driver}; save(); }
          btn.textContent='Scanning…';
          say(`Scanning page ${(typeof state !== "undefined" ? (state.scanPages?.length||0) : 0)+1} from ${device.name}…`);
          await scanFrom(device, list);
        }catch(err){ console.error('Scanner:',err); say('Scanner error: '+err.message); alert(err.message); }
        finally{ btn.disabled=false; btn.textContent=old; }
      }, true);
    }
  }

  function init(){
    ensureUI();
    bindButtons();
    // Default new installs to Fast Color preset.
    if(!prefs.name && prefs.savedScanDpi===undefined) applyPreset('fastcolor');
    else syncPresetButtons();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=>setTimeout(init, 300));
  else setTimeout(init, 300);
})();
