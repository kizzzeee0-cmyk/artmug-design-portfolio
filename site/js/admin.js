const C=window.ARTMUG_CONFIG||{},API=C.API_BASE||'';let S=null,items=[],presetItems=[],fixedItems=[],quoteState={};let portfolioAdminPage=1,presetAdminPage=1,fixedAdminPage=1;const ADMIN_PAGE_SIZE=15;const QUOTE_BANNERS=[['top','상단배너'],['floating','플로팅배너'],['bottom1','하단배너 1칸'],['bottom3','하단배너 3칸'],['bottom6','하단배너 6칸']],QUOTE_OPTIONS=[['sameDay','당일마감'],['fast','빠른마감'],['private','포트폴리오 비공개']];const $=id=>document.getElementById(id);
const PRESET_UPLOAD_EXTS=new Set(['gif','png','jpg','jpeg','webp']);
function createUploadId(){
  const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
  const rand=new Uint32Array(2);
  crypto.getRandomValues(rand);
  return stamp+'-'+Array.from(rand,n=>n.toString(36)).join('');
}
async function uploadMediaWithRetry(endpoint,cat,file,status){
  const uploadId=createUploadId();
  let lastError;
  for(let attempt=0;attempt<2;attempt++){
    const fd=new FormData();
    fd.append('category',cat);
    fd.append('file',file);
    fd.append('uploadId',uploadId);
    try{
      const r=await fetch(API+endpoint,{method:'POST',credentials:'include',body:fd});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
      return d
    }catch(e){
      lastError=e;
      const network=/failed to fetch|networkerror|load failed|fetch failed/i.test(String(e?.message||e||''));
      if(!network||attempt===1)throw e;
      let retrySafe=false;
      try{
        const hr=await fetch(API+'/health',{credentials:'include',cache:'no-store'});
        const hd=await hr.json().catch(()=>({}));
        retrySafe=hr.ok&&hd.version==='1.1.0'
      }catch{}
      if(!retrySafe)throw new Error('업로드 서버 업데이트가 아직 적용되지 않았습니다. 잠시 후 다시 시도해주세요.');
      if(status)status.textContent='연결이 끊겨 자동으로 한 번 더 시도하고 있습니다…';
      await settingsDelay(900)
    }
  }
  throw lastError
}
function validatePresetUploadFile(file){
  if(!file)throw new Error('업로드할 파일을 선택해주세요.');
  const ext=String(file.name||'').split('.').pop().toLowerCase();
  if(!PRESET_UPLOAD_EXTS.has(ext))throw new Error('GIF, PNG, JPG, JPEG, WEBP 파일만 업로드할 수 있습니다.');
  if(file.size<=0)throw new Error('빈 파일은 업로드할 수 없습니다.');
}
// Display width/height and allowedSizes are layout references only.
async function validateCategoryImageSize(){return}
let toastTimer=null;
function showToast(message,type='success'){
  let el=document.getElementById('adminToast');
  if(!el){
    el=document.createElement('div');
    el.id='adminToast';
    el.className='admin-toast';
    el.setAttribute('role','status');
    el.setAttribute('aria-live','polite');
    document.body.appendChild(el);
  }
  el.textContent=message;
  el.className='admin-toast is-show '+(type==='error'?'is-error':'is-success');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.classList.remove('is-show')},2200);
}const api=(p,o={})=>fetch(API+p,{...o,credentials:'include',headers:{'Content-Type':'application/json',...(o.headers||{})}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d});
let settingsWriteQueue=Promise.resolve();
function isSettingsConflict(err){
  const m=String(err?.message||err||'');
  return /GitHub\s*409|\b409\b|does not match|\bexpected\s+[0-9a-f]{7,40}\b/i.test(m)
}
const settingsDelay=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchFreshSettings(){
  const d=await api('/api/public/settings?fresh='+Date.now());
  return d.settings||{}
}
function queueSettingsMutation(mutator){
  const run=settingsWriteQueue.then(async()=>{
    let lastError;
    for(let attempt=0;attempt<8;attempt++){
      const latest=await fetchFreshSettings();
      const next=JSON.parse(JSON.stringify(latest));
      mutator(next);
      try{
        const saved=await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:next})});
        return saved.settings||next
      }catch(e){
        lastError=e;
        if(!isSettingsConflict(e)||attempt===7)throw e;
        await settingsDelay(220+attempt*180)
      }
    }
    throw lastError
  });
  settingsWriteQueue=run.catch(()=>{});
  return run
}

