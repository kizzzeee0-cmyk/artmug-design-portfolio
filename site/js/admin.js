const C=window.ARTMUG_CONFIG||{},API=C.API_BASE||'';let S=null,items=[],presetItems=[],quoteState={};const QUOTE_BANNERS=[['top','상단배너'],['floating','플로팅배너'],['bottom1','하단배너 1칸'],['bottom3','하단배너 3칸'],['bottom6','하단배너 6칸']],QUOTE_OPTIONS=[['sameDay','당일마감'],['fast','빠른마감'],['private','포트폴리오 비공개']];const $=id=>document.getElementById(id);
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
function presetMetaFor(x){const meta=ensurePresetMeta()[x.file]||{};return {name:String(meta.name||''),description:String(meta.description??''),enabled:meta.enabled!==undefined?meta.enabled:x.enabled!==false,isNew:meta.isNew===true}}

function ensureBackgroundGuide(){
  if(!S.backgroundGuide||typeof S.backgroundGuide!=='object')S.backgroundGuide={};
  const g=S.backgroundGuide;
  if(g.enabled===undefined)g.enabled=true;
  if(!Array.isArray(g.options))g.options=[];
  const defaults=[
    {key:'a',badge:'A',title:'간단한 패턴 무늬',description:'',details:[],note:'',buttonLabel:'디자인 보러가기',targetKind:'preset',targetCategory:'profile'},
    {key:'b',badge:'B',title:'고정틀 프리셋',description:'',details:[],note:'',buttonLabel:'디자인 보러가기',targetKind:'preset',targetCategory:'profile-b'},
    {key:'c',badge:'C',title:'개인 맞춤 제작',description:'',details:[],note:'',buttonLabel:'디자인 보러가기',targetKind:'portfolio',targetCategory:'profile-c'}
  ];
  defaults.forEach((d,i)=>{
    if(!g.options[i])g.options[i]={...d};
    else g.options[i]={...d,...g.options[i],details:Array.isArray(g.options[i].details)?g.options[i].details:[]}
  });
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
  const targetNames=['움짤프사 A 프리셋','움짤프사 B 프리셋','움짤프사 C 포트폴리오'];
  $('backgroundGuideOptions').innerHTML=g.options.slice(0,3).map((x,i)=>`
    <div class="background-guide-admin-card">
      <div class="background-guide-admin-head"><strong>${adminEsc(x.badge||String.fromCharCode(65+i))} 유형</strong><span class="muted">버튼 이동 위치: ${targetNames[i]}</span></div>
      <div class="fields">
        <label><span>표시 문자</span><input data-bg-badge="${i}" value="${adminEsc(x.badge||'')}"></label>
        <label><span>유형 제목</span><input data-bg-title="${i}" value="${adminEsc(x.title||'')}"></label>
        <label class="wide"><span>설명</span><textarea data-bg-description="${i}">${adminEsc(x.description||'')}</textarea></label>
        <label class="wide"><span>세부 문구 · 한 줄에 하나씩</span><textarea data-bg-details="${i}">${adminEsc((x.details||[]).join('\n'))}</textarea></label>
        <label class="wide"><span>추가 안내 문구</span><textarea data-bg-note="${i}">${adminEsc(x.note||'')}</textarea></label>
        <label class="wide"><span>버튼 문구</span><input data-bg-button="${i}" value="${adminEsc(x.buttonLabel||'')}"></label>
      </div>
    </div>`).join('')
}
function collectBackgroundGuide(){
  if(!$('backgroundGuideEnabled'))return;
  const g=ensureBackgroundGuide();
  g.enabled=$('backgroundGuideEnabled').checked;
  g.kicker=$('backgroundGuideKickerInput')?.value||'';
  g.title=$('backgroundGuideTitleInput')?.value||'';
  g.subtitle=$('backgroundGuideSubtitleInput')?.value||'';
  g.options.slice(0,3).forEach((x,i)=>{
    x.badge=document.querySelector(`[data-bg-badge="${i}"]`)?.value||'';
    x.title=document.querySelector(`[data-bg-title="${i}"]`)?.value||'';
    x.description=document.querySelector(`[data-bg-description="${i}"]`)?.value||'';
    x.details=(document.querySelector(`[data-bg-details="${i}"]`)?.value||'').split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
    x.note=document.querySelector(`[data-bg-note="${i}"]`)?.value||'';
    x.buttonLabel=document.querySelector(`[data-bg-button="${i}"]`)?.value||'';
  })
}
function render(){
$('scheduleFields').innerHTML=`<label class="wide"><span>작업 시작 기준 날짜</span><input id="scheduleDate" type="date" value="${S.scheduleDate||''}"><small class="field-note">공개 페이지에는 “현재 신청시 <b>월 일</b>부터 작업이 진행됩니다!”로 고정 표시됩니다. 설정 날짜가 오늘보다 과거가 되면 오늘 날짜로 자동 변경됩니다.</small></label>`;
$('noticeFields').innerHTML=input('공지 제목','noticeTitle',S.noticeTitle)+area('공지 안내 문구','noticeText',S.noticeText,true);
$('formFields').innerHTML=input('문의양식 제목','formTitle',S.formTitle)+area('문의양식 설명','formDescription',S.formDescription,true)+input('닉네임 항목','nicknameLabel',S.nicknameLabel)+input('닉네임 placeholder','nicknamePlaceholder',S.nicknamePlaceholder)+input('디자인 종류 항목','designTypeLabel',S.designTypeLabel)+input('틀 보관 항목','frameKeepLabel',S.frameKeepLabel)+area('틀 보관 설명','frameKeepDescription',S.frameKeepDescription,true)+input('컨셉 항목','conceptLabel',S.conceptLabel)+input('컨셉 placeholder','conceptPlaceholder',S.conceptPlaceholder)+input('추가 요청 항목','extraLabel',S.extraLabel)+input('추가 요청 placeholder','extraPlaceholder',S.extraPlaceholder)+input('복사 버튼','copyButton',S.copyButton)+input('복사 완료 문구','copySuccess',S.copySuccess)+input('움짤 틀 보관 O','frameKeepYes',S.frameKeepYes)+input('움짤 틀 보관 X','frameKeepNo',S.frameKeepNo)+input('시그풍 숫자 항목','signatureNumberLabel',S.signatureNumberLabel)+input('시그풍 숫자 placeholder','signatureNumberPlaceholder',S.signatureNumberPlaceholder)+input('시그풍 내용 항목','signatureContentLabel',S.signatureContentLabel)+input('시그풍 내용 placeholder','signatureContentPlaceholder',S.signatureContentPlaceholder);
$('portfolioTextFields').innerHTML=input('포트폴리오 제목','portfolioTitle',S.portfolioTitle,true);
$('footerFields').innerHTML=input('하단 문구','footerText',S.footerText,true);
renderNotices();renderTypes();renderCats();renderPresetCats();renderPresetGroups();renderBackgroundGuideAdmin();renderQuoteAdmin();$('presetEnabled').checked=!!S.presetEnabled;$('presetTitle').value=S.presetTitle||'미판매 프리셋';$('presetNotice').value=S.presetNotice||'';$('authorEnabled').checked=!!S.authorEnabled;$('authorText').value=S.authorText||'';$('authorFontSize').value=S.authorFontSize||15;$('eventsEnabled').checked=!!S.eventsEnabled;$('eventsKicker').value=S.eventsKicker||'EVENTS';$('eventsTitle').value=S.eventsTitle||'이벤트 안내';$('eventsText').value=S.eventsText||'';$('eventsTitleFontSize').value=S.eventsTitleFontSize||22;$('eventsFontSize').value=S.eventsFontSize||15;$('api').textContent=API;loadItems();}
function renderNotices(){$('notices').innerHTML=(S.noticeItems||[]).map((x,i)=>`<div class="editable"><div class="row"><input data-notice-icon="${i}" value="${x.icon||''}"><input data-notice-title="${i}" value="${x.title||''}"><button class="danger" data-del-notice="${i}">삭제</button></div><textarea data-notice-desc="${i}">${x.description||''}</textarea></div>`).join('');document.querySelectorAll('[data-del-notice]').forEach(b=>b.onclick=()=>{S.noticeItems.splice(+b.dataset.delNotice,1);renderNotices()})}
function renderTypes(){
  $('types').innerHTML=(S.designTypes||[]).map((x,i)=>`<div class="editable type-edit">
    <label class="type-name">디자인 이름<input data-type-label="${i}" value="${adminEsc(x.label||'')}"></label>
    <div class="type-options">
      <label><input type="checkbox" data-type-enabled="${i}" ${x.enabled!==false?'checked':''}> 공개</label>
      <label><input type="checkbox" data-type-frame="${i}" ${x.showFrameRetention?'checked':''}> 틀 보관</label>
      <label><input type="checkbox" data-type-sign="${i}" ${x.showSignatureFields?'checked':''}> 시그풍</label>
      <label><input type="checkbox" data-type-banner="${i}" ${x.showBannerFields?'checked':''}> 배너</label>
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
  const next=index+dir;
  if(next<0||next>=arr.length)return;
  [arr[index],arr[next]]=[arr[next],arr[index]];
  if(prefix==='cat')renderCats();else renderPresetCats()
}
function bindCategoryOrder(arr,prefix){
  document.querySelectorAll(`[data-move-${prefix}]`).forEach(b=>b.onclick=()=>moveCategory(arr,prefix,Number(b.getAttribute(`data-move-${prefix}`)),Number(b.dataset.dir)))
}
function renderCats(){
  $('cats').innerHTML=(S.portfolioCategories||[]).map((c,i)=>catRow(c,i,'cat')).join('');
  $('uploadCat').innerHTML=(S.portfolioCategories||[]).map(c=>`<option value="${adminEsc(c.id)}">${adminEsc(c.label)}</option>`).join('');
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

function collect(){document.querySelectorAll('[data-key]').forEach(e=>S[e.dataset.key]=e.value);(S.noticeItems||[]).forEach((x,i)=>{const icon=document.querySelector(`[data-notice-icon="${i}"]`),title=document.querySelector(`[data-notice-title="${i}"]`),desc=document.querySelector(`[data-notice-desc="${i}"]`);if(icon)x.icon=icon.value;if(title)x.title=title.value;if(desc)x.description=desc.value});(S.designTypes||[]).forEach((x,i)=>{const label=document.querySelector(`[data-type-label="${i}"]`),enabled=document.querySelector(`[data-type-enabled="${i}"]`),frame=document.querySelector(`[data-type-frame="${i}"]`),sign=document.querySelector(`[data-type-sign="${i}"]`),banner=document.querySelector(`[data-type-banner="${i}"]`),review=document.querySelector(`[data-type-review="${i}"]`);if(label)x.label=label.value;if(enabled)x.enabled=enabled.checked;if(frame)x.showFrameRetention=frame.checked;if(sign)x.showSignatureFields=sign.checked;if(banner)x.showBannerFields=banner.checked;if(review)x.showReviewEvent=review.checked})}
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
  S.eventsKicker=$('eventsKicker').value;
  S.eventsTitle=$('eventsTitle').value;
  S.eventsText=$('eventsText').value;
  S.eventsTitleFontSize=Number($('eventsTitleFontSize').value||22);
  S.eventsFontSize=Number($('eventsFontSize').value||15);
  collectCats(S.presetCategories||[],'preset');collectPresetGroups();
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
function capturePresetEditorValues(){
  (presetItems||[]).forEach((x,i)=>{
    const meta=presetMetaFor(x),name=document.querySelector(`[data-preset-name="${i}"]`),desc=document.querySelector(`[data-preset-desc="${i}"]`),enabled=document.querySelector(`[data-preset-enabled="${i}"]`),isNew=document.querySelector(`[data-preset-new="${i}"]`);
    ensurePresetMeta()[x.file]={
      name:name?name.value.trim():meta.name,
      description:desc?desc.value.trim():meta.description,
      enabled:enabled?enabled.checked:meta.enabled,
      isNew:isNew?isNew.checked:meta.isNew
    }
  })
}
async function saveMediaOrder(kind){
  const key=kind==='preset'?'presetOrder':'portfolioOrder',list=kind==='preset'?presetItems:items,order=list.map(x=>x.file);
  S[key]=order;
  const saved=await queueSettingsMutation(latest=>{latest[key]=order});
  S[key]=saved[key]||order;
  showToast('순서가 저장되었습니다.')
}
async function moveMediaItem(kind,index,dir){
  const list=kind==='preset'?presetItems:items,x=list[index];if(!x)return;
  if(kind==='preset')capturePresetEditorValues();
  const same=list.map((v,i)=>({v,i})).filter(o=>o.v.category===x.category),pos=same.findIndex(o=>o.i===index),next=pos+dir;
  if(next<0||next>=same.length)return;
  const target=same[next].i;
  [list[index],list[target]]=[list[target],list[index]];
  if(kind==='preset')renderPresetItems();else renderItems();
  try{await saveMediaOrder(kind)}catch(e){alert('순서 저장에 실패했습니다.\n'+e.message)}
}
async function loadItems(){try{const d=await api('/api/admin/portfolio');items=applyAdminOrder(d.items||[],S?.portfolioOrder);renderItems();const q=await api('/api/admin/presets').catch(()=>({items:[]}));const presetBase=[...(q.items||[])].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));presetItems=applyAdminOrder(presetBase,S?.presetOrder);renderPresetItems()}catch(e){$('uploadStatus').textContent=e.message}}
function presetLocationText(x){
  return (S.presetCategories||[]).find(c=>c.id===x.category)?.label||x.category||''
}
async function savePresetItem(i){
  const x=presetItems[i];if(!x)return;
  const meta=presetMetaFor(x),name=document.querySelector(`[data-preset-name="${i}"]`),desc=document.querySelector(`[data-preset-desc="${i}"]`),enabled=document.querySelector(`[data-preset-enabled="${i}"]`),isNew=document.querySelector(`[data-preset-new="${i}"]`);
  const entry={name:name?name.value.trim():meta.name,description:desc?desc.value.trim():meta.description,enabled:enabled?enabled.checked:meta.enabled,isNew:isNew?isNew.checked:meta.isNew};
  ensurePresetMeta()[x.file]=entry;

  const saved=await queueSettingsMutation(latest=>{
    if(!latest.presetMeta||typeof latest.presetMeta!=='object'||Array.isArray(latest.presetMeta))latest.presetMeta={};
    latest.presetMeta[x.file]=entry
  });
  S.presetMeta=saved.presetMeta||S.presetMeta||{};
  showToast('프리셋 정보가 저장되었습니다.');
  renderPresetItems()
}
function renderPresetItems(){
  $('presetItems').innerHTML=presetItems.map((x,i)=>{
    const meta=presetMetaFor(x),allowDesc=['profile','profile-b'].includes(x.category),same=presetItems.filter(v=>v.category===x.category),samePos=same.findIndex(v=>v.file===x.file);
    return `<div class="preset-admin-item">
      <img src="${API}/media/${x.file.split('/').map(encodeURIComponent).join('/')}" loading="lazy">
      <div class="preset-admin-fields">
        <div class="muted preset-location">${adminEsc(presetLocationText(x))}</div>
        <label>작은 표시 이름 · 선택<input data-preset-name="${i}" value="${adminEsc(meta.name)}" placeholder="예: 라벤더 체크"></label>
        ${allowDesc?`<label>짧은 설명 · 선택<input data-preset-desc="${i}" value="${adminEsc(meta.description)}" placeholder="예: 핑크 / 화이트 색상 변경 가능"></label>`:''}
        <label class="mini-toggle"><input type="checkbox" data-preset-enabled="${i}" ${meta.enabled?'checked':''}> 공개</label>
        <label class="mini-toggle"><input type="checkbox" data-preset-new="${i}" ${meta.isNew?'checked':''}> NEW 표시</label>
      </div>
      <div class="preset-admin-actions">
        <div class="media-order-controls">
          <button type="button" class="ghost cat-order-button" data-move-preset-item="${i}" data-dir="-1" ${samePos<=0?'disabled':''} title="위로 이동">↑</button>
          <button type="button" class="ghost cat-order-button" data-move-preset-item="${i}" data-dir="1" ${samePos>=same.length-1?'disabled':''} title="아래로 이동">↓</button>
        </div>
        <button class="ghost admin-compact" data-save-preset="${i}">정보 저장</button>
        <button class="danger" data-delete-preset="${encodeURIComponent(x.file)}">삭제</button>
      </div>
    </div>`
  }).join('')||'<p class="muted">등록된 프리셋이 없습니다.</p>';
  document.querySelectorAll('[data-move-preset-item]').forEach(b=>b.onclick=()=>moveMediaItem('preset',+b.dataset.movePresetItem,Number(b.dataset.dir)));
  document.querySelectorAll('[data-save-preset]').forEach(b=>b.onclick=()=>savePresetItem(+b.dataset.savePreset).catch(e=>alert(e.message)));
  document.querySelectorAll('[data-delete-preset]').forEach(b=>b.onclick=async()=>{if(!confirm('이 프리셋을 삭제할까요?'))return;const file=decodeURIComponent(b.dataset.deletePreset);delete ensurePresetMeta()[file];S.presetOrder=(S.presetOrder||[]).filter(x=>x!==file);await api('/api/admin/preset-delete',{method:'POST',body:JSON.stringify({file})});await queueSettingsMutation(latest=>{if(latest.presetMeta&&typeof latest.presetMeta==='object')delete latest.presetMeta[file];latest.presetOrder=(latest.presetOrder||[]).filter(x=>x!==file)}).catch(()=>{});loadItems()})
}

function renderItems(){
  $('items').innerHTML=items.map((x,i)=>{
    const same=items.filter(v=>v.category===x.category),samePos=same.findIndex(v=>v.file===x.file);
    return `<div class="item"><img src="${API}/media/${x.file.split('/').map(encodeURIComponent).join('/')}" loading="lazy"><div><strong>${adminEsc(x.originalName)}</strong><div class="muted">${adminEsc(x.category)}</div></div><div class="item-actions"><div class="media-order-controls"><button type="button" class="ghost cat-order-button" data-move-portfolio-item="${i}" data-dir="-1" ${samePos<=0?'disabled':''} title="위로 이동">↑</button><button type="button" class="ghost cat-order-button" data-move-portfolio-item="${i}" data-dir="1" ${samePos>=same.length-1?'disabled':''} title="아래로 이동">↓</button></div><button class="danger" data-delete="${encodeURIComponent(x.file)}">삭제</button></div></div>`
  }).join('');
  document.querySelectorAll('[data-move-portfolio-item]').forEach(b=>b.onclick=()=>moveMediaItem('portfolio',+b.dataset.movePortfolioItem,Number(b.dataset.dir)));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('이 작업물을 삭제할까요?'))return;const file=decodeURIComponent(b.dataset.delete);S.portfolioOrder=(S.portfolioOrder||[]).filter(x=>x!==file);await api('/api/admin/delete',{method:'POST',body:JSON.stringify({file})});await queueSettingsMutation(latest=>{latest.portfolioOrder=(latest.portfolioOrder||[]).filter(x=>x!==file)}).catch(()=>{});loadItems()})
}
async function uploadFiles(kind){
  const fileInput=kind==='preset'?$('presetFiles'):$('files'),cat=kind==='preset'?$('presetUploadCat').value:$('uploadCat').value,status=$(kind==='preset'?'presetUploadStatus':'uploadStatus'),files=[...fileInput.files];
  if(!files.length)return;
  try{
    for(let i=0;i<files.length;i++){
      status.textContent=`${i+1}/${files.length} 업로드 중…`;
      const fd=new FormData();fd.append('category',cat);fd.append('file',files[i]);
      const r=await fetch(API+(kind==='preset'?'/api/admin/preset-upload':'/api/admin/upload'),{method:'POST',credentials:'include',body:fd}),d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`)
    }
    status.textContent='업로드가 완료되었습니다.';fileInput.value='';await loadItems();showToast('업로드되었습니다.')
  }catch(e){status.textContent=e.message;alert('업로드에 실패했습니다.\n'+e.message)}
}
async function init(){let loggedIn=false;try{const s=await api('/api/admin/session');loggedIn=true;$('login').hidden=true;$('panel').hidden=false;$('userBox').hidden=false;$('userName').textContent=s.user.login;$('githubUser').textContent=s.user.login;try{const d=await api('/api/public/settings');S=d.settings;render()}catch(e){$('saveStatus').textContent='설정을 불러오지 못했습니다: '+e.message}}catch(e){$('login').hidden=false;$('panel').hidden=true}$('health').textContent='확인 중…';try{$('health').textContent=(await api('/health')).ok?'정상':'오류'}catch(e){$('health').textContent='연결 오류'}}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginError').textContent='';try{await api('/auth/login',{method:'POST',body:JSON.stringify({password:$('adminPassword').value})});location.reload()}catch(err){$('loginError').textContent=err.message}};$('logout').onclick=async()=>{await api('/auth/logout',{method:'POST'}).catch(()=>{});location.reload()};document.querySelectorAll('.admin-tabs .tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.admin-tabs .tab').forEach(x=>x.classList.remove('is-active'));b.classList.add('is-active');document.querySelectorAll('[data-section]').forEach(x=>x.hidden=x.dataset.section!==b.dataset.panel)});$('save').onclick=saveSettings;$('reload').onclick=loadItems;$('addNotice').onclick=()=>{S.noticeItems=[...(S.noticeItems||[]),{icon:'',title:'새 공지',description:'설명을 입력해 주세요.'}];renderNotices()};$('addType').onclick=()=>{S.designTypes=[...(S.designTypes||[]),{id:'type-'+Date.now(),label:'새 디자인',enabled:true,showFrameRetention:false,showSignatureFields:false,showBannerFields:false,showReviewEvent:false}];renderTypes()};$('addCat').onclick=()=>{S.portfolioCategories=[...(S.portfolioCategories||[]),{id:'new-category',label:'새 카테고리',enabled:true,displayWidth:200,displayHeight:200,strictSize:false,uploadWidth:0,uploadHeight:0,maxBytes:6291456,formats:['png','jpeg','gif','webp'],emptyText:'등록된 작업물이 아직 없습니다.'}];renderCats()};$('addPresetCat').onclick=()=>{S.presetCategories=[...(S.presetCategories||[]),{id:'new-preset',label:'새 프리셋',enabled:true,displayWidth:240,displayHeight:240,maxBytes:6291456,formats:['png','jpeg','gif','webp']}];renderPresetCats()};$('saveCats').onclick=saveSettings;$('savePresetCats').onclick=saveSettings;if($('saveQuoteConfig'))$('saveQuoteConfig').onclick=saveSettings;if($('addQuoteItem'))$('addQuoteItem').onclick=()=>{const q=ensureQuoteConfig();q.customItems.push({id:'q-'+Date.now(),name:'새 추가 항목',price:0});renderQuoteAdmin()};if($('copyQuote'))$('copyQuote').onclick=copyQuote;$('upload').onclick=()=>uploadFiles('portfolio');$('uploadPreset').onclick=()=>uploadFiles('preset');
async function siteUpload(kind,inputId){const file=$(inputId).files[0];if(!file)return;const fd=new FormData();fd.append('file',file);fd.append('kind',kind);try{await fetch(API+'/api/admin/site-image',{method:'POST',credentials:'include',body:fd}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d});const d=await api('/api/admin/settings');S=d.settings;render();showToast('이미지가 업로드되었습니다.')}catch(e){alert(e.message)}}
async function siteDelete(kind){if(!confirm('등록된 이미지를 삭제할까요?'))return;try{const d=await api('/api/admin/site-image/delete',{method:'POST',body:JSON.stringify({kind})});S=d.settings||S;render()}catch(e){alert(e.message)}}
$('uploadAbout').onclick=()=>siteUpload('about','aboutFile');$('deleteAbout').onclick=()=>siteDelete('about');
init();
