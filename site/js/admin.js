const C=window.ARTMUG_CONFIG||{},API=C.API_BASE||'';let S=null,items=[],presetItems=[],quoteState={};const QUOTE_BANNERS=[['top','상단배너'],['floating','플로팅배너'],['bottom1','하단배너 1칸'],['bottom3','하단배너 3칸'],['bottom6','하단배너 6칸']],QUOTE_OPTIONS=[['sameDay','당일마감'],['fast','빠른마감'],['private','포트폴리오 비공개']];const $=id=>document.getElementById(id);
const PRESET_UPLOAD_MAX_BYTES=6*1024*1024;
const PRESET_UPLOAD_EXTS=new Set(['gif','png','jpg','jpeg','webp']);
function validatePresetUploadFile(file){
  if(!file)throw new Error('업로드할 파일을 선택해주세요.');
  const ext=String(file.name||'').split('.').pop().toLowerCase();
  if(!PRESET_UPLOAD_EXTS.has(ext))throw new Error('GIF, PNG, JPG, JPEG, WEBP 파일만 업로드할 수 있습니다.');
  if(file.size>PRESET_UPLOAD_MAX_BYTES)throw new Error('파일은 6MB 이하만 업로드할 수 있습니다.');
  if(file.size<=0)throw new Error('빈 파일은 업로드할 수 없습니다.');
}
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
    colorChangeAvailable:meta.colorChangeAvailable===true
  }
}
function ensurePortfolioMeta(){if(!S.portfolioMeta||typeof S.portfolioMeta!=='object'||Array.isArray(S.portfolioMeta))S.portfolioMeta={};return S.portfolioMeta}
function portfolioMetaFor(x){const meta=ensurePortfolioMeta()[x.file]||{};return {profileType:['A','B'].includes(meta.profileType)?meta.profileType:''}}
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
function render(){
$('scheduleFields').innerHTML=`<label class="wide"><span>작업 시작 기준 날짜</span><input id="scheduleDate" type="date" value="${S.scheduleDate||''}"><small class="field-note">공개 페이지에는 “현재 신청시 <b>월 일</b>부터 작업이 진행됩니다!”로 고정 표시됩니다. 설정 날짜가 오늘보다 과거가 되면 오늘 날짜로 자동 변경됩니다.</small></label>`;
$('noticeFields').innerHTML=input('공지 제목','noticeTitle',S.noticeTitle)+area('공지 안내 문구','noticeText',S.noticeText,true);
$('formFields').innerHTML=input('문의양식 제목','formTitle',S.formTitle)+area('문의양식 설명','formDescription',S.formDescription,true)+input('닉네임 항목','nicknameLabel',S.nicknameLabel)+input('닉네임 placeholder','nicknamePlaceholder',S.nicknamePlaceholder)+input('디자인 종류 항목','designTypeLabel',S.designTypeLabel)+input('틀 보관 항목','frameKeepLabel',S.frameKeepLabel)+area('틀 보관 설명','frameKeepDescription',S.frameKeepDescription,true)+input('컨셉 항목','conceptLabel',S.conceptLabel)+input('컨셉 placeholder','conceptPlaceholder',S.conceptPlaceholder)+input('추가 요청 항목','extraLabel',S.extraLabel)+input('추가 요청 placeholder','extraPlaceholder',S.extraPlaceholder)+input('복사 버튼','copyButton',S.copyButton)+input('복사 완료 문구','copySuccess',S.copySuccess)+input('움짤 틀 보관 O','frameKeepYes',S.frameKeepYes)+input('움짤 틀 보관 X','frameKeepNo',S.frameKeepNo)+input('시그풍 숫자 항목','signatureNumberLabel',S.signatureNumberLabel)+input('시그풍 숫자 placeholder','signatureNumberPlaceholder',S.signatureNumberPlaceholder)+input('시그풍 내용 항목','signatureContentLabel',S.signatureContentLabel)+input('시그풍 내용 placeholder','signatureContentPlaceholder',S.signatureContentPlaceholder);
$('portfolioTextFields').innerHTML=input('포트폴리오 제목','portfolioTitle',S.portfolioTitle,true);
$('footerFields').innerHTML=input('하단 문구','footerText',S.footerText,true);
renderNotices();renderTypes();renderCats();renderPresetCats();renderPresetGroups();renderBackgroundGuideAdmin();renderQuoteAdmin();renderEventItems();$('presetEnabled').checked=!!S.presetEnabled;$('presetTitle').value=S.presetTitle||'미판매 프리셋';$('presetNotice').value=S.presetNotice||'';$('authorEnabled').checked=!!S.authorEnabled;$('authorText').value=S.authorText||'';$('authorFontSize').value=S.authorFontSize||15;$('eventsEnabled').checked=!!S.eventsEnabled;$('bannerEventEnabled').checked=S.bannerEventEnabled!==false;$('eventsKicker').value=S.eventsKicker||'REVIEW EVENT';$('eventsTitle').value=S.eventsTitle||'이벤트 안내';$('eventsText').value=S.eventsText||'';$('eventsNote').value=S.eventsNote||'※ 움짤프사 + 상단배너 둘 다 주문해도 중복 할인은 적용되지 않습니다.';$('eventsTitleFontSize').value=S.eventsTitleFontSize||22;$('eventsFontSize').value=S.eventsFontSize||15;$('api').textContent=API;loadItems();}
function renderNotices(){$('notices').innerHTML=(S.noticeItems||[]).map((x,i)=>`<div class="editable"><div class="row"><input data-notice-icon="${i}" value="${x.icon||''}"><input data-notice-title="${i}" value="${x.title||''}"><button class="danger" data-del-notice="${i}">삭제</button></div><textarea data-notice-desc="${i}">${x.description||''}</textarea></div>`).join('');document.querySelectorAll('[data-del-notice]').forEach(b=>b.onclick=()=>{S.noticeItems.splice(+b.dataset.delNotice,1);renderNotices()})}
function renderTypes(){
  $('types').innerHTML=(S.designTypes||[]).map((x,i)=>`<div class="editable type-edit">
    <label class="type-name">디자인 이름<input data-type-label="${i}" value="${adminEsc(x.label||'')}"></label>
    <div class="type-options">
      <label><input type="checkbox" data-type-enabled="${i}" ${x.enabled!==false?'checked':''}> 공개</label>
      <label><input type="checkbox" data-type-frame="${i}" ${x.showFrameRetention?'checked':''}> 틀 보관</label>
      <label><input type="checkbox" data-type-sign="${i}" ${x.showSignatureFields?'checked':''}> 시그풍</label>
      <label><input type="checkbox" data-type-banner="${i}" ${x.showBannerFields?'checked':''}> 하단 배너 종류</label>
      <label><input type="checkbox" data-type-banner-text="${i}" ${x.showBannerTextField?'checked':''}> 배너 입력 문구</label>
      <label><input type="checkbox" data-type-review="${i}" ${x.showReviewEvent?'checked':''}> 리뷰이벤트</label>
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
  return `<div class="cat-row"><label>이름<input data-${prefix}-label="${i}" value="${adminEsc(c.label||'')}"></label><label>ID<input data-${prefix}-id="${i}" value="${adminEsc(c.id||'')}"></label><label>가로<input type="number" data-${prefix}-w="${i}" value="${c.displayWidth||200}"></label><label>세로<input type="number" data-${prefix}-h="${i}" value="${c.displayHeight||200}"></label><label class="mini-toggle"><input type="checkbox" data-${prefix}-enabled="${i}" ${c.enabled!==false?'checked':''}> 공개</label><div class="cat-order-controls"><button type="button" class="ghost cat-order-button" data-move-${prefix}="${i}" data-dir="-1" aria-label="위로 이동">↑</button><button type="button" class="ghost cat-order-button" data-move-${prefix}="${i}" data-dir="1" aria-label="아래로 이동">↓</button></div><button class="danger" data-del-${prefix}="${i}">삭제</button></div>`
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
  const c=(S?.portfolioCategories||[]).find(x=>x.id===$('uploadCat').value),input=$('files'),hint=$('portfolioUploadHint');
  if(!c){input.removeAttribute('accept');if(hint)hint.textContent='';return}
  const formats=(c.formats||[]).map(x=>String(x).toLowerCase());
  input.accept=formats.flatMap(x=>x==='jpeg'||x==='jpg'?['.jpg','.jpeg']:['.'+x]).join(',');
  const parts=[formats.join(', ').toUpperCase()];
  if(c.strictSize)parts.push(`${c.uploadWidth} × ${c.uploadHeight}px`);
  parts.push(`${Math.min(Number(c.maxBytes)||6291456,6291456)/1048576}MB 이하`);
  if(hint)hint.textContent='업로드 조건: '+parts.filter(Boolean).join(' · ')
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
function updatePresetUploadSelectors(){}

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
  return q
}
function wonInput(label,value,attrs=''){return `<label class="quote-price-row"><span>${label}</span><div class="quote-price-input"><input type="number" min="0" step="100" value="${Number(value||0)}" ${attrs}><em>원</em></div></label>`}
function renderQuoteAdmin(){
  if(!$('quotePricing'))return;
  const q=ensureQuoteConfig();
  const design=(S.designTypes||[]).map(x=>wonInput(x.label,q.designPrices[x.id],`data-q-design="${x.id}"`)).join('');
  const banners=QUOTE_BANNERS.map(([id,label])=>wonInput(label,q.bannerPrices[id],`data-q-banner="${id}"`)).join('');
  const options=QUOTE_OPTIONS.map(([id,label])=>wonInput(label,q.optionPrices[id],`data-q-option="${id}"`)).join('');
  $('quotePricing').innerHTML=`<div class="quote-price-group"><h4>신청 디자인 종류</h4>${design}</div><div class="quote-price-group"><h4>배너 종류</h4>${banners}</div><div class="quote-price-group"><h4>추가 옵션</h4>${options}</div>`;
  $('quoteCustomItems').innerHTML=q.customItems.map((x,i)=>`<div class="quote-custom-row"><input data-q-custom-name="${i}" value="${String(x.name||'').replaceAll('"','&quot;')}" placeholder="항목명"><div class="quote-price-input"><input type="number" min="0" step="100" data-q-custom-price="${i}" value="${Number(x.price||0)}"><em>원</em></div><button class="danger admin-compact" data-del-q-custom="${i}">삭제</button></div>`).join('')||'<p class="muted quote-empty">등록된 별도 추가 항목이 없습니다.</p>';
  bindQuoteConfigInputs();renderQuoteBuilder()
}
function bindQuoteConfigInputs(){
  document.querySelectorAll('[data-q-design]').forEach(e=>e.oninput=()=>{ensureQuoteConfig().designPrices[e.dataset.qDesign]=Number(e.value||0);renderQuoteBuilder()});
  document.querySelectorAll('[data-q-banner]').forEach(e=>e.oninput=()=>{ensureQuoteConfig().bannerPrices[e.dataset.qBanner]=Number(e.value||0);renderQuoteBuilder()});
  document.querySelectorAll('[data-q-option]').forEach(e=>e.oninput=()=>{ensureQuoteConfig().optionPrices[e.dataset.qOption]=Number(e.value||0);renderQuoteBuilder()});
  document.querySelectorAll('[data-q-custom-name]').forEach(e=>e.oninput=()=>{const x=ensureQuoteConfig().customItems[+e.dataset.qCustomName];if(x){x.name=e.value;renderQuoteBuilder()}});
  document.querySelectorAll('[data-q-custom-price]').forEach(e=>e.oninput=()=>{const x=ensureQuoteConfig().customItems[+e.dataset.qCustomPrice];if(x){x.price=Number(e.value||0);renderQuoteBuilder()}});
  document.querySelectorAll('[data-del-q-custom]').forEach(b=>b.onclick=()=>{const q=ensureQuoteConfig(),x=q.customItems[+b.dataset.delQCustom];if(x)delete quoteState['custom:'+x.id];q.customItems.splice(+b.dataset.delQCustom,1);renderQuoteAdmin()})
}
function quoteItems(){
  const q=ensureQuoteConfig(),out=[];
  (S.designTypes||[]).forEach(x=>out.push({key:'design:'+x.id,label:x.label,price:Number(q.designPrices[x.id]||0)}));
  QUOTE_BANNERS.forEach(([id,label])=>out.push({key:'banner:'+id,label,price:Number(q.bannerPrices[id]||0)}));
  QUOTE_OPTIONS.forEach(([id,label])=>out.push({key:'option:'+id,label,price:Number(q.optionPrices[id]||0)}));
  q.customItems.forEach(x=>out.push({key:'custom:'+x.id,label:x.name||'이름 없는 항목',price:Number(x.price||0)}));
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

function collect(){document.querySelectorAll('[data-key]').forEach(e=>S[e.dataset.key]=e.value);(S.noticeItems||[]).forEach((x,i)=>{const icon=document.querySelector(`[data-notice-icon="${i}"]`),title=document.querySelector(`[data-notice-title="${i}"]`),desc=document.querySelector(`[data-notice-desc="${i}"]`);if(icon)x.icon=icon.value;if(title)x.title=title.value;if(desc)x.description=desc.value});(S.designTypes||[]).forEach((x,i)=>{const label=document.querySelector(`[data-type-label="${i}"]`),enabled=document.querySelector(`[data-type-enabled="${i}"]`),frame=document.querySelector(`[data-type-frame="${i}"]`),sign=document.querySelector(`[data-type-sign="${i}"]`),banner=document.querySelector(`[data-type-banner="${i}"]`),bannerText=document.querySelector(`[data-type-banner-text="${i}"]`),review=document.querySelector(`[data-type-review="${i}"]`);if(label)x.label=label.value;if(enabled)x.enabled=enabled.checked;if(frame)x.showFrameRetention=frame.checked;if(sign)x.showSignatureFields=sign.checked;if(banner)x.showBannerFields=banner.checked;if(bannerText)x.showBannerTextField=bannerText.checked;if(review)x.showReviewEvent=review.checked})}
function collectCats(arr,prefix){arr.forEach((c,i)=>{const label=document.querySelector(`[data-${prefix}-label="${i}"]`),id=document.querySelector(`[data-${prefix}-id="${i}"]`),w=document.querySelector(`[data-${prefix}-w="${i}"]`),h=document.querySelector(`[data-${prefix}-h="${i}"]`),enabled=document.querySelector(`[data-${prefix}-enabled="${i}"]`);if(label)c.label=label.value;if(id)c.id=id.value;if(w)c.displayWidth=Number(w.value||c.displayWidth||200);if(h)c.displayHeight=Number(h.value||c.displayHeight||200);if(enabled)c.enabled=enabled.checked})}
async function saveSettings(){
  collect();collectBackgroundGuide();collectCats(S.portfolioCategories||[],'cat');
  S.scheduleDate=$('scheduleDate').value;
  S.presetEnabled=$('presetEnabled').checked;
  S.presetTitle=$('presetTitle').value;
  S.presetNotice=$('presetNotice').value;
  S.authorEnabled=$('authorEnabled').checked;
  S.authorText=$('authorText').value;
  S.authorFontSize=Number($('authorFontSize').value||15);
  S.eventsEnabled=$('eventsEnabled').checked;
  S.bannerEventEnabled=$('bannerEventEnabled').checked;
  S.eventsKicker=$('eventsKicker').value;
  S.eventsTitle=$('eventsTitle').value;
  S.eventsText=$('eventsText').value;
  S.eventsNote=$('eventsNote').value;
  collectEventItems();
  delete S.eventsBenefitLabel;delete S.eventsOldPrice;delete S.eventsNewPrice;
  S.eventsTitleFontSize=Number($('eventsTitleFontSize').value||22);
  S.eventsFontSize=Number($('eventsFontSize').value||15);
  collectCats(S.presetCategories||[],'preset');collectPresetGroups();
  delete S.backgroundGuide;delete S.comparisonAImage;delete S.comparisonBImage;delete S.portfolioMeta;delete S.presetColorMeta;delete S.presetVariantFiles;
  const snapshot=JSON.parse(JSON.stringify(S));
  try{
    $('saveStatus').textContent='저장 중…';
    const saved=await queueSettingsMutation(latest=>Object.assign(latest,snapshot));
    S=saved;
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
  const presetBase=[...(q.items||[])].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  presetItems=applyAdminOrder(presetBase,S?.presetOrder);
  renderPresetItems()
}
async function loadItems(){
  try{
    const [d]=await Promise.all([
      api('/api/admin/portfolio'),
      loadPresetItemsOnly()
    ]);
    items=applyAdminOrder(d.items||[],S?.portfolioOrder);
    renderItems()
  }catch(e){$('uploadStatus').textContent=e.message}
}
function presetLocationText(x){
  return (S.presetCategories||[]).find(c=>c.id===x.category)?.label||x.category||''
}
async function savePresetItem(i){
  const x=presetItems[i];if(!x)return;
  const meta=presetMetaFor(x),name=document.querySelector(`[data-preset-name="${i}"]`),desc=document.querySelector(`[data-preset-desc="${i}"]`);
  const patch={name:name?name.value.trim():meta.name,description:desc?desc.value.trim():meta.description};

  const saved=await queueSettingsMutation(latest=>{
    if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
    const prev=latest.presetMeta[x.file]||{};
    latest.presetMeta[x.file]={...prev,...patch}
  });
  S.presetMeta=saved.presetMeta||S.presetMeta||{};
  showToast('프리셋 정보가 저장되었습니다.');
  renderPresetItems()
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
      : (value?'색상변경가능 표시를 켰습니다.':'색상변경가능 표시를 껐습니다.');
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
  const list=kind==='preset'?presetItems:items,x=list[index];if(!x)return;
  const file=await chooseReplacementFile();if(!file)return;
  const isPreset=kind==='preset',endpoint=isPreset?'/api/admin/preset-upload':'/api/admin/upload',deleteEndpoint=isPreset?'/api/admin/preset-delete':'/api/admin/delete';
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
      name:(document.querySelector(`[data-preset-name="${index}"]`)?.value||presetMetaFor(x).name).trim(),
      description:(document.querySelector(`[data-preset-desc="${index}"]`)?.value||presetMetaFor(x).description).trim()
    }:null;
    const saved=await queueSettingsMutation(latest=>{
      if(isPreset){
        if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
        latest.presetMeta[newPath]={...(latest.presetMeta[x.file]||{}),...presetMeta};
        delete latest.presetMeta[x.file];
        latest.presetOrder=replaceOrderPath(latest.presetOrder,x.file,newPath)
      }else{
        if(latest.portfolioMeta&&typeof latest.portfolioMeta==='object'){delete latest.portfolioMeta[x.file];delete latest.portfolioMeta[newPath]}
        latest.portfolioOrder=replaceOrderPath(latest.portfolioOrder,x.file,newPath)
      }
    });
    metadataMoved=true;
    if(isPreset){S.presetMeta=saved.presetMeta||{};S.presetOrder=saved.presetOrder||[]}
    else{delete S.portfolioMeta;S.portfolioOrder=saved.portfolioOrder||[]}

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
  $('presetItems').innerHTML=presetItems.map((x,i)=>{
    const meta=presetMetaFor(x),same=presetItems.filter(v=>v.category===x.category),samePos=same.findIndex(v=>v.file===x.file);
    return `<div class="preset-admin-item preset-admin-item-v2">
      <img src="${API}/media/${x.file.split('/').map(encodeURIComponent).join('/')}" loading="lazy" decoding="async" draggable="false">
      <div class="preset-admin-fields">
        <div class="muted preset-location">${adminEsc(presetLocationText(x))}</div>
        <label>프리셋 이름<input data-preset-name="${i}" value="${adminEsc(meta.name)}" placeholder="예: 라벤더 체크"></label>
        <label class="mini-toggle"><input type="checkbox" data-preset-enabled="${i}" ${meta.enabled?'checked':''}> 공개</label>
        <label class="mini-toggle"><input type="checkbox" data-preset-new="${i}" ${meta.isNew?'checked':''}> NEW 표시</label>
        <label class="mini-toggle"><input type="checkbox" data-preset-color-change="${i}" ${meta.colorChangeAvailable?'checked':''}> 색상변경가능 표시</label>
      </div>
      <div class="preset-admin-actions">
        <div class="media-order-controls">
          <button type="button" class="ghost cat-order-button" data-move-preset-item="${i}" data-dir="-1" ${samePos<=0?'disabled':''} title="위로 이동">↑</button>
          <button type="button" class="ghost cat-order-button" data-move-preset-item="${i}" data-dir="1" ${samePos>=same.length-1?'disabled':''} title="아래로 이동">↓</button>
        </div>
        <button class="ghost admin-compact" data-replace-preset="${i}">대표 이미지 수정</button>
        <button class="ghost admin-compact" data-save-preset="${i}">이름 저장</button>
        <button class="danger" data-delete-preset="${encodeURIComponent(x.file)}">프리셋 삭제</button>
      </div>
    </div>`
  }).join('')||'<p class="muted">등록된 프리셋이 없습니다.</p>';

  document.querySelectorAll('[data-move-preset-item]').forEach(b=>b.onclick=()=>moveMediaItem('preset',+b.dataset.movePresetItem,Number(b.dataset.dir)));
  document.querySelectorAll('[data-replace-preset]').forEach(b=>b.onclick=()=>replaceMediaFile('preset',+b.dataset.replacePreset));
  document.querySelectorAll('[data-save-preset]').forEach(b=>b.onclick=()=>savePresetItem(+b.dataset.savePreset).catch(e=>alert(e.message)));
  document.querySelectorAll('[data-preset-enabled]').forEach(el=>el.onchange=()=>savePresetToggle(+el.dataset.presetEnabled,'enabled',el.checked).catch(e=>{el.checked=!el.checked;alert('공개 상태 저장에 실패했습니다.\n'+e.message)}));
  document.querySelectorAll('[data-preset-new]').forEach(el=>el.onchange=()=>savePresetToggle(+el.dataset.presetNew,'isNew',el.checked).catch(e=>{el.checked=!el.checked;alert('NEW 표시 저장에 실패했습니다.\n'+e.message)}));
  document.querySelectorAll('[data-preset-color-change]').forEach(el=>el.onchange=()=>savePresetToggle(+el.dataset.presetColorChange,'colorChangeAvailable',el.checked).catch(e=>{el.checked=!el.checked;alert('색상변경가능 표시 저장에 실패했습니다.\n'+e.message)}));
  document.querySelectorAll('[data-delete-preset]').forEach(b=>b.onclick=async()=>{
    if(!confirm('이 프리셋을 삭제할까요?'))return;
    const file=decodeURIComponent(b.dataset.deletePreset);
    await api('/api/admin/preset-delete',{method:'POST',body:JSON.stringify({file})});
    const saved=await queueSettingsMutation(latest=>{
      if(latest.presetMeta&&typeof latest.presetMeta==='object')delete latest.presetMeta[file];
      latest.presetOrder=(latest.presetOrder||[]).filter(x=>x!==file);
      delete latest.presetColorMeta;delete latest.presetVariantFiles
    }).catch(()=>null);
    if(saved){S.presetMeta=saved.presetMeta||{};S.presetOrder=saved.presetOrder||[]}
    loadItems()
  })
}

function renderItems(){
  $('items').innerHTML=items.map((x,i)=>{
    const logical=logicalPortfolioCategory(x.category),same=items.filter(v=>logicalPortfolioCategory(v.category)===logical),samePos=same.findIndex(v=>v.file===x.file),isProfile=logical==='profile';
    return `<div class="item portfolio-admin-item">
      <img src="${API}/media/${x.file.split('/').map(encodeURIComponent).join('/')}" loading="lazy" draggable="false">
      <div class="portfolio-item-info"><strong>${adminEsc(x.originalName)}</strong><div class="muted">${isProfile?'움짤프사':adminEsc(x.category)}</div></div>
      <div class="item-actions">
        <div class="media-order-controls"><button type="button" class="ghost cat-order-button" data-move-portfolio-item="${i}" data-dir="-1" ${samePos<=0?'disabled':''} title="위로 이동">↑</button><button type="button" class="ghost cat-order-button" data-move-portfolio-item="${i}" data-dir="1" ${samePos>=same.length-1?'disabled':''} title="아래로 이동">↓</button></div>
        <button class="ghost admin-compact" data-replace-portfolio="${i}">파일 수정</button>
        <button class="danger" data-delete="${encodeURIComponent(x.file)}">삭제</button>
      </div>
    </div>`
  }).join('');
  document.querySelectorAll('[data-move-portfolio-item]').forEach(b=>b.onclick=()=>moveMediaItem('portfolio',+b.dataset.movePortfolioItem,Number(b.dataset.dir)));
  document.querySelectorAll('[data-replace-portfolio]').forEach(b=>b.onclick=()=>replaceMediaFile('portfolio',+b.dataset.replacePortfolio));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('이 작업물을 삭제할까요?'))return;const file=decodeURIComponent(b.dataset.delete);S.portfolioOrder=(S.portfolioOrder||[]).filter(x=>x!==file);await api('/api/admin/delete',{method:'POST',body:JSON.stringify({file})});await queueSettingsMutation(latest=>{latest.portfolioOrder=(latest.portfolioOrder||[]).filter(x=>x!==file);if(latest.portfolioMeta&&typeof latest.portfolioMeta==='object')delete latest.portfolioMeta[file]}).catch(()=>{});loadItems()})
}
async function uploadFiles(kind){
  const isPreset=kind==='preset',fileInput=isPreset?$('presetFiles'):$('files'),cat=isPreset?$('presetUploadCat').value:$('uploadCat').value,status=$(isPreset?'presetUploadStatus':'uploadStatus'),files=[...fileInput.files];
  if(!files.length)return;
  try{
    if(isPreset){
      const name=String($('presetUploadName')?.value||'').trim();
      if(!name)throw new Error('프리셋 이름을 입력해주세요.');
      const file=files[0];validatePresetUploadFile(file);const fd=new FormData();fd.append('category',cat);fd.append('file',file);
      status.textContent='대표 이미지 업로드 중…';
      const r=await fetch(API+'/api/admin/preset-upload',{method:'POST',credentials:'include',body:fd}),d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
      const path=String(d.path||'');if(!path)throw new Error('업로드된 파일 경로를 확인하지 못했습니다.');
      const saved=await queueSettingsMutation(latest=>{
        if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
        latest.presetMeta[path]={...(latest.presetMeta[path]||{}),name,enabled:true,isNew:false,colorChangeAvailable:false};
        const order=Array.isArray(latest.presetOrder)?latest.presetOrder.filter(v=>v!==path):[];
        order.push(path);
        latest.presetOrder=order;
        delete latest.presetColorMeta;delete latest.presetVariantFiles
      });
      S.presetMeta=saved.presetMeta||{};
      S.presetOrder=saved.presetOrder||S.presetOrder||[];
      $('presetUploadName').value='';fileInput.value='';status.textContent='프리셋이 등록되었습니다.';await loadPresetItemsOnly();showToast('프리셋이 등록되었습니다.');return
    }
    const uploadedPaths=[];
    for(let i=0;i<files.length;i++){
      status.textContent=`${i+1}/${files.length} 업로드 중…`;
      const fd=new FormData();fd.append('category',cat);fd.append('file',files[i]);
      const r=await fetch(API+'/api/admin/upload',{method:'POST',credentials:'include',body:fd}),d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
      if(d.path)uploadedPaths.push(String(d.path))
    }
    if(uploadedPaths.length){
      const saved=await queueSettingsMutation(latest=>{
        const current=Array.isArray(latest.portfolioOrder)?latest.portfolioOrder:[];
        const fresh=[...uploadedPaths].reverse();
        const newSet=new Set(fresh);
        latest.portfolioOrder=[...fresh,...current.filter(v=>!newSet.has(v))]
      });
      S.portfolioOrder=saved.portfolioOrder||S.portfolioOrder||[]
    }
    status.textContent='업로드가 완료되었습니다.';fileInput.value='';await loadItems();showToast('업로드되었습니다.')
  }catch(e){status.textContent=e.message;alert('업로드에 실패했습니다.\n'+e.message)}
}
async function init(){let loggedIn=false;try{const s=await api('/api/admin/session');loggedIn=true;$('login').hidden=true;$('panel').hidden=false;$('userBox').hidden=false;$('userName').textContent=s.user.login;$('githubUser').textContent=s.user.login;try{const d=await api('/api/public/settings');S=d.settings;render()}catch(e){$('saveStatus').textContent='설정을 불러오지 못했습니다: '+e.message}}catch(e){$('login').hidden=false;$('panel').hidden=true}$('health').textContent='확인 중…';try{$('health').textContent=(await api('/health')).ok?'정상':'오류'}catch(e){$('health').textContent='연결 오류'}}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{await api('/auth/login',{method:'POST',body:JSON.stringify({password:$('adminPassword').value})});location.reload()}catch(err){$('loginError').textContent=err.message}};$('logout').onclick=async()=>{await api('/auth/logout',{method:'POST'}).catch(()=>{});location.reload()};document.querySelectorAll('.admin-tabs .tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.admin-tabs .tab').forEach(x=>x.classList.remove('is-active'));b.classList.add('is-active');document.querySelectorAll('[data-section]').forEach(x=>x.hidden=x.dataset.section!==b.dataset.panel)});$('save').onclick=saveSettings;$('reload').onclick=loadItems;$('addNotice').onclick=()=>{S.noticeItems=[...(S.noticeItems||[]),{icon:'',title:'새 공지',description:'설명을 입력해 주세요.'}];renderNotices()};if($('addEventItem'))$('addEventItem').onclick=()=>{collectEventItems();S.eventsItems=[...ensureEventItems(),{label:'',oldPrice:0,newPrice:0}];renderEventItems()};$('addType').onclick=()=>{S.designTypes=[...(S.designTypes||[]),{id:'type-'+Date.now(),label:'새 디자인',enabled:true,showFrameRetention:false,showSignatureFields:false,showBannerFields:false,showBannerTextField:false,showReviewEvent:false}];renderTypes()};$('addCat').onclick=()=>{S.portfolioCategories=[...(S.portfolioCategories||[]),{id:'new-category',label:'새 카테고리',enabled:true,displayWidth:200,displayHeight:200,strictSize:false,uploadWidth:0,uploadHeight:0,maxBytes:6291456,formats:['png','jpeg','gif','webp'],emptyText:'등록된 작업물이 아직 없습니다.'}];renderCats()};$('addPresetCat').onclick=()=>{S.presetCategories=[...(S.presetCategories||[]),{id:'new-preset',label:'새 프리셋',enabled:true,displayWidth:240,displayHeight:240,maxBytes:6291456,formats:['png','jpeg','gif','webp']}];renderPresetCats()};$('saveCats').onclick=saveSettings;$('savePresetCats').onclick=saveSettings;if($('saveQuoteConfig'))$('saveQuoteConfig').onclick=saveSettings;if($('addQuoteItem'))$('addQuoteItem').onclick=()=>{const q=ensureQuoteConfig();q.customItems.push({id:'q-'+Date.now(),name:'새 추가 항목',price:0});renderQuoteAdmin()};if($('copyQuote'))$('copyQuote').onclick=copyQuote;$('upload').onclick=()=>uploadFiles('portfolio');$('uploadPreset').onclick=()=>uploadFiles('preset');
async function siteUpload(kind,inputId){const file=$(inputId).files[0];if(!file)return;const fd=new FormData();fd.append('file',file);fd.append('kind',kind);try{await fetch(API+'/api/admin/site-image',{method:'POST',credentials:'include',body:fd}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d});const d=await api('/api/admin/settings');S=d.settings;render();showToast('이미지가 업로드되었습니다.')}catch(e){alert(e.message)}}
async function siteDelete(kind){if(!confirm('등록된 이미지를 삭제할까요?'))return;try{const d=await api('/api/admin/site-image/delete',{method:'POST',body:JSON.stringify({kind})});S=d.settings||S;render()}catch(e){alert(e.message)}}
$('uploadAbout').onclick=()=>siteUpload('about','aboutFile');$('deleteAbout').onclick=()=>siteDelete('about');
init();