function input(label,key,val,wide=false){return `<label class="${wide?'wide':''}"><span>${label}</span><input data-key="${key}" value="${String(val??'').replaceAll('"','&quot;')}"></label>`}function area(label,key,val,wide=false){return `<label class="${wide?'wide':''}"><span>${label}</span><textarea data-key="${key}">${String(val??'')}</textarea></label>`}
function adminEsc(v){return String(v??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function ensurePresetGroups(){if(!Array.isArray(S.presetGroups))S.presetGroups=[];S.presetGroups.forEach(g=>{if(!Array.isArray(g.miniCategories))g.miniCategories=[]});return S.presetGroups}
function presetGroupById(id){return ensurePresetGroups().find(g=>g.id===id)}
function presetGroupAllowsDescription(id){return !!presetGroupById(id)?.descriptionEnabled}
function parsePresetOriginalName(name){
  const raw=String(name||''),m=raw.match(/^__PG_(.+?)__PM_(.+?)__(.+)$/);
  return m?{groupId:m[1],miniCategory:m[2],cleanName:m[3]}:{groupId:'',miniCategory:'',cleanName:raw}
}
function ensurePresetMeta(){if(!S.presetMeta||typeof S.presetMeta!=='object'||Array.isArray(S.presetMeta))S.presetMeta={};return S.presetMeta}
function presetMetaFor(x){
  const meta=ensurePresetMeta()[x.file]||{};
  return {
    name:String(meta.name||''),
    description:String(meta.description??''),
    enabled:meta.enabled!==undefined?meta.enabled:x.enabled!==false,
    isNew:meta.isNew===true,
    isReserved:meta.isReserved===true,
    isReservable:meta.isReservable===true,
    isNoEdit:meta.isNoEdit===true,
    colorChangeAvailable:meta.colorChangeAvailable===true,
    showcaseKind:['preset','fixed'].includes(meta.showcaseKind)?meta.showcaseKind:'preset',
    featured:meta.featured===true,
    pairChild:meta.pairChild===true
  }
}
function ensurePortfolioMeta(){if(!S.portfolioMeta||typeof S.portfolioMeta!=='object'||Array.isArray(S.portfolioMeta))S.portfolioMeta={};return S.portfolioMeta}
function portfolioMetaFor(x){const meta=ensurePortfolioMeta()[x.file]||{};return {profileType:['A','B'].includes(meta.profileType)?meta.profileType:'',bannerType:['A','B'].includes(meta.bannerType)?meta.bannerType:'B',enabled:meta.enabled!==false,featured:meta.featured===true,name:String(meta.name||''),description:String(meta.description||'')}}
function isProfilePortfolioCategory(id){return /^profile(?:-|$)/.test(String(id||''))}
function logicalPortfolioCategory(id){return isProfilePortfolioCategory(id)?'profile':id}

function ensureBackgroundGuide(){
  if(!S.backgroundGuide||typeof S.backgroundGuide!=='object')S.backgroundGuide={};
  const g=S.backgroundGuide;
  if(g.enabled===undefined)g.enabled=true;
  const defaults=[
    {key:'a',badge:'A',title:'기본 움짤 프사',description:'원하시는 색상과 키워드를 바탕으로, 분위기에 어울리는 디자인 요소를 더해 제작하는 방식입니다.',details:['간단한 키워드만 전달해 주셔도 전체적인 무드에 맞춰 오마카세 형식으로 제작해드립니다.'],note:'',referenceImage:'',buttonLabel:'디자인 보러가기',targetKind:'portfolio',targetCategory:'profile'},
    {key:'b',badge:'B',title:'심플형 움짤 프사',description:'체크, 도트, 땡땡이, 그라데이션 등 비교적 간단한 패턴 배경이나 직접 제작한 고정형 프리셋을 활용해 제작하는 방식입니다.',details:['색상은 원하는 분위기에 맞게 자유롭게 변경 가능합니다.'],note:'프리셋에 없는 무늬나 패턴도 원하시는 느낌이 있다면 편하게 문의해 주세요.',referenceImage:'',buttonLabel:'디자인 보러가기',targetKind:'preset',targetCategory:'profile'}
  ];
  if(!Array.isArray(g.options))g.options=[];
  g.options=defaults.map((d,i)=>({...d,...(g.options[i]||{}),details:Array.isArray(g.options[i]?.details)?g.options[i].details:d.details}));
  return g
}
function renderBackgroundGuideAdmin(){
  if(!$('backgroundGuideFields'))return;
  const g=ensureBackgroundGuide();
  $('backgroundGuideEnabled').checked=g.enabled!==false;
  $('backgroundGuideFields').innerHTML=
    '<label><span>상단 작은 문구</span><input id="backgroundGuideKickerInput" value="'+adminEsc(g.kicker||'')+'"></label>'+
    '<label><span>큰 제목</span><input id="backgroundGuideTitleInput" value="'+adminEsc(g.title||'')+'"></label>'+
    '<label class="wide"><span>부제목</span><input id="backgroundGuideSubtitleInput" value="'+adminEsc(g.subtitle||'')+'"></label>';
  const targetNames=['포트폴리오 · 움짤프사','프리셋 · 움짤프사'];
  $('backgroundGuideOptions').innerHTML=g.options.slice(0,2).map((x,i)=>{
    const ref=x.referenceImage||(i===0?S.comparisonAImage:S.comparisonBImage)||'',src=ref?API+'/media/'+ref.split('/').map(encodeURIComponent).join('/'):'';
    return `
    <div class="background-guide-admin-card">
      <div class="background-guide-admin-head"><strong>${adminEsc(x.badge||String.fromCharCode(65+i))} 유형</strong><span class="muted">버튼 이동 위치: ${targetNames[i]}</span></div>
      <div class="guide-reference-admin">
        <div class="guide-reference-preview ${ref?'has-image':''}">${ref?`<img src="${src}" alt="참고 움 미리보기">`:'<span>참고 움 미등록</span>'}</div>
        <div class="guide-reference-tools">
          <label><span>설명 왼쪽 참고 움 · 이미지/GIF 1개</span><input id="guideReferenceFile${i}" type="file" accept=".gif,.png,.jpg,.jpeg,.webp,image/gif,image/png,image/jpeg,image/webp"></label>
          <div class="guide-reference-actions"><button type="button" class="ghost admin-compact" data-guide-reference-upload="${i}">${ref?'참고 움 교체':'참고 움 업로드'}</button><button type="button" class="danger admin-compact" data-guide-reference-delete="${i}" ${ref?'':'disabled'}>삭제</button></div>
        </div>
      </div>
      <div class="fields">
        <label><span>표시 문자</span><input data-bg-badge="${i}" value="${adminEsc(x.badge||'')}"></label>
        <label><span>유형 제목</span><input data-bg-title="${i}" value="${adminEsc(x.title||'')}"></label>
        <label class="wide"><span>설명</span><textarea data-bg-description="${i}">${adminEsc(x.description||'')}</textarea></label>
        <label class="wide"><span>세부 문구 · 한 줄에 하나씩</span><textarea data-bg-details="${i}">${adminEsc((x.details||[]).join('\n'))}</textarea></label>
        <label class="wide"><span>추가 안내 문구</span><textarea data-bg-note="${i}">${adminEsc(x.note||'')}</textarea></label>
        <label class="wide"><span>버튼 문구</span><input data-bg-button="${i}" value="${adminEsc(x.buttonLabel||'')}"></label>
      </div>
    </div>`
  }).join('');
  document.querySelectorAll('[data-guide-reference-upload]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.guideReferenceUpload);
    siteUpload(i===0?'comparison-a':'comparison-b','guideReferenceFile'+i)
  });
  document.querySelectorAll('[data-guide-reference-delete]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.guideReferenceDelete);
    siteDelete(i===0?'comparison-a':'comparison-b')
  })
}
function collectBackgroundGuide(){
  if(!$('backgroundGuideEnabled'))return;
  const g=ensureBackgroundGuide();
  g.enabled=$('backgroundGuideEnabled').checked;
  g.kicker=$('backgroundGuideKickerInput')?.value||'';
  g.title=$('backgroundGuideTitleInput')?.value||'';
  g.subtitle=$('backgroundGuideSubtitleInput')?.value||'';
  g.options.slice(0,2).forEach((x,i)=>{
    x.badge=document.querySelector(`[data-bg-badge="${i}"]`)?.value||'';
    x.title=document.querySelector(`[data-bg-title="${i}"]`)?.value||'';
    x.description=document.querySelector(`[data-bg-description="${i}"]`)?.value||'';
    x.details=(document.querySelector(`[data-bg-details="${i}"]`)?.value||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    x.note=document.querySelector(`[data-bg-note="${i}"]`)?.value||'';
    x.buttonLabel=document.querySelector(`[data-bg-button="${i}"]`)?.value||'';
  })
}
function ensureBannerTypeGuide(){
  if(!S.bannerTypeGuide||typeof S.bannerTypeGuide!=='object')S.bannerTypeGuide={};
  ['A','B'].forEach(t=>{
    if(!S.bannerTypeGuide[t]||typeof S.bannerTypeGuide[t]!=='object')S.bannerTypeGuide[t]={};
    const x=S.bannerTypeGuide[t];
    if(x.title==null)x.title=t==='A'?'심플형':'기존 디자인형';
    if(x.description==null)x.description=t==='A'?'장식과 패턴이 비교적 적고 깔끔하게 정돈된 디자인':'다양한 패턴과 장식을 조합한 기존 스타일의 디자인';
    if(x.price==null)x.price=0;
    if(x.referenceFile==null)x.referenceFile='';
    if(x.referenceImage==null)x.referenceImage=''
  });
  return S.bannerTypeGuide
}
function renderBannerTypeGuideAdmin(){
  const root=$('bannerTypeGuideAdmin');if(!root)return;
  const g=ensureBannerTypeGuide();
  root.innerHTML=['A','B'].map(t=>{
    const x=g[t]||{},kind='type-guide-'+t.toLowerCase(),has=!!x.referenceImage;
    return '<div class="banner-type-admin-card">'+
      '<div class="banner-type-admin-card-head"><h4>TYPE '+t+'</h4><span class="muted">통합 대표 이미지</span></div>'+
      '<div class="banner-type-guide-preview '+(has?'has-image':'')+'">'+
        (has?'<img src="'+API+'/media/'+x.referenceImage.split('/').map(encodeURIComponent).join('/')+'" alt="TYPE '+t+' 대표 이미지" loading="lazy">':'<span>대표 이미지 없음</span>')+
      '</div>'+
      '<div class="banner-type-image-actions">'+
        '<input id="bannerTypeGuideFile'+t+'" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp">'+
        '<button type="button" class="ghost admin-compact" data-upload-banner-guide="'+t+'">'+(has?'이미지 변경':'이미지 업로드')+'</button>'+
        '<button type="button" class="danger admin-compact" data-delete-banner-guide="'+t+'" '+(has?'':'disabled')+'>이미지 삭제</button>'+
      '</div>'+
      '<label class="banner-type-guide-description">TYPE '+t+' 설명<textarea data-banner-guide-desc="'+t+'">'+adminEsc(x.description||'')+'</textarea></label>'+
    '</div>'
  }).join('');
  root.querySelectorAll('[data-upload-banner-guide]').forEach(b=>b.onclick=()=>uploadBannerTypeGuideImage(b.dataset.uploadBannerGuide));
  root.querySelectorAll('[data-delete-banner-guide]').forEach(b=>b.onclick=()=>deleteBannerTypeGuideImage(b.dataset.deleteBannerGuide))
}
function collectBannerTypeGuideAdmin(){
  if(!$('bannerTypeGuideAdmin'))return;
  const g=ensureBannerTypeGuide();
  ['A','B'].forEach(t=>{
    const d=document.querySelector('[data-banner-guide-desc="'+t+'"]');
    if(d)g[t].description=d.value
  })
}
async function uploadBannerTypeGuideImage(t){
  t=String(t||'').toUpperCase();
  const input=$('bannerTypeGuideFile'+t),file=input?.files?.[0];
  if(!file)return alert('업로드할 대표 이미지를 선택해주세요.');
  const ext=String(file.name||'').split('.').pop().toLowerCase();
  if(!['png','jpg','jpeg','webp'].includes(ext))return alert('PNG, JPG, JPEG, WEBP 이미지만 업로드할 수 있습니다.');
  collectBannerTypeGuideAdmin();
  const current=ensureBannerTypeGuide()[t],old=String(current.referenceImage||''),description=String(current.description||'');
  const fd=new FormData();fd.append('category','type-guide-assets');fd.append('file',file);
  try{
    const r=await fetch(API+'/api/admin/upload',{method:'POST',credentials:'include',body:fd}),d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
    const path=String(d.path||'');if(!path)throw new Error('업로드 경로를 확인하지 못했습니다.');
    const saved=await queueSettingsMutation(latest=>{
      if(!latest.bannerTypeGuide||typeof latest.bannerTypeGuide!=='object')latest.bannerTypeGuide={};
      if(!latest.bannerTypeGuide[t]||typeof latest.bannerTypeGuide[t]!=='object')latest.bannerTypeGuide[t]={};
      latest.bannerTypeGuide[t].referenceImage=path;
      latest.bannerTypeGuide[t].description=description
    });
    S.bannerTypeGuide=saved.bannerTypeGuide||S.bannerTypeGuide||{};
    if(old&&old!==path&&old.startsWith('portfolio/type-guide-assets/')){
      await api('/api/admin/delete',{method:'POST',body:JSON.stringify({file:old})}).catch(()=>{})
    }
    if(input)input.value='';
    renderBannerTypeGuideAdmin();showToast('TYPE '+t+' 대표 이미지가 저장되었습니다.')
  }catch(e){alert('대표 이미지 업로드에 실패했습니다.\n'+e.message)}
}
async function deleteBannerTypeGuideImage(t){
  t=String(t||'').toUpperCase();
  if(!confirm('TYPE '+t+' 대표 이미지를 삭제할까요?'))return;
  collectBannerTypeGuideAdmin();
  const current=ensureBannerTypeGuide()[t],old=String(current.referenceImage||''),description=String(current.description||'');
  try{
    const saved=await queueSettingsMutation(latest=>{
      if(!latest.bannerTypeGuide||typeof latest.bannerTypeGuide!=='object')latest.bannerTypeGuide={};
      if(!latest.bannerTypeGuide[t]||typeof latest.bannerTypeGuide[t]!=='object')latest.bannerTypeGuide[t]={};
      latest.bannerTypeGuide[t].referenceImage='';
      latest.bannerTypeGuide[t].description=description
    });
    S.bannerTypeGuide=saved.bannerTypeGuide||S.bannerTypeGuide||{};
    if(old.startsWith('portfolio/type-guide-assets/')){
      await api('/api/admin/delete',{method:'POST',body:JSON.stringify({file:old})}).catch(()=>{})
    }
    renderBannerTypeGuideAdmin();showToast('TYPE '+t+' 대표 이미지를 삭제했습니다.')
  }catch(e){alert('대표 이미지 삭제에 실패했습니다.\n'+e.message)}
}
function adminPaginationHtml(page,totalPages){
  if(totalPages<=1)return'';
  const maxDots=12,start=Math.max(1,Math.min(totalPages-maxDots+1,page-Math.floor(maxDots/2))),end=Math.min(totalPages,start+maxDots-1);
  let dots='';
  for(let i=start;i<=end;i++)dots+='<button type="button" class="admin-page-dot '+(i===page?'is-active':'')+'" data-admin-page="'+i+'" aria-label="'+i+'페이지"></button>';
  return '<button type="button" class="admin-page-arrow" data-admin-page="prev" '+(page<=1?'disabled':'')+'>‹</button><div class="admin-page-dots">'+dots+'</div><span class="admin-page-counter">'+page+' / '+totalPages+'</span><button type="button" class="admin-page-arrow" data-admin-page="next" '+(page>=totalPages?'disabled':'')+'>›</button>'
}
function bindAdminPagination(rootId,type,page,totalPages){
  const root=$(rootId);if(!root)return;
  root.innerHTML=adminPaginationHtml(page,totalPages);
  root.hidden=totalPages<=1;
  root.querySelectorAll('[data-admin-page]').forEach(b=>b.onclick=()=>{
    const token=b.dataset.adminPage,next=token==='prev'?page-1:token==='next'?page+1:Number(token);
    if(type==='portfolio'){portfolioAdminPage=Math.max(1,Math.min(totalPages,next));renderItems()}
    else if(type==='fixed'){fixedAdminPage=Math.max(1,Math.min(totalPages,next));renderFixedItems()}
    else{presetAdminPage=Math.max(1,Math.min(totalPages,next));renderPresetItems()}
  })
}

function ensureEventItems(){
  if(!Array.isArray(S.eventsItems)){
    const oldPrice=Number(S.eventsOldPrice||0),newPrice=Number(S.eventsNewPrice||0);
    S.eventsItems=(oldPrice>0||newPrice>0)?[{label:String(S.eventsBenefitLabel||'리뷰 작성 시'),oldPrice,newPrice}]:[]
  }
  return S.eventsItems
}
function renderEventItems(){
  const root=$('eventItemsAdmin');if(!root)return;
  const items=ensureEventItems();
  root.innerHTML=items.map((x,i)=>`<div class="event-item-admin-row">
    <label>항목명<input data-event-label="${i}" value="${adminEsc(x.label||'')}" placeholder="예: 움짤프사"></label>
    <label>기존 가격<input data-event-old="${i}" type="number" min="0" step="100" value="${Number(x.oldPrice||0)}"></label>
    <label>할인가<input data-event-new="${i}" type="number" min="0" step="100" value="${Number(x.newPrice||0)}"></label>
    <button type="button" class="danger admin-compact" data-del-event-item="${i}">삭제</button>
  </div>`).join('')||'<p class="muted event-items-empty">등록된 할인 항목이 없습니다.</p>';
  document.querySelectorAll('[data-del-event-item]').forEach(b=>b.onclick=()=>{
    collectEventItems();
    S.eventsItems.splice(+b.dataset.delEventItem,1);
    renderEventItems()
  })
}
function collectEventItems(){
  const items=ensureEventItems();
  items.forEach((x,i)=>{
    const label=document.querySelector(`[data-event-label="${i}"]`);
    const oldPrice=document.querySelector(`[data-event-old="${i}"]`);
    const newPrice=document.querySelector(`[data-event-new="${i}"]`);
    if(label)x.label=label.value.trim();
    if(oldPrice)x.oldPrice=Number(oldPrice.value||0);
    if(newPrice)x.newPrice=Number(newPrice.value||0)
  });
  S.eventsItems=items
}
function renderWorkStatusAdmin(){
  if(!$('workStatusEnabled'))return;
  $('workStatusEnabled').checked=S.workStatusEnabled===true;
  const mode=S.workStatusMode==='sleeping'?'sleeping':'working';
  const radio=document.querySelector('input[name="workStatusMode"][value="'+mode+'"]');
  if(radio)radio.checked=true;
  $('workStatusWorkingText').value=String(S.workStatusWorkingText??'');
  $('workStatusSleepingText').value=String(S.workStatusSleepingText??'현재 취침 중으로 문의 답변이 조금 늦을 수 있어요.');
}
function collectWorkStatusAdmin(){
  if(!$('workStatusEnabled'))return;
  S.workStatusEnabled=$('workStatusEnabled').checked;
  S.workStatusMode=document.querySelector('input[name="workStatusMode"]:checked')?.value==='sleeping'?'sleeping':'working';
  S.workStatusWorkingText=$('workStatusWorkingText').value;
  S.workStatusSleepingText=$('workStatusSleepingText').value;
}
function ensureScheduleExtras(){
  if(!Array.isArray(S.scheduleExtras))S.scheduleExtras=[];
  S.scheduleExtras=S.scheduleExtras.map(x=>String(x??''));
  return S.scheduleExtras
}
function collectScheduleAdmin(){
  if(!$('scheduleEnabled'))return;
  S.scheduleEnabled=$('scheduleEnabled').checked;
  const mode=document.querySelector('input[name="scheduleMode"]:checked')?.value;
  S.scheduleMode=['start','deadline','custom'].includes(mode)?mode:'start';
  S.scheduleDate=$('scheduleDate').value;
  const dateColorHex=$('scheduleDateColorHex');
  const validDateColor=normalizeHex6(dateColorHex?.value);
  if(validDateColor)S.scheduleDateColor=validDateColor;
  const custom=$('scheduleCustomText');
  if(custom)S.scheduleCustomText=custom.value;
  S.scheduleExtras=Array.from(document.querySelectorAll('[data-schedule-extra]')).map(x=>x.value);

}
function renderScheduleAdmin(){
  if(!$('scheduleFields'))return;
  const mode=['start','deadline','custom'].includes(S.scheduleMode)?S.scheduleMode:'start';
  const extras=ensureScheduleExtras();
  const scheduleDateColor=normalizeHex6(S.scheduleDateColor)||'#4E9BC6';
  $('scheduleFields').innerHTML=`
    <div class="wide schedule-admin-top">
      <label class="toggle schedule-enabled-toggle"><input id="scheduleEnabled" type="checkbox" ${S.scheduleEnabled!==false?'checked':''}> 작업 일정 안내 표시</label>
    </div>
    <label><span>기준 날짜</span><input id="scheduleDate" type="date" value="${adminEsc(S.scheduleDate||'')}"><small class="field-note">공개 페이지는 한국 시간 기준 밤 10시 전에는 오늘, 밤 10시 이후에는 다음날보다 과거인 날짜를 자동으로 보정해 표시합니다.</small></label>
    <div class="wide schedule-date-color-admin">
      <div class="schedule-date-color-controls">
        <label class="schedule-date-color-picker">날짜 강조 색상 <input id="scheduleDateColorPicker" type="color" value="${scheduleDateColor.toLowerCase()}"></label>
        <label class="schedule-date-color-hex">HEX <input id="scheduleDateColorHex" type="text" value="${scheduleDateColor}" maxlength="7" autocomplete="off" spellcheck="false"></label>
        <button id="scheduleDateColorEyedropper" type="button" class="ghost admin-compact" ${'EyeDropper' in window?'':'hidden'}>스포이드</button>
      </div>
      <div class="schedule-date-color-preview">미리보기 · 현재 신청시 <strong id="scheduleDateColorPreview" style="color:${scheduleDateColor}">9월 28일</strong>부터 작업이 진행됩니다!</div>
    </div>
    <fieldset class="wide admin-status-choice schedule-mode-choice">
      <legend>안내 문구 선택</legend>
      <div class="admin-status-pills schedule-mode-pills">
        <label>
          <input type="radio" name="scheduleMode" value="start" ${mode==='start'?'checked':''}>
          <span><strong>작업 시작 안내</strong><small>현재 신청시 {date}부터 작업이 진행됩니다!</small></span>
        </label>
        <label>
          <input type="radio" name="scheduleMode" value="deadline" ${mode==='deadline'?'checked':''}>
          <span><strong>작업 마감 안내</strong><small>현재 신청시 {date}까지 마감됩니다!</small></span>
        </label>
        <label>
          <input type="radio" name="scheduleMode" value="custom" ${mode==='custom'?'checked':''}>
          <span><strong>직접 입력</strong><small>원하는 문구를 직접 작성합니다.</small></span>
        </label>
      </div>
    </fieldset>
    <label id="scheduleCustomField" class="wide" ${mode==='custom'?'':'hidden'}>
      <span>직접 입력 문구</span>
      <input id="scheduleCustomText" value="${adminEsc(S.scheduleCustomText||'')}" placeholder="예: 현재 신청시 {date}까지 주문 가능합니다!">
      <small class="field-note">날짜가 들어갈 위치에 <b>{date}</b>를 입력해주세요.</small>
    </label>
    <div class="wide schedule-extra-admin">
      <div class="schedule-extra-head"><div><strong>추가 안내 문구</strong><p class="muted">선택한 안내 문구 아래에 필요한 내용을 추가할 수 있습니다.</p></div><button id="addScheduleExtra" type="button" class="ghost admin-compact">+ 문구 추가</button></div>
      <div id="scheduleExtraList">${extras.map((text,i)=>`<div class="schedule-extra-row"><input data-schedule-extra="${i}" value="${adminEsc(text)}" placeholder="추가 안내 문구"><button type="button" class="danger admin-compact" data-del-schedule-extra="${i}">삭제</button></div>`).join('')||'<p class="muted schedule-extra-empty">추가 안내 문구가 없습니다.</p>'}</div>
    </div>
  `;

  const scheduleColorPicker=$('scheduleDateColorPicker');
  const scheduleColorHex=$('scheduleDateColorHex');
  const scheduleColorPreview=$('scheduleDateColorPreview');
  const applyScheduleColor=value=>{
    const color=normalizeHex6(value);
    if(!color)return false;
    S.scheduleDateColor=color;
    if(scheduleColorPicker)scheduleColorPicker.value=color.toLowerCase();
    if(scheduleColorHex){scheduleColorHex.value=color;scheduleColorHex.classList.remove('is-invalid')}
    if(scheduleColorPreview)scheduleColorPreview.style.color=color;
    return true
  };
  if(scheduleColorPicker){
    scheduleColorPicker.addEventListener('input',()=>applyScheduleColor(scheduleColorPicker.value));
    scheduleColorPicker.addEventListener('change',()=>applyScheduleColor(scheduleColorPicker.value))
  }
  if(scheduleColorHex){
    scheduleColorHex.addEventListener('input',()=>{
      const color=normalizeHex6(scheduleColorHex.value);
      scheduleColorHex.classList.toggle('is-invalid',!!scheduleColorHex.value&&!color);
      if(color)applyScheduleColor(color)
    })
  }
  const scheduleEyedropper=$('scheduleDateColorEyedropper');
  if(scheduleEyedropper)scheduleEyedropper.onclick=async()=>{
    if(!('EyeDropper' in window))return;
    try{
      const result=await new EyeDropper().open();
      const color=normalizeHex6(result?.sRGBHex);
      if(color)applyScheduleColor(color)
    }catch{}
  };

  document.querySelectorAll('input[name="scheduleMode"]').forEach(r=>r.onchange=()=>{
    const field=$('scheduleCustomField');
    if(field)field.hidden=r.value!=='custom';
  });

  $('addScheduleExtra').onclick=()=>{
    collectScheduleAdmin();
    ensureScheduleExtras().push('');
    renderScheduleAdmin()
  };
  document.querySelectorAll('[data-del-schedule-extra]').forEach(b=>b.onclick=()=>{
    collectScheduleAdmin();
    S.scheduleExtras.splice(Number(b.dataset.delScheduleExtra),1);
    renderScheduleAdmin()
  });
  syncAdminVisibilityCollapse();
}
const ADMIN_COLLAPSE_STORAGE_KEY='artmug-admin-collapsed-blocks-v1';

function adminBlockKey(block,index){
  const title=block.querySelector('.admin-block-title h3')?.textContent?.trim()||'section';
  const section=block.closest('[data-section]')?.dataset.section||'page';
  return section+':'+index+':'+title
}
function readAdminCollapsedBlocks(){
  try{
    const value=JSON.parse(localStorage.getItem(ADMIN_COLLAPSE_STORAGE_KEY)||'[]');
    return new Set(Array.isArray(value)?value:[])
  }catch{return new Set()}
}
function writeAdminCollapsedBlocks(set){
  try{localStorage.setItem(ADMIN_COLLAPSE_STORAGE_KEY,JSON.stringify([...set]))}catch{}
}
function updateAdminCollapseButton(block){
  const button=block.querySelector('.admin-collapse-button');
  if(!button)return;
  const visibilityCollapsed=block.classList.contains('is-visibility-collapsed')||block.classList.contains('is-schedule-visibility-collapsed');
  const manualCollapsed=block.classList.contains('is-manual-collapsed');
  const collapsed=visibilityCollapsed||manualCollapsed;
  button.textContent=collapsed?'펼치기':'접기';
  button.setAttribute('aria-expanded',collapsed?'false':'true');
  button.title=collapsed?'세부 설정 펼치기':'세부 설정 접기'
}
function syncAdminManualCollapsers(){
  const saved=readAdminCollapsedBlocks();
  document.querySelectorAll('.admin-block').forEach((block,index)=>{
    const title=block.querySelector('.admin-block-title');
    if(!title)return;
    if(block.dataset.manualCollapse==='off'){
      block.classList.remove('is-manual-collapsed');
      title.querySelector('.admin-collapse-button')?.remove();
      return
    }
    const key=adminBlockKey(block,index);
    block.dataset.adminCollapseKey=key;

    let button=title.querySelector('.admin-collapse-button');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='ghost admin-collapse-button';
      title.appendChild(button);
      button.addEventListener('click',()=>{
        const autoCollapsed=block.classList.contains('is-visibility-collapsed')||block.classList.contains('is-schedule-visibility-collapsed');
        if(autoCollapsed)return;
        const next=!block.classList.contains('is-manual-collapsed');
        block.classList.toggle('is-manual-collapsed',next);
        const current=readAdminCollapsedBlocks();
        if(next)current.add(key);else current.delete(key);
        writeAdminCollapsedBlocks(current);
        updateAdminCollapseButton(block)
      })
    }
    block.classList.toggle('is-manual-collapsed',saved.has(key));
    updateAdminCollapseButton(block)
  })
}
function syncPortfolioCategoryCollapse(){
  const button=$('togglePortfolioCats'),body=$('portfolioCatsBody');
  if(!button||!body)return;
  const key='artmug-admin-portfolio-categories-collapsed-v1';
  const apply=collapsed=>{
    body.hidden=collapsed;
    button.textContent=collapsed?'펼치기':'접기';
    button.setAttribute('aria-expanded',collapsed?'false':'true')
  };
  let collapsed=false;
  try{collapsed=localStorage.getItem(key)==='1'}catch{}
  apply(collapsed);
  if(button.dataset.boundPortfolioCats!=='1'){
    button.dataset.boundPortfolioCats='1';
    button.addEventListener('click',()=>{
      const next=!body.hidden;
      apply(next);
      try{localStorage.setItem(key,next?'1':'0')}catch{}
    })
  }
}

function syncAdminVisibilityCollapse(){
  const ids=['workStatusEnabled','authorEnabled','eventsEnabled','presetEnabled','scheduleEnabled'];
  ids.forEach(id=>{
    const input=$(id);if(!input)return;
    const block=input.closest('.admin-block');if(!block)return;
    const isSchedule=id==='scheduleEnabled';
    const apply=()=>{
      const collapsed=!input.checked;
      block.classList.toggle('is-visibility-collapsed',collapsed&&!isSchedule);
      block.classList.toggle('is-schedule-visibility-collapsed',collapsed&&isSchedule);

      // Turning a section back on always opens it immediately.
      if(!collapsed){
        block.classList.remove('is-manual-collapsed');
        const current=readAdminCollapsedBlocks();
        current.delete(block.dataset.adminCollapseKey||'');
        writeAdminCollapsedBlocks(current)
      }
      updateAdminCollapseButton(block)
    };
    if(input.dataset.visibilityCollapseBound!=='1'){
      input.dataset.visibilityCollapseBound='1';
      input.addEventListener('change',apply)
    }
    apply()
  })
  syncAdminManualCollapsers()
}
function syncBannerTypeAdminUI(){
  const on=S?.bannerTypeEnabled!==false,toggle=$('bannerTypeEnabled'),details=$('bannerTypeAdminDetails');
  if(toggle){
    toggle.checked=on;
    if(toggle.dataset.bannerTypeBound!=='1'){
      toggle.dataset.bannerTypeBound='1';
      toggle.addEventListener('change',()=>{
        S.bannerTypeEnabled=toggle.checked;
        if(details)details.hidden=!toggle.checked;
        updatePortfolioUploadHint();
        renderItems()
      })
    }
  }
  if(details)details.hidden=!on
}

function render(){
renderScheduleAdmin();
$('noticeFields').innerHTML=input('공지 제목','noticeTitle',S.noticeTitle)+area('공지 안내 문구','noticeText',S.noticeText,true);
$('formFields').innerHTML=input('문의양식 제목','formTitle',S.formTitle)+area('문의양식 설명','formDescription',S.formDescription,true)+input('닉네임 항목','nicknameLabel',S.nicknameLabel)+input('닉네임 placeholder','nicknamePlaceholder',S.nicknamePlaceholder)+input('디자인 종류 항목','designTypeLabel',S.designTypeLabel)+input('틀 보관 항목','frameKeepLabel',S.frameKeepLabel)+area('틀 보관 설명','frameKeepDescription',S.frameKeepDescription,true)+input('컨셉 및 색상 항목','conceptLabel',S.conceptLabel||'원하는 디자인 컨셉 및 색상')+input('컨셉 및 색상 placeholder','conceptPlaceholder',S.conceptPlaceholder||'예: 하트, 귀여운 느낌, 민트·화이트·라벤더 조합')+area('내용 입력 placeholder','bannerTextPlaceholder',S.bannerTextPlaceholder||'예: 상단 배너 - 칠공\n플로팅 배너 - 노래책, 유튜브, 팬카페',true)+input('추가 요청 항목','extraLabel',S.extraLabel)+input('추가 요청 placeholder','extraPlaceholder',S.extraPlaceholder)+input('복사 버튼','copyButton',S.copyButton)+input('복사 완료 문구','copySuccess',S.copySuccess)+input('움짤 틀 보관 O','frameKeepYes',S.frameKeepYes)+input('움짤 틀 보관 X','frameKeepNo',S.frameKeepNo)+input('시그풍 숫자 항목','signatureNumberLabel',S.signatureNumberLabel)+input('시그풍 숫자 placeholder','signatureNumberPlaceholder',S.signatureNumberPlaceholder)+input('시그풍 내용 항목','signatureContentLabel',S.signatureContentLabel)+input('시그풍 내용 placeholder','signatureContentPlaceholder',S.signatureContentPlaceholder);
$('portfolioTextFields').innerHTML=input('포트폴리오 제목','portfolioTitle',S.portfolioTitle,true);
$('footerFields').innerHTML=input('하단 문구','footerText',S.footerText,true);
renderNotices();renderTypes();renderCats();renderPresetCats();renderFixedAdmin();renderPresetGroups();renderBackgroundGuideAdmin();renderBannerTypeGuideAdmin();renderQuoteAdmin();renderEventItems();renderWorkStatusAdmin();$('presetEnabled').checked=!!S.presetEnabled;$('presetTitle').value=S.presetTitle||'프리셋';$('presetNotice').value=S.presetNotice||'';if($('showcaseInitialDesktop'))$('showcaseInitialDesktop').value=Math.min(5,Number(S.showcaseInitialDesktop||5));if($('showcaseInitialMobile'))$('showcaseInitialMobile').value=Math.min(4,Number(S.showcaseInitialMobile||4));if($('showcasePresetEnabled'))$('showcasePresetEnabled').checked=S.showcasePresetEnabled!==false;if($('showcasePresetExpandEnabled'))$('showcasePresetExpandEnabled').checked=S.showcasePresetExpandEnabled!==false;$('authorEnabled').checked=!!S.authorEnabled;if($('authorName'))$('authorName').value=S.authorName||'CHILGONG DESIGN';$('authorText').value=S.authorText||'';$('authorFontSize').value=S.authorFontSize||15;$('eventsEnabled').checked=!!S.eventsEnabled;$('eventsKicker').value=S.eventsKicker||'REVIEW EVENT';$('eventsTitle').value=S.eventsTitle||'이벤트 안내';$('eventsText').value=S.eventsText||'';$('eventsNote').value=S.eventsNote||'※ 움짤프사 + 상단배너 둘 다 주문해도 중복 할인은 적용되지 않습니다.';$('eventsTitleFontSize').value=S.eventsTitleFontSize||22;$('eventsFontSize').value=S.eventsFontSize||15;$('api').textContent=API;syncBannerTypeAdminUI();syncAdminVisibilityCollapse();syncPortfolioCategoryCollapse();loadItems();}
const noticeSelectionRanges=new Map();
const noticeColorTargets=new Map();
function normalizeHex6(value){
  const v=String(value||'').trim();
  return /^#[0-9a-f]{6}$/i.test(v)?v.toUpperCase():''
}
function adminNoticeTextHtml(value){
  return adminEsc(value).replace(/\r?\n/g,'<br>')
}
function adminNoticeSafeColor(value){
  const v=String(value||'').trim();
  if(/^#[0-9a-f]{3,8}$/i.test(v))return v;
  if(/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(v))return v;
  return ''
}
function normalizeNoticeRichHtml(html){
  const template=document.createElement('template');
  template.innerHTML=String(html||'');
  const serialize=node=>{
    if(node.nodeType===Node.TEXT_NODE)return adminEsc(node.nodeValue);
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const tag=node.tagName.toUpperCase();
    const inner=Array.from(node.childNodes).map(serialize).join('');
    if(tag==='BR')return '<br>';
    if(tag==='B'||tag==='STRONG')return '<strong>'+inner+'</strong>';
    if(tag==='FONT'||tag==='SPAN'){
      const color=adminNoticeSafeColor(tag==='FONT'?node.getAttribute('color'):node.style.color);
      return color?'<span style="color:'+color+'">'+inner+'</span>':inner
    }
    if(tag==='DIV'||tag==='P')return inner+'<br>';
    return inner
  };
  return Array.from(template.content.childNodes).map(serialize).join('').replace(/(?:<br>)+$/,'')
}
function noticeEditorHtml(item,richKey,plainKey){
  const rich=String(item?.[richKey]||'').trim();
  return rich?normalizeNoticeRichHtml(rich):adminNoticeTextHtml(item?.[plainKey]||'')
}
function noticeSelectionKey(editor){
  return String(editor?.dataset?.noticeI??'')
}
function rememberNoticeSelection(editor){
  const sel=window.getSelection();
  if(!editor||!sel||!sel.rangeCount)return;
  const range=sel.getRangeAt(0);
  if(editor.contains(range.commonAncestorContainer)&&!range.collapsed){
    const key=noticeSelectionKey(editor);
    noticeSelectionRanges.set(key,range.cloneRange());
    noticeColorTargets.delete(key)
  }
}
function noticeRangeFor(i){
  const editor=document.querySelector(`[data-notice-rich="description"][data-notice-i="${i}"]`);
  const range=noticeSelectionRanges.get(String(i));
  if(!editor||!range||range.collapsed)return null;
  try{
    if(!editor.contains(range.commonAncestorContainer))return null
  }catch{return null}
  return {editor,range:range.cloneRange()}
}
function selectNoticeRange(i,range){
  if(!range)return;
  const sel=window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  noticeSelectionRanges.set(String(i),range.cloneRange())
}
function wrapNoticeSelection(i,tagName,setup){
  const state=noticeRangeFor(i);
  if(!state)return null;
  const {editor,range}=state;
  editor.focus({preventScroll:true});
  selectNoticeRange(i,range);
  const wrapper=document.createElement(tagName);
  if(typeof setup==='function')setup(wrapper);
  try{
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
  }catch{
    return null
  }
  const next=document.createRange();
  next.selectNodeContents(wrapper);
  selectNoticeRange(i,next);
  noticeSelectionRanges.set(String(i),next.cloneRange());
  updateNoticePreview(i);
  return wrapper
}
function clearNoticeSelectionFormat(i){
  const state=noticeRangeFor(i);
  if(!state)return;
  const {editor,range}=state;
  editor.focus({preventScroll:true});
  const holder=document.createElement('span');
  let fragment;
  try{fragment=range.extractContents()}catch{return}
  holder.appendChild(fragment);
  holder.querySelectorAll('strong,b,font,span').forEach(el=>el.replaceWith(...Array.from(el.childNodes)));
  range.insertNode(holder);
  const next=document.createRange();
  next.selectNodeContents(holder);
  selectNoticeRange(i,next);
  noticeColorTargets.delete(String(i));
  updateNoticePreview(i)
}
function noticeDefaultColor(){
  return '#475569'
}
function updateNoticePreview(i){
  const desc=document.querySelector(`[data-notice-rich="description"][data-notice-i="${i}"]`);
  const descOut=document.querySelector(`[data-notice-preview-desc="${i}"]`);
  if(descOut)descOut.innerHTML=normalizeNoticeRichHtml(desc?.innerHTML||'')
}
function applyNoticeColor(i,value){
  const color=normalizeHex6(value);
  if(!color)return false;
  const key=String(i);
  let target=noticeColorTargets.get(key);
  const editor=document.querySelector(`[data-notice-rich="description"][data-notice-i="${i}"]`);
  if(!target||!target.isConnected||!editor?.contains(target)){
    target=wrapNoticeSelection(i,'span',el=>{el.style.color=color});
    if(!target)return false;
    noticeColorTargets.set(key,target)
  }else{
    target.style.color=color;
    const next=document.createRange();
    next.selectNodeContents(target);
    selectNoticeRange(i,next);
    updateNoticePreview(i)
  }
  if(S.noticeItems?.[i])S.noticeItems[i].editorColor=color;
  return true
}
function applyNoticeFormat(i,command){
  noticeColorTargets.delete(String(i));
  if(command==='bold'){
    wrapNoticeSelection(i,'strong');
    return
  }
  if(command==='defaultColor'){
    applyNoticeColor(i,noticeDefaultColor());
    return
  }
  if(command==='clear'){
    clearNoticeSelectionFormat(i)
  }
}
async function pickNoticeEyedropper(i){
  if(!('EyeDropper' in window))return;
  try{
    const result=await new EyeDropper().open();
    const color=normalizeHex6(result?.sRGBHex);
    if(!color)return;
    const picker=document.querySelector(`[data-notice-color="${i}"]`);
    const hex=document.querySelector(`[data-notice-hex="${i}"]`);
    if(picker)picker.value=color.toLowerCase();
    if(hex)hex.value=color;
    applyNoticeColor(i,color)
  }catch{}
}

function collectNotices(){
  (S.noticeItems||[]).forEach((x,i)=>{
    const enabled=document.querySelector(`[data-notice-enabled="${i}"]`);
    const desc=document.querySelector(`[data-notice-rich="description"][data-notice-i="${i}"]`);
    if(enabled)x.enabled=enabled.checked;
    if(desc){
      x.descriptionRich=normalizeNoticeRichHtml(desc.innerHTML);
      x.description=String(desc.innerText||'').replace(/\u00a0/g,' ').trim()
    }
  })
}
function renderNotices(){
  const items=Array.isArray(S.noticeItems)?S.noticeItems:[];
  $('notices').innerHTML=items.map((x,i)=>`
    <div class="editable notice-admin-card">
      <div class="notice-admin-head">
        <span class="notice-admin-number">${i+1}</span>
        <label class="mini-toggle"><input type="checkbox" data-notice-enabled="${i}" ${x.enabled!==false?'checked':''}> 공개</label>
        <div class="notice-admin-order">
          <button type="button" class="ghost cat-order-button" data-move-notice="${i}" data-dir="-1" ${i===0?'disabled':''} aria-label="위로 이동">↑</button>
          <button type="button" class="ghost cat-order-button" data-move-notice="${i}" data-dir="1" ${i===items.length-1?'disabled':''} aria-label="아래로 이동">↓</button>
        </div>
        <button class="danger" data-del-notice="${i}">삭제</button>
      </div>
      <label class="notice-rich-label"><span>공지 내용</span><div class="notice-rich-editor notice-rich-description" contenteditable="true" spellcheck="true" data-notice-rich="description" data-notice-i="${i}">${noticeEditorHtml(x,'descriptionRich','description')}</div></label>
      <div class="notice-rich-toolbar">
        <span class="muted">선택 문구 서식</span>
        <button type="button" class="ghost admin-compact" data-notice-format="bold" data-notice-i="${i}">굵게</button>
        <label class="notice-color-tool">글자색 <input type="color" data-notice-color="${i}" value="${(normalizeHex6(x.editorColor)||'#327CAA').toLowerCase()}"></label>
        <label class="notice-hex-tool">HEX <input type="text" data-notice-hex="${i}" value="${normalizeHex6(x.editorColor)||'#327CAA'}" inputmode="text" autocomplete="off" spellcheck="false" maxlength="7"></label>
        <button type="button" class="ghost admin-compact notice-eyedropper" data-notice-eyedropper="${i}" ${'EyeDropper' in window?'':'hidden'}>스포이드</button>
        <button type="button" class="ghost admin-compact" data-notice-format="defaultColor" data-notice-i="${i}">기본색</button>
        <button type="button" class="ghost admin-compact" data-notice-format="clear" data-notice-i="${i}">강조 해제</button>
      </div>
      <div class="notice-admin-preview" aria-label="공개 미리보기">
        <span class="notice-admin-preview-index">${i+1}</span>
        <div class="notice-admin-preview-copy"><span data-notice-preview-desc="${i}">${noticeEditorHtml(x,'descriptionRich','description')}</span></div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.notice-rich-editor').forEach(editor=>{
    const capture=()=>rememberNoticeSelection(editor);
    editor.addEventListener('pointerup',capture);
    editor.addEventListener('keyup',capture);
    editor.addEventListener('focus',capture);
    editor.addEventListener('input',()=>{
      noticeColorTargets.delete(noticeSelectionKey(editor));
      updateNoticePreview(Number(editor.dataset.noticeI))
    })
  });
  if(!window.__noticeSelectionTrackerBound){
    window.__noticeSelectionTrackerBound=true;
    document.addEventListener('selectionchange',()=>{
      const sel=window.getSelection();
      if(!sel||!sel.rangeCount)return;
      let node=sel.anchorNode;
      if(node?.nodeType===Node.TEXT_NODE)node=node.parentElement;
      const editor=node?.closest?.('.notice-rich-editor');
      if(editor)rememberNoticeSelection(editor)
    })
  }
  document.querySelectorAll('[data-notice-format]').forEach(b=>{
    b.addEventListener('mousedown',e=>e.preventDefault());
    b.onclick=()=>applyNoticeFormat(+b.dataset.noticeI,b.dataset.noticeFormat)
  });
  document.querySelectorAll('[data-notice-color]').forEach(input=>{
    const i=+input.dataset.noticeColor;
    const capture=()=>{
      const editor=document.querySelector(`[data-notice-rich="description"][data-notice-i="${i}"]`);
      if(editor)rememberNoticeSelection(editor);
      noticeColorTargets.delete(String(i))
    };
    input.addEventListener('pointerdown',capture);
    const apply=()=>{
      const color=normalizeHex6(input.value);
      if(!color)return;
      const hex=document.querySelector(`[data-notice-hex="${i}"]`);
      if(hex)hex.value=color;
      applyNoticeColor(i,color)
    };
    input.addEventListener('input',apply);
    input.addEventListener('change',apply)
  });
  document.querySelectorAll('[data-notice-hex]').forEach(input=>{
    const i=+input.dataset.noticeHex;
    input.addEventListener('pointerdown',()=>{
      const editor=document.querySelector(`[data-notice-rich="description"][data-notice-i="${i}"]`);
      if(editor)rememberNoticeSelection(editor);
      noticeColorTargets.delete(String(i))
    });
    input.addEventListener('input',()=>{
      const color=normalizeHex6(input.value);
      input.classList.toggle('is-invalid',!!input.value&&!color);
      if(!color)return;
      input.value=color;
      const picker=document.querySelector(`[data-notice-color="${i}"]`);
      if(picker)picker.value=color.toLowerCase();
      applyNoticeColor(i,color)
    })
  });
  document.querySelectorAll('[data-notice-eyedropper]').forEach(b=>{
    b.addEventListener('mousedown',e=>e.preventDefault());
    b.onclick=()=>pickNoticeEyedropper(+b.dataset.noticeEyedropper)
  });
  document.querySelectorAll('[data-move-notice]').forEach(b=>b.onclick=()=>{
    collectNotices();
    const i=+b.dataset.moveNotice,j=i+Number(b.dataset.dir);
    if(j<0||j>=S.noticeItems.length)return;
    [S.noticeItems[i],S.noticeItems[j]]=[S.noticeItems[j],S.noticeItems[i]];
    renderNotices()
  });
  document.querySelectorAll('[data-del-notice]').forEach(b=>b.onclick=()=>{
    collectNotices();
    S.noticeItems.splice(+b.dataset.delNotice,1);
    renderNotices()
  })
}

function renderTypes(){
  $('types').innerHTML=(S.designTypes||[]).map((x,i)=>`<div class="editable type-edit">
    <label class="type-name">디자인 이름<input data-type-label="${i}" value="${adminEsc(x.label||'')}"></label>
    <div class="type-options">
      <label><input type="checkbox" data-type-enabled="${i}" ${x.enabled!==false?'checked':''}> 공개</label>
      <label><input type="checkbox" data-type-frame="${i}" ${x.showFrameRetention?'checked':''}> 틀 보관</label>
      <label><input type="checkbox" data-type-sign="${i}" ${x.showSignatureFields?'checked':''}> 시그풍</label>
      <label><input type="checkbox" data-type-banner="${i}" ${x.showBannerFields?'checked':''}> 하단 배너 종류</label>
      <label><input type="checkbox" data-type-banner-text="${i}" ${x.showBannerTextField?'checked':''}> 내용 입력</label>
    </div>
    <div class="type-order-controls">
      <button type="button" class="ghost cat-order-button" data-move-type="${i}" data-dir="-1" aria-label="위로 이동" title="위로 이동">↑</button>
      <button type="button" class="ghost cat-order-button" data-move-type="${i}" data-dir="1" aria-label="아래로 이동" title="아래로 이동">↓</button>
    </div>
    <button class="danger" data-del-type="${i}">삭제</button>
  </div>`).join('');

  document.querySelectorAll('[data-move-type]').forEach(b=>b.onclick=()=>{
    collect();
    const i=Number(b.dataset.moveType),next=i+Number(b.dataset.dir);
    if(next<0||next>=S.designTypes.length)return;
    [S.designTypes[i],S.designTypes[next]]=[S.designTypes[next],S.designTypes[i]];
    renderTypes()
  });

  document.querySelectorAll('[data-del-type]').forEach(b=>b.onclick=()=>{
    collect();
    S.designTypes.splice(+b.dataset.delType,1);
    renderTypes()
  })
}
function catRow(c,i,prefix='cat'){
  if(prefix==='cat'){
    return `<div class="cat-row cat-row-portfolio">
      <div class="cat-row-main">
        <label class="cat-name-field">이름<input data-${prefix}-label="${i}" value="${adminEsc(c.label||'')}"></label>
        <label class="cat-id-field">ID<input data-${prefix}-id="${i}" value="${adminEsc(c.id||'')}"></label>
        <label class="cat-number-field">표시 가로<input type="number" data-${prefix}-w="${i}" value="${c.displayWidth||200}"></label>
        <label class="cat-number-field">표시 세로<input type="number" data-${prefix}-h="${i}" value="${c.displayHeight||200}"></label>
        <label class="cat-number-field">PC 한 줄<input type="number" min="1" max="12" data-${prefix}-pc-cols="${i}" value="${Number(c.pcColumns||4)}"></label>
        <label class="cat-number-field">PC 페이지<input type="number" min="1" data-${prefix}-pc-page="${i}" value="${Number(c.pcPerPage||16)}"></label>
        <label class="cat-number-field">모바일 한 줄<input type="number" min="1" max="8" data-${prefix}-mo-cols="${i}" value="${Number(c.mobileColumns||2)}"></label>
        <label class="cat-number-field">모바일 페이지<input type="number" min="1" data-${prefix}-mo-page="${i}" value="${Number(c.mobilePerPage||10)}"></label>
      </div>
      <div class="cat-row-actions">
        <label class="mini-toggle"><input type="checkbox" data-${prefix}-enabled="${i}" ${c.enabled!==false?'checked':''}> 공개</label>
        <div class="cat-order-controls"><button type="button" class="ghost cat-order-button" data-move-${prefix}="${i}" data-dir="-1" aria-label="위로 이동">↑</button><button type="button" class="ghost cat-order-button" data-move-${prefix}="${i}" data-dir="1" aria-label="아래로 이동">↓</button></div>
        <button class="danger admin-compact" data-del-${prefix}="${i}">삭제</button>
      </div>
    </div>`
  }
  return `<div class="cat-row"><label>이름<input data-${prefix}-label="${i}" value="${adminEsc(c.label||'')}"></label><label>ID<input data-${prefix}-id="${i}" value="${adminEsc(c.id||'')}"></label><label>표시 가로<input type="number" data-${prefix}-w="${i}" value="${c.displayWidth||200}"></label><label>표시 세로<input type="number" data-${prefix}-h="${i}" value="${c.displayHeight||200}"></label><label class="mini-toggle"><input type="checkbox" data-${prefix}-enabled="${i}" ${c.enabled!==false?'checked':''}> 공개</label><div class="cat-order-controls"><button type="button" class="ghost cat-order-button" data-move-${prefix}="${i}" data-dir="-1" aria-label="위로 이동">↑</button><button type="button" class="ghost cat-order-button" data-move-${prefix}="${i}" data-dir="1" aria-label="아래로 이동">↓</button></div><button class="danger" data-del-${prefix}="${i}">삭제</button></div>`
}
function moveCategory(arr,prefix,index,dir){
  collectCats(arr,prefix);
  let next=index+dir;
  if(prefix==='cat'){
    const visible=arr.map((c,i)=>({c,i})).filter(x=>!x.c.hiddenLegacy).map(x=>x.i),pos=visible.indexOf(index);
    if(pos<0||pos+dir<0||pos+dir>=visible.length)return;
    next=visible[pos+dir]
  }
  if(next<0||next>=arr.length)return;
  [arr[index],arr[next]]=[arr[next],arr[index]];
  if(prefix==='cat')renderCats();else renderPresetCats()
}
function bindCategoryOrder(arr,prefix){
  document.querySelectorAll(`[data-move-${prefix}]`).forEach(b=>b.onclick=()=>moveCategory(arr,prefix,Number(b.getAttribute(`data-move-${prefix}`)),Number(b.dataset.dir)))
}
function updatePortfolioUploadHint(){
  const c=(S?.portfolioCategories||[]).find(x=>x.id===$('uploadCat').value),input=$('files'),hint=$('portfolioUploadHint'),classification=$('portfolioUploadBannerType');
  if(!c){input.removeAttribute('accept');if(hint)hint.textContent='';if(classification)classification.hidden=true;return}
  const formats=(c.formats||[]).map(x=>String(x).toLowerCase());
  input.accept=formats.flatMap(x=>x==='jpeg'||x==='jpg'?['.jpg','.jpeg']:['.'+x]).join(',');
  const isBanner=['top-banner','floating-banner','bottom-banner','bottom-split'].includes(c.id);
  const typeOn=S?.bannerTypeEnabled!==false;
  if(classification)classification.hidden=!isBanner||!typeOn;
  if(hint)hint.textContent='업로드 조건: '+formats.join(', ').toUpperCase()+' · 파일 용량 제한 없음 · 이미지 픽셀 크기 제한 없음'
}
function renderCats(){
  const cats=(S.portfolioCategories||[]).map((c,i)=>({c,i})).filter(x=>!x.c.hiddenLegacy);
  $('cats').innerHTML=cats.map(({c,i})=>catRow(c,i,'cat')).join('');
  $('uploadCat').innerHTML=cats.map(({c})=>`<option value="${adminEsc(c.id)}">${adminEsc(c.label)}</option>`).join('');
  $('uploadCat').onchange=updatePortfolioUploadHint;
  updatePortfolioUploadHint();
  document.querySelectorAll('[data-del-cat]').forEach(b=>b.onclick=()=>{collectCats(S.portfolioCategories||[],'cat');S.portfolioCategories.splice(+b.dataset.delCat,1);renderCats()});
  bindCategoryOrder(S.portfolioCategories||[],'cat')
}
function renderPresetCats(){
  $('presetCats').innerHTML=(S.presetCategories||[]).map((c,i)=>catRow(c,i,'preset')).join('');
  $('presetUploadCat').innerHTML=(S.presetCategories||[]).map(c=>`<option value="${adminEsc(c.id)}">${adminEsc(c.label)}</option>`).join('');
  document.querySelectorAll('[data-del-preset]').forEach(b=>b.onclick=()=>{collectCats(S.presetCategories||[],'preset');S.presetCategories.splice(+b.dataset.delPreset,1);renderPresetCats()});
  bindCategoryOrder(S.presetCategories||[],'preset');
  $('presetUploadCat').onchange=updatePresetUploadSelectors;
  updatePresetUploadSelectors()
}
function renderPresetGroups(){}
function collectPresetGroups(){}
function updatePresetUploadSelectors(){
  const file=$('presetFiles'),hint=$('presetFilesHint');
  if(file)file.multiple=false;
  if(hint)hint.textContent='프리셋은 이미지 1장을 선택해 주세요.'
}

function ensureQuoteConfig(){
  if(!S.quoteConfig||typeof S.quoteConfig!=='object')S.quoteConfig={};
  const q=S.quoteConfig;
  if(!q.designPrices||typeof q.designPrices!=='object')q.designPrices={};
  if(!q.bannerPrices||typeof q.bannerPrices!=='object')q.bannerPrices={};
  if(!q.optionPrices||typeof q.optionPrices!=='object')q.optionPrices={};
  if(!Array.isArray(q.customItems))q.customItems=[];

  (S.designTypes||[]).forEach(x=>{if(q.designPrices[x.id]==null)q.designPrices[x.id]=0});
  QUOTE_BANNERS.forEach(([id])=>{if(q.bannerPrices[id]==null)q.bannerPrices[id]=0});
  QUOTE_OPTIONS.forEach(([id])=>{if(q.optionPrices[id]==null)q.optionPrices[id]=0});

  if(!q.priceItems||typeof q.priceItems!=='object'||Array.isArray(q.priceItems))q.priceItems={};

  if(!Array.isArray(q.priceItems.design)){
    q.priceItems.design=(S.designTypes||[]).map(x=>({
      id:String(x.id),
      name:String(x.label||''),
      price:Number(q.designPrices[x.id]||0)
    }))
  }

  if(!Array.isArray(q.priceItems.banner)){
    q.priceItems.banner=QUOTE_BANNERS.map(([id,label])=>({
      id:String(id),
      name:String(label),
      price:Number(q.bannerPrices[id]||0)
    }))
  }

  if(!Array.isArray(q.priceItems.option)){
    q.priceItems.option=QUOTE_OPTIONS.map(([id,label])=>({
      id:String(id),
      name:String(label),
      price:Number(q.optionPrices[id]||0)
    }))
  }

  ['design','banner','option'].forEach(group=>{
    q.priceItems[group]=q.priceItems[group].map((x,i)=>({
      id:String(x?.id||('qg-'+group+'-'+Date.now()+'-'+i)),
      name:String(x?.name||''),
      price:Number(x?.price||0)
    }))
  });

  return q
}
function quoteGroupTitle(group){
  return {design:'신청 디자인 종류',banner:'배너 종류',option:'추가 옵션'}[group]||group
}
function quotePriceGroupRow(group,x,i){
  return '<div class="quote-price-edit-row">'+
    '<input class="quote-price-name" data-q-group-name="'+group+'" data-q-group-index="'+i+'" value="'+adminEsc(x.name||'')+'" placeholder="항목명">'+
    '<div class="quote-price-input"><input type="number" step="100" data-q-group-price="'+group+'" data-q-group-index="'+i+'" value="'+Number(x.price||0)+'"><em>원</em></div>'+
    '<button type="button" class="danger admin-compact quote-price-delete" data-del-q-group="'+group+'" data-q-group-index="'+i+'">삭제</button>'+
  '</div>'
}
function quotePriceGroup(group,items){
  return '<div class="quote-price-group">'+
    '<div class="quote-price-group-head"><h4>'+quoteGroupTitle(group)+'</h4><button type="button" class="ghost admin-compact" data-add-q-group="'+group+'">+ 항목 추가</button></div>'+
    '<div class="quote-price-group-list">'+
      (items.length?items.map((x,i)=>quotePriceGroupRow(group,x,i)).join(''):'<p class="muted quote-empty">등록된 항목이 없습니다.</p>')+
    '</div>'+
  '</div>'
}
function renderQuoteAdmin(){
  if(!$('quotePricing'))return;
  const q=ensureQuoteConfig();

  $('quotePricing').innerHTML=
    quotePriceGroup('design',q.priceItems.design)+
    quotePriceGroup('banner',q.priceItems.banner)+
    quotePriceGroup('option',q.priceItems.option);

  $('quoteCustomItems').innerHTML=q.customItems.map((x,i)=>'<div class="quote-custom-row"><input data-q-custom-name="'+i+'" value="'+adminEsc(x.name||'')+'" placeholder="항목명"><div class="quote-price-input"><input type="number" step="100" data-q-custom-price="'+i+'" value="'+Number(x.price||0)+'"><em>원</em></div><button class="danger admin-compact" data-del-q-custom="'+i+'">삭제</button></div>').join('')||'<p class="muted quote-empty">등록된 별도 추가 항목이 없습니다.</p>';

  bindQuoteConfigInputs();
  renderQuoteBuilder()
}
function bindQuoteConfigInputs(){
  document.querySelectorAll('[data-q-group-name]').forEach(e=>e.oninput=()=>{
    const q=ensureQuoteConfig(),group=e.dataset.qGroupName,i=Number(e.dataset.qGroupIndex),x=q.priceItems[group]?.[i];
    if(x){x.name=e.value;renderQuoteBuilder()}
  });

  document.querySelectorAll('[data-q-group-price]').forEach(e=>e.oninput=()=>{
    const q=ensureQuoteConfig(),group=e.dataset.qGroupPrice,i=Number(e.dataset.qGroupIndex),x=q.priceItems[group]?.[i];
    if(x){x.price=Number(e.value||0);renderQuoteBuilder()}
  });

  document.querySelectorAll('[data-add-q-group]').forEach(b=>b.onclick=()=>{
    const q=ensureQuoteConfig(),group=b.dataset.addQGroup;
    if(!Array.isArray(q.priceItems[group]))q.priceItems[group]=[];
    q.priceItems[group].push({
      id:'qg-'+group+'-'+Date.now(),
      name:'새 항목',
      price:0
    });
    renderQuoteAdmin()
  });

  document.querySelectorAll('[data-del-q-group]').forEach(b=>b.onclick=()=>{
    const q=ensureQuoteConfig(),group=b.dataset.delQGroup,i=Number(b.dataset.qGroupIndex),x=q.priceItems[group]?.[i];
    if(!x)return;
    delete quoteState[group+':'+x.id];
    q.priceItems[group].splice(i,1);
    renderQuoteAdmin()
  });

  document.querySelectorAll('[data-q-custom-name]').forEach(e=>e.oninput=()=>{
    const x=ensureQuoteConfig().customItems[+e.dataset.qCustomName];
    if(x){x.name=e.value;renderQuoteBuilder()}
  });

  document.querySelectorAll('[data-q-custom-price]').forEach(e=>e.oninput=()=>{
    const x=ensureQuoteConfig().customItems[+e.dataset.qCustomPrice];
    if(x){x.price=Number(e.value||0);renderQuoteBuilder()}
  });

  document.querySelectorAll('[data-del-q-custom]').forEach(b=>b.onclick=()=>{
    const q=ensureQuoteConfig(),x=q.customItems[+b.dataset.delQCustom];
    if(x)delete quoteState['custom:'+x.id];
    q.customItems.splice(+b.dataset.delQCustom,1);
    renderQuoteAdmin()
  })
}
function quoteItems(){
  const q=ensureQuoteConfig(),out=[];
  ['design','banner','option'].forEach(group=>{
    (q.priceItems[group]||[]).forEach(x=>out.push({
      key:group+':'+x.id,
      label:x.name||'이름 없는 항목',
      price:Number(x.price||0)
    }))
  });
  q.customItems.forEach(x=>out.push({
    key:'custom:'+x.id,
    label:x.name||'이름 없는 항목',
    price:Number(x.price||0)
  }));
  return out
}
function renderQuoteBuilder(){
  if(!$('quoteBuilder'))return;
  const arr=quoteItems();
  $('quoteBuilder').innerHTML=arr.map(x=>{const n=Math.max(0,Number(quoteState[x.key]||0));return `<div class="quote-select-row ${n?'is-selected':''}"><div class="quote-select-name"><strong>${x.label}</strong><span>${x.price.toLocaleString('ko-KR')}원</span></div><div class="qty-control"><button type="button" data-qty-key="${x.key}" data-delta="-1">−</button><b>${n}</b><button type="button" data-qty-key="${x.key}" data-delta="1">+</button></div></div>`}).join('');
  document.querySelectorAll('[data-qty-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.qtyKey,d=Number(b.dataset.delta||0);quoteState[k]=Math.max(0,Number(quoteState[k]||0)+d);renderQuoteBuilder()});
  renderQuotePreview()
}
function renderQuotePreview(){
  if(!$('quotePreview'))return;
  const selected=quoteItems().map(x=>({...x,qty:Number(quoteState[x.key]||0)})).filter(x=>x.qty>0);
  const lines=['안녕하세요 문의주셔서 감사드립니당!',''];
  let total=0;
  selected.forEach(x=>{total+=x.price*x.qty;lines.push(`${x.label} (${x.price})${x.qty>1?` *${x.qty}`:''}`)});
  if(selected.length)lines.push('');
  lines.push(`총 금액 ${total.toLocaleString('ko-KR')}원입니다!`,'','작업 일정 확인 후 괜찮으시다면 위 내용대로 주문 넣어주시면 됩니당!');
  $('quotePreview').value=lines.join('\n')
}
async function copyQuote(){
  const btn=$('copyQuote'),original=btn.textContent;
  try{await navigator.clipboard.writeText($('quotePreview').value);btn.textContent='✓ 복사 완료';btn.classList.add('is-copied');setTimeout(()=>{btn.textContent=original;btn.classList.remove('is-copied')},1600)}
  catch{alert('견적 복사에 실패했습니다.')}
}

function collect(){document.querySelectorAll('[data-key]').forEach(e=>S[e.dataset.key]=e.value);collectNotices();(S.designTypes||[]).forEach((x,i)=>{const label=document.querySelector(`[data-type-label="${i}"]`),enabled=document.querySelector(`[data-type-enabled="${i}"]`),frame=document.querySelector(`[data-type-frame="${i}"]`),sign=document.querySelector(`[data-type-sign="${i}"]`),banner=document.querySelector(`[data-type-banner="${i}"]`),bannerText=document.querySelector(`[data-type-banner-text="${i}"]`);if(label)x.label=label.value;if(enabled)x.enabled=enabled.checked;if(frame)x.showFrameRetention=frame.checked;if(sign)x.showSignatureFields=sign.checked;if(banner)x.showBannerFields=banner.checked;if(bannerText)x.showBannerTextField=bannerText.checked})}
function collectCats(arr,prefix){arr.forEach((c,i)=>{const label=document.querySelector(`[data-${prefix}-label="${i}"]`),id=document.querySelector(`[data-${prefix}-id="${i}"]`),w=document.querySelector(`[data-${prefix}-w="${i}"]`),h=document.querySelector(`[data-${prefix}-h="${i}"]`),enabled=document.querySelector(`[data-${prefix}-enabled="${i}"]`),pcCols=document.querySelector(`[data-${prefix}-pc-cols="${i}"]`),pcPage=document.querySelector(`[data-${prefix}-pc-page="${i}"]`),moCols=document.querySelector(`[data-${prefix}-mo-cols="${i}"]`),moPage=document.querySelector(`[data-${prefix}-mo-page="${i}"]`);if(label)c.label=label.value;if(id)c.id=id.value;if(w)c.displayWidth=Number(w.value||c.displayWidth||200);if(h)c.displayHeight=Number(h.value||c.displayHeight||200);if(enabled)c.enabled=enabled.checked;if(pcCols)c.pcColumns=Math.max(1,Number(pcCols.value||4));if(pcPage)c.pcPerPage=Math.max(1,Number(pcPage.value||16));if(moCols)c.mobileColumns=Math.max(1,Number(moCols.value||2));if(moPage)c.mobilePerPage=Math.max(1,Number(moPage.value||10))})}
async function saveSettings(){
  collect();collectWorkStatusAdmin();collectScheduleAdmin();collectBackgroundGuide();collectBannerTypeGuideAdmin();collectCats(S.portfolioCategories||[],'cat');
  S.bannerTypeEnabled=$('bannerTypeEnabled')?$('bannerTypeEnabled').checked:(S.bannerTypeEnabled!==false);
  S.presetEnabled=$('presetEnabled').checked;
  S.presetTitle=$('presetTitle').value;
  S.presetNotice=$('presetNotice').value;
   
  if($('showcaseInitialDesktop'))S.showcaseInitialDesktop=Math.min(5,Math.max(1,Number($('showcaseInitialDesktop').value||5)));
  if($('showcaseInitialMobile'))S.showcaseInitialMobile=Math.min(4,Math.max(1,Number($('showcaseInitialMobile').value||4)));
  if($('showcasePresetEnabled'))S.showcasePresetEnabled=$('showcasePresetEnabled').checked;
  
  if($('showcasePresetExpandEnabled'))S.showcasePresetExpandEnabled=$('showcasePresetExpandEnabled').checked;
  
  S.authorEnabled=$('authorEnabled').checked;
  S.authorName=$('authorName')?$('authorName').value.trim():(S.authorName||'CHILGONG DESIGN');
  S.authorText=$('authorText').value;
  S.authorFontSize=Number($('authorFontSize').value||15);
  S.eventsEnabled=$('eventsEnabled').checked;
  S.eventsKicker=$('eventsKicker').value;
  S.eventsTitle=$('eventsTitle').value;
  S.eventsText=$('eventsText').value;
  S.eventsNote=$('eventsNote').value;
  collectEventItems();
  delete S.eventsBenefitLabel;delete S.eventsOldPrice;delete S.eventsNewPrice;
  S.eventsTitleFontSize=Number($('eventsTitleFontSize').value||22);
  S.eventsFontSize=Number($('eventsFontSize').value||15);
  collectCats(S.presetCategories||[],'preset');collectPresetSeasonCats();collectPresetGroups();collectFixedAdmin();
  const snapshot=JSON.parse(JSON.stringify(S));
  try{
    $('saveStatus').textContent='저장 중…';
    const saved=await queueSettingsMutation(latest=>Object.assign(latest,snapshot));
    S=saved;
    try{localStorage.removeItem('artmug-nav-summary-v11')}catch{}
    $('saveStatus').textContent='저장되었습니다.';
    showToast('저장되었습니다.')
  }catch(e){
    $('saveStatus').textContent=e.message;
    alert('저장에 실패했습니다.\n'+e.message)
  }
}
function applyAdminOrder(list,order){
  if(!Array.isArray(order)||!order.length)return [...list];
  const pos=new Map(order.map((file,i)=>[file,i]));
  return [...list].sort((a,b)=>{
    const ai=pos.has(a.file)?pos.get(a.file):Number.MAX_SAFE_INTEGER;
    const bi=pos.has(b.file)?pos.get(b.file):Number.MAX_SAFE_INTEGER;
    return ai-bi
  })
}
function capturePresetEditorValues(){}
async function saveMediaOrder(kind){
  const key=kind==='preset'?'presetOrder':'portfolioOrder',list=kind==='preset'?presetItems:items,order=list.map(x=>x.file);
  S[key]=order;
  const saved=await queueSettingsMutation(latest=>{latest[key]=order});
  S[key]=saved[key]||order;
  showToast('순서가 저장되었습니다.')
}
async function moveMediaItem(kind,index,dir){
  const list=kind==='preset'?presetItems:items,x=list[index];if(!x)return;
  const same=list.map((v,i)=>({v,i})).filter(o=>kind==='portfolio'?logicalPortfolioCategory(o.v.category)===logicalPortfolioCategory(x.category):o.v.category===x.category),pos=same.findIndex(o=>o.i===index),next=pos+dir;
  if(next<0||next>=same.length)return;
  const target=same[next].i;
  [list[index],list[target]]=[list[target],list[index]];
  if(kind==='preset')renderPresetItems();else renderItems();
  try{await saveMediaOrder(kind)}catch(e){alert('순서 저장에 실패했습니다.\n'+e.message)}
}
async function savePortfolioTag(i,type,checked){
  const x=items[i];if(!x)return;
  const value=checked?type:'';
  const saved=await queueSettingsMutation(latest=>{
    if(!latest.portfolioMeta||typeof latest.portfolioMeta!=='object'||Array.isArray(latest.portfolioMeta))latest.portfolioMeta={};
    const prev=latest.portfolioMeta[x.file]||{};
    latest.portfolioMeta[x.file]={...prev,profileType:value}
  });
  S.portfolioMeta=saved.portfolioMeta||S.portfolioMeta||{};
  renderItems();
  showToast(value?`움짤프사 ${value} 태그를 켰습니다.`:'태그를 껐습니다.')
}
async function loadPresetItemsOnly(){
  const q=await api('/api/admin/presets').catch(()=>({items:[]}));
  const meta=S?.presetMeta||{},pairedChildren=new Set(Object.values(meta).map(m=>m&&m.secondaryFile).filter(Boolean));
  const fixedBase=[...(q.items||[])]
    .filter(x=>!pairedChildren.has(x.file)&&!(meta[x.file]||{}).pairChild&&presetMetaFor(x).showcaseKind==='fixed')
    .sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  fixedItems=applyAdminOrder(fixedBase,S?.presetOrder);
  const presetBase=[...(q.items||[])]
    .filter(x=>!pairedChildren.has(x.file)&&!(meta[x.file]||{}).pairChild&&presetMetaFor(x).showcaseKind!=='fixed')
    .sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  presetItems=applyAdminOrder(presetBase,S?.presetOrder);
  renderPresetItems();renderFixedItems()
}
async function loadItems(){
  try{
    const [d]=await Promise.all([
      api('/api/admin/portfolio'),
      loadPresetItemsOnly()
    ]);
    items=applyAdminOrder((d.items||[]).filter(x=>x.category!=='type-guide-assets'),S?.portfolioOrder);
    renderItems();renderBannerTypeGuideAdmin()
  }catch(e){$('uploadStatus').textContent=e.message}
}
function presetLocationText(x){
  return (S.presetCategories||[]).find(c=>c.id===x.category)?.label||x.category||''
}
async function savePresetItem(i){
  const x=presetItems[i];if(!x)return;
  const meta=presetMetaFor(x),name=document.querySelector(`[data-preset-name="${i}"]`);
  const patch={name:name?name.value.trim():meta.name};

  const saved=await queueSettingsMutation(latest=>{
    if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
    const prev=latest.presetMeta[x.file]||{};
    latest.presetMeta[x.file]={...prev,...patch}
  });
  S.presetMeta=saved.presetMeta||S.presetMeta||{};
  showToast('프리셋 이름이 저장되었습니다.');
  renderPresetItems()
}
async function savePresetBadgeToggle(i,key,value){
  const x=presetItems[i];if(!x)return;
  const saved=await queueSettingsMutation(latest=>{
    if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
    const prev=latest.presetMeta[x.file]||{};
    latest.presetMeta[x.file]={...prev,[key]:value}
  });
  S.presetMeta=saved.presetMeta||S.presetMeta||{};
  renderPresetItems();
  const label=key==='isNew'?'NEW':'예약중';
  showToast(value?label+' 표시를 켰습니다.':label+' 표시를 껐습니다.')
}
async function savePresetToggle(i,key,value){
  const x=presetItems[i];if(!x)return;
  const saved=await queueSettingsMutation(latest=>{
    if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
    const prev=latest.presetMeta[x.file]||{};
    latest.presetMeta[x.file]={...prev,[key]:value}
  });
  S.presetMeta=saved.presetMeta||S.presetMeta||{};
  const message=key==='enabled'
    ? (value?'공개로 변경되었습니다.':'비공개로 변경되었습니다.')
    : key==='isNew'
      ? (value?'NEW 표시를 켰습니다.':'NEW 표시를 껐습니다.')
      : (value?'수정가능 표시를 켰습니다.':'수정가능 표시를 껐습니다.');
  showToast(message)
}
function chooseReplacementFile(){
  return new Promise(resolve=>{
    const input=document.createElement('input');
    input.type='file';
    input.accept='.gif,.png,.jpg,.jpeg,.webp,image/gif,image/png,image/jpeg,image/webp';
    input.onchange=()=>resolve(input.files?.[0]||null);
    input.click()
  })
}
function replaceOrderPath(order,oldPath,newPath){
  const arr=Array.isArray(order)?[...order]:[];
  const i=arr.indexOf(oldPath);
  if(i>=0)arr[i]=newPath;else arr.push(newPath);
  return arr
}
async function replaceMediaFile(kind,index){
  const list=kind==='fixed'?fixedItems:kind==='preset'?presetItems:items,x=list[index];if(!x)return;
  const file=await chooseReplacementFile();if(!file)return;
  const isPreset=kind==='preset'||kind==='fixed',endpoint=isPreset?'/api/admin/preset-upload':'/api/admin/upload',deleteEndpoint=isPreset?'/api/admin/preset-delete':'/api/admin/delete';
  const targetCategory=!isPreset&&isProfilePortfolioCategory(x.category)?'profile':x.category;
  const fd=new FormData();fd.append('category',targetCategory);fd.append('file',file);
  let newPath='',metadataMoved=false;
  try{
    showToast('새 파일을 업로드하고 있습니다.');
    const r=await fetch(API+endpoint,{method:'POST',credentials:'include',body:fd}),d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
    newPath=String(d.path||'');if(!newPath)throw new Error('새 파일 경로를 확인하지 못했습니다.');

    const presetMeta=isPreset?{
      ...presetMetaFor(x),
      name:(document.querySelector(`[data-${kind==='fixed'?'fixed':'preset'}-name="${index}"]`)?.value||presetMetaFor(x).name).trim()
    }:null;
    const saved=await queueSettingsMutation(latest=>{
      if(isPreset){
        if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
        latest.presetMeta[newPath]={...(latest.presetMeta[x.file]||{}),...presetMeta};
        const secondary=latest.presetMeta[newPath].secondaryFile;
        if(secondary&&latest.presetMeta[secondary])latest.presetMeta[secondary]={...latest.presetMeta[secondary],pairParent:newPath};
        delete latest.presetMeta[x.file];
        latest.presetOrder=replaceOrderPath(latest.presetOrder,x.file,newPath)
      }else{
        if(!latest.portfolioMeta||typeof latest.portfolioMeta!=='object'||Array.isArray(latest.portfolioMeta))latest.portfolioMeta={};
        latest.portfolioMeta[newPath]={...(latest.portfolioMeta[x.file]||{})};
        delete latest.portfolioMeta[x.file];
        latest.portfolioOrder=replaceOrderPath(latest.portfolioOrder,x.file,newPath)
      }
    });
    metadataMoved=true;
    if(isPreset){S.presetMeta=saved.presetMeta||{};S.presetOrder=saved.presetOrder||[]}
    else{S.portfolioMeta=saved.portfolioMeta||{};S.portfolioOrder=saved.portfolioOrder||[]}

    try{
      await api(deleteEndpoint,{method:'POST',body:JSON.stringify({file:x.file})})
    }catch(deleteError){
      await loadItems();
      alert('새 파일은 정상 반영됐지만 기존 파일 삭제에 실패했습니다.\n목록 새로고침 후 중복 항목이 보이면 기존 파일만 삭제해주세요.\n'+deleteError.message);
      return
    }

    await loadItems();
    showToast('파일이 변경되었습니다.')
  }catch(e){
    if(newPath&&!metadataMoved)await api(deleteEndpoint,{method:'POST',body:JSON.stringify({file:newPath})}).catch(()=>{});
    alert('파일 변경에 실패했습니다.\n'+e.message)
  }
}
function renderPresetItems(){
  const totalPages=Math.max(1,Math.ceil(presetItems.length/ADMIN_PAGE_SIZE));
  presetAdminPage=Math.min(Math.max(1,presetAdminPage),totalPages);
  const start=(presetAdminPage-1)*ADMIN_PAGE_SIZE;
  const pageItems=presetItems.slice(start,start+ADMIN_PAGE_SIZE).map((x,local)=>({x,i:start+local}));
  $('presetItems').innerHTML=pageItems.map(({x,i})=>{
    const meta=presetMetaFor(x),same=presetItems.filter(v=>v.category===x.category),samePos=same.findIndex(v=>v.file===x.file);
    return `<div class="preset-admin-item preset-admin-item-v2">
      <div class="preset-admin-preview"><img src="${API}/media/${x.file.split('/').map(encodeURIComponent).join('/')}" loading="lazy" decoding="async" draggable="false"></div>
      <div class="preset-admin-fields">
        <div class="muted preset-location">${adminEsc(presetLocationText(x))}</div>
        <label class="preset-name-field">상품 이름<input data-preset-name="${i}" value="${adminEsc(meta.name)}" placeholder="예: 라벤더 체크"></label>
        <div class="preset-admin-toggle-grid">
          <label class="mini-toggle"><input type="checkbox" data-preset-enabled="${i}" ${meta.enabled?'checked':''}> 공개</label>
          <label class="mini-toggle"><input type="checkbox" data-preset-new="${i}" ${meta.isNew?'checked':''}> NEW</label>
          <label class="mini-toggle"><input type="checkbox" data-preset-reserved="${i}" ${meta.isReserved?'checked':''}> 예약중</label>
          <label class="mini-toggle"><input type="checkbox" data-preset-reservable="${i}" ${meta.isReservable?'checked':''}> 예약가능</label>
          <label class="mini-toggle"><input type="checkbox" data-preset-color-change="${i}" ${meta.colorChangeAvailable?'checked':''}> 수정가능</label>
          <label class="mini-toggle"><input type="checkbox" data-preset-no-edit="${i}" ${meta.isNoEdit?'checked':''}> 수정불가</label>
        </div>
      </div>
      <div class="preset-admin-actions">
        <div class="media-order-controls">
          <button type="button" class="ghost cat-order-button" data-move-preset-item="${i}" data-dir="-1" ${samePos<=0?'disabled':''} title="위로 이동">↑</button>
          <button type="button" class="ghost cat-order-button" data-move-preset-item="${i}" data-dir="1" ${samePos>=same.length-1?'disabled':''} title="아래로 이동">↓</button>
        </div>
        <button class="ghost admin-compact" data-replace-preset="${i}">이미지 수정</button>
        <button class="ghost admin-compact" data-save-preset="${i}">이름 저장</button>
        <button class="danger admin-compact" data-delete-preset="${encodeURIComponent(x.file)}">삭제</button>
      </div>
    </div>`
  }).join('')||'<p class="muted">등록된 프리셋이 없습니다.</p>';
  bindAdminPagination('presetItemsPagination','preset',presetAdminPage,totalPages);

  document.querySelectorAll('[data-move-preset-item]').forEach(b=>b.onclick=()=>moveMediaItem('preset',+b.dataset.movePresetItem,Number(b.dataset.dir)));
  document.querySelectorAll('[data-replace-preset]').forEach(b=>b.onclick=()=>replaceMediaFile('preset',+b.dataset.replacePreset));
  document.querySelectorAll('[data-save-preset]').forEach(b=>b.onclick=()=>savePresetItem(+b.dataset.savePreset).catch(e=>alert(e.message)));
  document.querySelectorAll('[data-preset-enabled]').forEach(el=>el.onchange=()=>savePresetMetaField(+el.dataset.presetEnabled,'enabled',el.checked));
  document.querySelectorAll('[data-preset-new]').forEach(el=>el.onchange=()=>savePresetBadgeToggle(+el.dataset.presetNew,'isNew',el.checked).catch(e=>{el.checked=!el.checked;alert('NEW 표시 저장에 실패했습니다.\n'+e.message)}));
  document.querySelectorAll('[data-preset-reserved]').forEach(el=>el.onchange=()=>savePresetBadgeToggle(+el.dataset.presetReserved,'isReserved',el.checked).catch(e=>{el.checked=!el.checked;alert('예약 표시 저장에 실패했습니다.\n'+e.message)}));
  document.querySelectorAll('[data-preset-reservable]').forEach(el=>el.onchange=()=>savePresetMetaField(+el.dataset.presetReservable,'isReservable',el.checked));
  document.querySelectorAll('[data-preset-color-change]').forEach(el=>el.onchange=()=>savePresetEditPolicy(+el.dataset.presetColorChange,'colorChangeAvailable',el.checked));
  document.querySelectorAll('[data-preset-no-edit]').forEach(el=>el.onchange=()=>savePresetEditPolicy(+el.dataset.presetNoEdit,'isNoEdit',el.checked));
  document.querySelectorAll('[data-delete-preset]').forEach(b=>b.onclick=async()=>{
    if(!confirm('이 프리셋을 삭제할까요?'))return;
    const file=decodeURIComponent(b.dataset.deletePreset);
    await api('/api/admin/preset-delete',{method:'POST',body:JSON.stringify({file})});
    const saved=await queueSettingsMutation(latest=>{
      if(latest.presetMeta&&typeof latest.presetMeta==='object')delete latest.presetMeta[file];
      latest.presetOrder=(latest.presetOrder||[]).filter(x=>x!==file);
      delete latest.presetColorMeta
    }).catch(()=>null);
    if(saved){S.presetMeta=saved.presetMeta||{};S.presetOrder=saved.presetOrder||[]}
    loadItems()
  })
}
async function savePresetEditPolicy(i,key,value){
  const x=presetItems[i];if(!x)return;
  const other=key==='isNoEdit'?'colorChangeAvailable':'isNoEdit';
  const saved=await queueSettingsMutation(latest=>{
    if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
    const prev=latest.presetMeta[x.file]||{};
    latest.presetMeta[x.file]={...prev,[key]:value,...(value?{[other]:false}:{})}
  });
  S.presetMeta=saved.presetMeta||{};
  renderPresetItems();
  showToast('프리셋 수정 정책이 저장되었습니다.')
}
async function savePresetMetaField(i,key,value,exclusiveStatus){
  const x=presetItems[i];if(!x)return;
  const saved=await queueSettingsMutation(latest=>{
    if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
    const prev=latest.presetMeta[x.file]||{};
    const extra=exclusiveStatus&&value?{isNew:false,isReserved:false}:{};
    latest.presetMeta[x.file]={...prev,[key]:value,...extra}
  });
  S.presetMeta=saved.presetMeta||{};
  renderPresetItems();
  showToast('프리셋 설정이 저장되었습니다.')
}

function renderItems(){
  const typeOn=S?.bannerTypeEnabled!==false;
  const totalPages=Math.max(1,Math.ceil(items.length/ADMIN_PAGE_SIZE));
  portfolioAdminPage=Math.min(Math.max(1,portfolioAdminPage),totalPages);
  const start=(portfolioAdminPage-1)*ADMIN_PAGE_SIZE;
  const pageItems=items.slice(start,start+ADMIN_PAGE_SIZE).map((x,local)=>({x,i:start+local}));
  $('items').innerHTML=pageItems.map(({x,i})=>{
    const logical=logicalPortfolioCategory(x.category),same=items.filter(v=>logicalPortfolioCategory(v.category)===logical),samePos=same.findIndex(v=>v.file===x.file);
    const isProfile=logical==='profile',isBanner=['top-banner','floating-banner','bottom-banner','bottom-split'].includes(x.category),meta=portfolioMetaFor(x),cat=(S.portfolioCategories||[]).find(c=>c.id===x.category);
    return `<div class="item portfolio-admin-item">
      <img src="${API}/media/${x.file.split('/').map(encodeURIComponent).join('/')}" loading="lazy" draggable="false">
      <div class="portfolio-item-info">
        <strong title="${adminEsc(x.originalName)}">${adminEsc(x.originalName)}</strong>
        <div class="muted portfolio-item-category">${adminEsc(cat?.label||(isProfile?'움짤프사':x.category))}</div>
        <div class="portfolio-admin-meta">
          <label class="mini-toggle"><input type="checkbox" data-portfolio-enabled="${i}" ${meta.enabled?'checked':''}> 공개</label>
          ${isBanner&&typeOn?'<label class="portfolio-classification-field">TYPE<select data-portfolio-banner-type="'+i+'"><option value="A" '+(meta.bannerType==='A'?'selected':'')+'>TYPE A</option><option value="B" '+(meta.bannerType!=='A'?'selected':'')+'>TYPE B</option></select></label>':''}
        </div>
      </div>
      <div class="item-actions">
        <div class="media-order-controls"><button type="button" class="ghost cat-order-button" data-move-portfolio-item="${i}" data-dir="-1" ${samePos<=0?'disabled':''}>↑</button><button type="button" class="ghost cat-order-button" data-move-portfolio-item="${i}" data-dir="1" ${samePos>=same.length-1?'disabled':''}>↓</button></div>
        <button class="ghost admin-compact" data-replace-portfolio="${i}">파일 수정</button>
        <button class="danger admin-compact" data-delete="${encodeURIComponent(x.file)}">삭제</button>
      </div>
    </div>`
  }).join('');
  bindAdminPagination('itemsPagination','portfolio',portfolioAdminPage,totalPages);
  document.querySelectorAll('[data-move-portfolio-item]').forEach(b=>b.onclick=()=>moveMediaItem('portfolio',+b.dataset.movePortfolioItem,Number(b.dataset.dir)));
  document.querySelectorAll('[data-replace-portfolio]').forEach(b=>b.onclick=()=>replaceMediaFile('portfolio',+b.dataset.replacePortfolio));
  document.querySelectorAll('[data-portfolio-enabled]').forEach(el=>el.onchange=()=>savePortfolioMeta(+el.dataset.portfolioEnabled,{enabled:el.checked}));
  document.querySelectorAll('[data-portfolio-banner-type]').forEach(el=>el.onchange=()=>savePortfolioMeta(+el.dataset.portfolioBannerType,{bannerType:el.value}));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('이 작업물을 삭제할까요?'))return;const file=decodeURIComponent(b.dataset.delete);S.portfolioOrder=(S.portfolioOrder||[]).filter(x=>x!==file);await api('/api/admin/delete',{method:'POST',body:JSON.stringify({file})});await queueSettingsMutation(latest=>{latest.portfolioOrder=(latest.portfolioOrder||[]).filter(x=>x!==file);if(latest.portfolioMeta&&typeof latest.portfolioMeta==='object')delete latest.portfolioMeta[file]}).catch(()=>{});loadItems()})
}
async function savePortfolioMeta(i,patch){
  const x=items[i];if(!x)return;
  const saved=await queueSettingsMutation(latest=>{
    if(!latest.portfolioMeta||typeof latest.portfolioMeta!=='object'||Array.isArray(latest.portfolioMeta))latest.portfolioMeta={};
    latest.portfolioMeta[x.file]={...(latest.portfolioMeta[x.file]||{}),...patch}
  });
  S.portfolioMeta=saved.portfolioMeta||{};
  showToast('작업물 설정이 저장되었습니다.')
}
async function uploadFiles(kind){
  const isPreset=kind==='preset',fileInput=isPreset?$('presetFiles'):$('files'),cat=isPreset?$('presetUploadCat').value:$('uploadCat').value,status=$(isPreset?'presetUploadStatus':'uploadStatus'),files=[...fileInput.files];
  if(!files.length)return;
  try{
    if(isPreset){
      const name=String($('presetUploadName')?.value||'').trim();
      if(!name)throw new Error('프리셋 이름을 입력해주세요.');
      if(files.length>1)throw new Error('프리셋은 이미지 1장만 선택해 주세요.');
      const isNoEdit=!!$('presetUploadNoEdit')?.checked;
      const isReservable=!!$('presetUploadReservable')?.checked;
      const file=files[0],presetCat=(S.presetCategories||[]).find(x=>x.id===cat)||{};
      validatePresetUploadFile(file);await validateCategoryImageSize(file,presetCat);
      status.textContent='프리셋 이미지 업로드 중…';
      const d=await uploadMediaWithRetry('/api/admin/preset-upload',cat,file,status);
      const path=String(d.path||'');if(!path)throw new Error('업로드된 파일 경로를 확인하지 못했습니다.');
      try{
        const saved=await queueSettingsMutation(latest=>{
          if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
          latest.presetMeta[path]={...(latest.presetMeta[path]||{}),name,enabled:true,isNew:false,isReserved:false,isReservable,isNoEdit,colorChangeAvailable:false,showcaseKind:'preset',featured:false};
          const order=Array.isArray(latest.presetOrder)?latest.presetOrder.filter(v=>v!==path):[];
          order.push(path);latest.presetOrder=order;
          delete latest.presetColorMeta
        });
        S.presetMeta=saved.presetMeta||{};S.presetOrder=saved.presetOrder||S.presetOrder||[];
        $('presetUploadName').value='';if($('presetUploadNoEdit'))$('presetUploadNoEdit').checked=false;if($('presetUploadReservable'))$('presetUploadReservable').checked=false;fileInput.value='';status.textContent='프리셋이 등록되었습니다.';
        await loadPresetItemsOnly();showToast('프리셋이 등록되었습니다.');return
      }catch(e){
        await api('/api/admin/preset-delete',{method:'POST',body:JSON.stringify({file:path})}).catch(()=>{});
        throw e
      }
    }

    const uploadedPaths=[];
    const portfolioCat=(S.portfolioCategories||[]).find(x=>x.id===cat)||{};
    for(let i=0;i<files.length;i++){
      status.textContent=`${i+1}/${files.length} 업로드 중…`;
      await validateCategoryImageSize(files[i],portfolioCat);
      const d=await uploadMediaWithRetry('/api/admin/upload',cat,files[i],status);
      if(d.path)uploadedPaths.push(String(d.path))
    }
    if(uploadedPaths.length){
      const selectedType=$('portfolioUploadBannerType')?.value||'B',isBannerUpload=['top-banner','floating-banner','bottom-banner','bottom-split'].includes(cat);
      const classificationPatch=isBannerUpload?{bannerType:['A','B'].includes(selectedType)?selectedType:'B'}:{};
      const saved=await queueSettingsMutation(latest=>{
        const current=Array.isArray(latest.portfolioOrder)?latest.portfolioOrder:[],fresh=[...uploadedPaths].reverse(),newSet=new Set(fresh);
        latest.portfolioOrder=[...fresh,...current.filter(v=>!newSet.has(v))];
        if(!latest.portfolioMeta||typeof latest.portfolioMeta!=='object'||Array.isArray(latest.portfolioMeta))latest.portfolioMeta={};
        uploadedPaths.forEach(path=>{latest.portfolioMeta[path]={...(latest.portfolioMeta[path]||{}),enabled:true,...classificationPatch}})
      });
      S.portfolioOrder=saved.portfolioOrder||S.portfolioOrder||[];
      S.portfolioMeta=saved.portfolioMeta||S.portfolioMeta||{}
    }
    status.textContent='업로드가 완료되었습니다.';fileInput.value='';await loadItems();showToast('업로드되었습니다.')
  }catch(e){status.textContent=e.message;alert('업로드에 실패했습니다.\n'+e.message)}
}

/* Seasonal fixed templates share the existing secure preset upload endpoint but have
   independent admin controls, categories, metadata and public visibility. */
function defaultFixedCategories(){
 return [{id:'profile',label:'움짤프사',enabled:true},{id:'fixed-four-cut',label:'인생네컷',enabled:true}]
}
function ensureFixedCategories(){
 if(!Array.isArray(S.fixedCategories))S.fixedCategories=defaultFixedCategories();
 return S.fixedCategories
}
function fixedCategoryKind(c){
 const id=String(c?.id||''),label=String(c?.label||'').replace(/\s/g,'');
 if(/^profile(?:-|$)/.test(id)||label.includes('움짤프사'))return'profile';
 if(id==='top-banner'||label.includes('상단배너'))return'top-banner';
 if(id==='floating-banner'||label.includes('플로팅'))return'floating-banner';
 if(id==='bottom-banner'||label.includes('하단배너일반'))return'bottom-banner';
 if(id==='bottom-split'||label.includes('하단배너분할'))return'bottom-split';
 if(/four-cut|4cut/.test(id)||label.includes('인생네컷'))return'four-cut';
 return id
}
function portfolioCategoryForFixedAdmin(c){
 const list=Array.isArray(S.portfolioCategories)?S.portfolioCategories:[],kind=fixedCategoryKind(c);
 return list.find(x=>x.id===c.id)||list.find(x=>fixedCategoryKind(x)===kind)||null
}
function fixedInheritedColumns(c){
 const p=portfolioCategoryForFixedAdmin(c);
 return {pc:Math.max(1,Number(p?.pcColumns||4)),mobile:Math.max(1,Number(p?.mobileColumns||2))}
}
function syncFixedUploadCategories(target){
 const cats=Array.isArray(target.fixedCategories)?target.fixedCategories:[];
 if(!Array.isArray(target.presetCategories))target.presetCategories=[];
 cats.forEach(c=>{
  if(!c?.id)return;
  if(!target.presetCategories.some(p=>p.id===c.id)){
   target.presetCategories.push({id:c.id,label:c.label,enabled:false,displayWidth:200,displayHeight:200,strictSize:false,formats:['gif','png','jpeg','webp']})
  }
 })
}
function collectFixedAdmin(){
 if(!$('fixedEnabled'))return;
 S.fixedEnabled=$('fixedEnabled').checked;
 const title=$('fixedTitle'),notice=$('fixedNotice');
 if(title)S.fixedTitle=title.value;
 if(notice)S.fixedNotice=notice.value;
 ensureFixedCategories().forEach((c,i)=>{
  const label=document.querySelector('[data-fixed-cat-name="'+i+'"]');
  const enabled=document.querySelector('[data-fixed-cat-enabled="'+i+'"]');
  if(label)c.label=label.value.trim()||c.label;
  if(enabled)c.enabled=enabled.checked
 });
 syncFixedUploadCategories(S)
}
function renderFixedCats(){
 const cats=ensureFixedCategories();
 const root=$('fixedCats');if(!root)return;
 root.innerHTML=cats.map((c,i)=>{
  const inherited=fixedInheritedColumns(c);
  return '<div class="cat-row seasonal-fixed-cat-row">'+
   '<label>카테고리 이름<input data-fixed-cat-name="'+i+'" value="'+adminEsc(c.label)+'"></label>'+
   '<span class="muted">ID: '+adminEsc(c.id)+'</span>'+
   '<span class="muted">포트폴리오 자동 · PC '+inherited.pc+'개 / 모바일 '+inherited.mobile+'개</span>'+
   '<label class="mini-toggle"><input type="checkbox" data-fixed-cat-enabled="'+i+'" '+(c.enabled!==false?'checked':'')+'> 공개</label>'+
   '<button type="button" class="ghost cat-order-button" data-fixed-cat-move="'+i+'" data-dir="-1" '+(i===0?'disabled':'')+'>↑</button>'+
   '<button type="button" class="ghost cat-order-button" data-fixed-cat-move="'+i+'" data-dir="1" '+(i===cats.length-1?'disabled':'')+'>↓</button>'+
   '<button type="button" class="danger admin-compact" data-fixed-cat-delete="'+i+'">삭제</button></div>'
 }).join('');
 root.querySelectorAll('[data-fixed-cat-move]').forEach(b=>b.onclick=()=>{
  collectFixedAdmin();const i=+b.dataset.fixedCatMove,j=i+Number(b.dataset.dir);if(j<0||j>=cats.length)return;
  [cats[i],cats[j]]=[cats[j],cats[i]];renderFixedCats()
 });
 root.querySelectorAll('[data-fixed-cat-delete]').forEach(b=>b.onclick=()=>{
  collectFixedAdmin();const i=+b.dataset.fixedCatDelete;
  if(fixedItems.some(x=>x.category===cats[i]?.id)){alert('이 카테고리에 작품이 있습니다. 작품을 옮기거나 삭제한 뒤 카테고리를 삭제해 주세요.');return}
  cats.splice(i,1);renderFixedCats()
 });
 renderFixedUploadCategories()
}
function renderFixedUploadCategories(){
 const el=$('fixedUploadCat');if(!el)return;
 const old=el.value;
 el.innerHTML=ensureFixedCategories().filter(c=>c.enabled!==false).map(c=>'<option value="'+adminEsc(c.id)+'">'+adminEsc(c.label)+'</option>').join('');
 if([...el.options].some(o=>o.value===old))el.value=old
}
function renderFixedAdmin(){
 if(!$('fixedEnabled'))return;
 $('fixedEnabled').checked=S.fixedEnabled!==false;
 $('fixedTitle').value=S.fixedTitle||'고정틀';
 $('fixedNotice').value=S.fixedNotice||'완성된 디자인 그대로 판매되며 색상이나 디자인 수정이 불가능합니다';
 renderFixedCats();renderFixedItems()
}
async function saveFixedSettings(){
 collectFixedAdmin();
 const keys=['fixedEnabled','fixedTitle','fixedNotice','fixedCategories'];
 const saved=await queueSettingsMutation(latest=>{
  for(const k of keys)latest[k]=JSON.parse(JSON.stringify(S[k]));
  delete latest.fixedHolidayNotice;
  delete latest.fixedSalesNotice;
  delete latest.fixedNoEditNotice;
  delete latest.fixedPcColumns;
  delete latest.fixedMobileColumns;
  syncFixedUploadCategories(latest)
 });
 for(const k of keys)S[k]=saved[k];
 S.presetCategories=saved.presetCategories||S.presetCategories;
 showToast('고정틀 설정이 저장되었습니다.')
}
function renderFixedItems(){
 const root=$('fixedItems');if(!root)return;
 const totalPages=Math.max(1,Math.ceil(fixedItems.length/ADMIN_PAGE_SIZE));
 fixedAdminPage=Math.max(1,Math.min(totalPages,fixedAdminPage));
 const start=(fixedAdminPage-1)*ADMIN_PAGE_SIZE;
 const rows=fixedItems.slice(start,start+ADMIN_PAGE_SIZE).map((x,local)=>{
  const i=start+local,m=presetMetaFor(x);
  const cat=ensureFixedCategories().find(c=>c.id===x.category);
  const same=fixedItems.filter(v=>v.category===x.category),pos=same.findIndex(v=>v.file===x.file);
  return '<div class="preset-admin-item preset-admin-item-v2 fixed-admin-item">'+
   '<div class="preset-admin-preview"><img src="'+API+'/media/'+x.file.split('/').map(encodeURIComponent).join('/')+'" loading="lazy" alt=""></div>'+
   '<div class="preset-admin-fields"><div class="muted preset-location">'+adminEsc(cat?.label||x.category)+'</div>'+
   '<label class="preset-name-field">디자인 이름<input data-fixed-name="'+i+'" value="'+adminEsc(m.name)+'"></label>'+
   '<label>판매가 (원)<input data-fixed-price="'+i+'" type="number" min="0" step="100" value="'+Math.max(0,Number((S.presetMeta?.[x.file]||{}).fixedPrice||0))+'"></label>'+
   '<label class="mini-toggle"><input data-fixed-enabled="'+i+'" type="checkbox" '+(m.enabled?'checked':'')+'> 공개</label></div>'+
   '<div class="preset-admin-actions"><div class="media-order-controls">'+
   '<button class="ghost cat-order-button" data-move-fixed="'+i+'" data-dir="-1" '+(pos<=0?'disabled':'')+'>↑</button>'+
   '<button class="ghost cat-order-button" data-move-fixed="'+i+'" data-dir="1" '+(pos>=same.length-1?'disabled':'')+'>↓</button></div>'+
   '<button class="ghost admin-compact" data-fixed-save="'+i+'">정보 저장</button>'+
   '<button class="ghost admin-compact" data-fixed-replace="'+i+'">파일 수정</button>'+
   '<button class="danger admin-compact" data-fixed-delete="'+encodeURIComponent(x.file)+'">삭제</button></div></div>'
 }).join('');
 root.innerHTML=rows||'<p class="muted">등록된 고정틀이 없습니다. 작품을 등록하면 프리셋 위에 별도 섹션으로 표시됩니다.</p>';
 bindAdminPagination('fixedItemsPagination','fixed',fixedAdminPage,totalPages);
 root.querySelectorAll('[data-fixed-save]').forEach(b=>b.onclick=()=>saveFixedItem(+b.dataset.fixedSave).catch(e=>alert('저장에 실패했습니다.\n'+e.message)));
 root.querySelectorAll('[data-fixed-enabled]').forEach(b=>b.onchange=()=>saveFixedItem(+b.dataset.fixedEnabled).catch(e=>alert('저장에 실패했습니다.\n'+e.message)));
 root.querySelectorAll('[data-fixed-replace]').forEach(b=>b.onclick=()=>replaceMediaFile('fixed',+b.dataset.fixedReplace));
 root.querySelectorAll('[data-move-fixed]').forEach(b=>b.onclick=()=>moveFixedItem(+b.dataset.moveFixed,Number(b.dataset.dir)));
 root.querySelectorAll('[data-fixed-delete]').forEach(b=>b.onclick=async()=>{
  if(!confirm('이 고정틀을 삭제할까요?'))return;
  const file=decodeURIComponent(b.dataset.fixedDelete);
  try{
   await api('/api/admin/preset-delete',{method:'POST',body:JSON.stringify({file})});
   const saved=await queueSettingsMutation(latest=>{
    if(latest.presetMeta)delete latest.presetMeta[file];
    latest.presetOrder=(latest.presetOrder||[]).filter(v=>v!==file)
   });
   S.presetMeta=saved.presetMeta||{};S.presetOrder=saved.presetOrder||[];
   await loadPresetItemsOnly();showToast('고정틀이 삭제되었습니다.')
  }catch(e){alert('삭제에 실패했습니다.\n'+e.message)}
 })
}
async function saveFixedItem(i){
 const x=fixedItems[i];if(!x)return;
 const name=document.querySelector('[data-fixed-name="'+i+'"]')?.value.trim();
 const price=Math.max(0,Number(document.querySelector('[data-fixed-price="'+i+'"]')?.value||0));
 const enabled=document.querySelector('[data-fixed-enabled="'+i+'"]')?.checked!==false;
 const saved=await queueSettingsMutation(latest=>{
  if(!latest.presetMeta||typeof latest.presetMeta!=='object')latest.presetMeta={};
  const meta={...(latest.presetMeta[x.file]||{}),name,enabled,fixedPrice:price,showcaseKind:'fixed',colorChangeAvailable:false};
  delete meta.seasonCategoryId;delete meta.fixedHoliday;delete meta.fixedDescription;delete meta.isSold;
  latest.presetMeta[x.file]=meta
 });
 S.presetMeta=saved.presetMeta||{};showToast('고정틀 상품 설정이 저장되었습니다.');renderFixedItems()
}
async function moveFixedItem(i,dir){
 const x=fixedItems[i];if(!x)return;
 const idx=fixedItems.map((v,j)=>({v,j})).filter(o=>o.v.category===x.category);
 const pos=idx.findIndex(o=>o.j===i),dest=idx[pos+dir]?.j;
 if(dest==null)return;
 [fixedItems[i],fixedItems[dest]]=[fixedItems[dest],fixedItems[i]];
 const ordered=[...fixedItems.map(x=>x.file),...presetItems.map(x=>x.file)];
 const saved=await queueSettingsMutation(latest=>{
  latest.presetOrder=[...ordered,...(latest.presetOrder||[]).filter(f=>!ordered.includes(f))]
 });
 S.presetOrder=saved.presetOrder||ordered;renderFixedItems();showToast('순서가 저장되었습니다.')
}
async function uploadFixed(){
 const input=$('fixedFiles'),file=input?.files?.[0],name=$('fixedUploadName')?.value.trim();
 const cat=$('fixedUploadCat')?.value,price=Number($('fixedUploadPrice')?.value||0),status=$('fixedUploadStatus');
 if(!file||!name||!cat){alert('카테고리, 디자인 이름, 파일을 입력해 주세요.');return}
 let path='',metadataSaved=false;
 try{
  validatePresetUploadFile(file);
  status.textContent='설정 저장 및 파일 업로드 중…';
  await saveFixedSettings();
  const d=await uploadMediaWithRetry('/api/admin/preset-upload',cat,file,status);
  path=String(d.path||'');
  if(!path)throw new Error('업로드 경로가 반환되지 않았습니다.');
  const saved=await queueSettingsMutation(latest=>{
   if(!latest.presetMeta||typeof latest.presetMeta!=='object')latest.presetMeta={};
   latest.presetMeta[path]={...(latest.presetMeta[path]||{}),name,enabled:true,isNew:false,isReserved:false,showcaseKind:'fixed',fixedPrice:Math.max(0,price),colorChangeAvailable:false,featured:false};
   const meta=latest.presetMeta[path];delete meta.seasonCategoryId;delete meta.fixedHoliday;delete meta.fixedDescription;delete meta.isSold;
   latest.presetOrder=[path,...(latest.presetOrder||[]).filter(v=>v!==path)]
  });
  S.presetMeta=saved.presetMeta||{};S.presetOrder=saved.presetOrder||[];metadataSaved=true;
  input.value='';$('fixedUploadName').value='';$('fixedUploadPrice').value='';
  status.textContent='고정틀 등록이 완료되었습니다.';
  await loadPresetItemsOnly();showToast('고정틀이 등록되었습니다.')
 }catch(e){
  if(path&&!metadataSaved)await api('/api/admin/preset-delete',{method:'POST',body:JSON.stringify({file:path})}).catch(()=>{});
  status.textContent=e.message;alert('등록에 실패했습니다.\n'+e.message)
 }
}

async function init(){let loggedIn=false;try{const s=await api('/api/admin/session');loggedIn=true;$('login').hidden=true;$('panel').hidden=false;$('userBox').hidden=false;$('userName').textContent=s.user.login;$('githubUser').textContent=s.user.login;try{const d=await api('/api/public/settings');S=d.settings;render()}catch(e){$('saveStatus').textContent='설정을 불러오지 못했습니다: '+e.message}}catch(e){$('login').hidden=false;$('panel').hidden=true}$('health').textContent='확인 중…';try{$('health').textContent=(await api('/health')).ok?'정상':'오류'}catch(e){$('health').textContent='연결 오류'}}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{await api('/auth/login',{method:'POST',body:JSON.stringify({password:$('adminPassword').value})});location.reload()}catch(err){$('loginError').textContent=err.message}};$('logout').onclick=async()=>{await api('/auth/logout',{method:'POST'}).catch(()=>{});location.reload()};document.querySelectorAll('.admin-tabs .tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.admin-tabs .tab').forEach(x=>x.classList.remove('is-active'));b.classList.add('is-active');document.querySelectorAll('[data-section]').forEach(x=>x.hidden=x.dataset.section!==b.dataset.panel)});$('save').onclick=saveSettings;$('reload').onclick=loadItems;$('addNotice').onclick=()=>{collectNotices();S.noticeItems=[...(S.noticeItems||[]),{icon:'',title:'',description:'새 공지 내용을 입력해 주세요.',enabled:true,titleRich:'',descriptionRich:''}];renderNotices()};if($('addEventItem'))$('addEventItem').onclick=()=>{collectEventItems();S.eventsItems=[...ensureEventItems(),{label:'',oldPrice:0,newPrice:0}];renderEventItems()};$('addType').onclick=()=>{S.designTypes=[...(S.designTypes||[]),{id:'type-'+Date.now(),label:'새 디자인',enabled:true,showFrameRetention:false,showSignatureFields:false,showBannerFields:false,showBannerTextField:false}];renderTypes()};$('addCat').onclick=()=>{S.portfolioCategories=[...(S.portfolioCategories||[]),{id:'category-'+Date.now(),label:'새 카테고리',enabled:true,displayWidth:200,displayHeight:200,pcColumns:4,pcPerPage:16,mobileColumns:2,mobilePerPage:10,strictSize:false,uploadWidth:0,uploadHeight:0,formats:['png','jpeg','gif','webp'],emptyText:'등록된 작업물이 아직 없습니다.'}];renderCats()};$('addPresetCat').onclick=()=>{S.presetCategories=[...(S.presetCategories||[]),{id:'preset-'+Date.now(),label:'새 프리셋 카테고리',enabled:true,displayWidth:240,displayHeight:240,formats:['png','jpeg','gif','webp']}];renderPresetCats()};$('saveCats').onclick=saveSettings;$('savePresetCats').onclick=saveSettings;if($('saveQuoteConfig'))$('saveQuoteConfig').onclick=saveSettings;if($('addQuoteItem'))$('addQuoteItem').onclick=()=>{const q=ensureQuoteConfig();q.customItems.push({id:'q-'+Date.now(),name:'새 추가 항목',price:0});renderQuoteAdmin()};if($('copyQuote'))$('copyQuote').onclick=copyQuote;if($('addFixedCat'))$('addFixedCat').onclick=()=>{collectFixedAdmin();S.fixedCategories.push({id:'fixed-'+Date.now(),label:'새 고정틀 카테고리',enabled:true});renderFixedCats()};if($('saveFixedSettings'))$('saveFixedSettings').onclick=()=>saveFixedSettings().catch(e=>alert('고정틀 설정 저장 실패: '+e.message));if($('uploadFixed'))$('uploadFixed').onclick=uploadFixed;$('upload').onclick=()=>uploadFiles('portfolio');$('uploadPreset').onclick=()=>uploadFiles('preset');
async function siteUpload(kind,inputId){const file=$(inputId).files[0];if(!file)return;const fd=new FormData();fd.append('file',file);fd.append('kind',kind);try{await fetch(API+'/api/admin/site-image',{method:'POST',credentials:'include',body:fd}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d});const d=await api('/api/admin/settings');S=d.settings;render();showToast('이미지가 업로드되었습니다.')}catch(e){alert(e.message)}}
async function siteDelete(kind){if(!confirm('등록된 이미지를 삭제할까요?'))return;try{const d=await api('/api/admin/site-image/delete',{method:'POST',body:JSON.stringify({kind})});S=d.settings||S;render()}catch(e){alert(e.message)}}
$('uploadAbout').onclick=()=>siteUpload('about','aboutFile');$('deleteAbout').onclick=()=>siteDelete('about');
init();
