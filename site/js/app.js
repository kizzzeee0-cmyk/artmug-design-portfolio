const C=window.ARTMUG_CONFIG||{};const API=C.API_BASE||'';const PER=Number(C.ITEMS_PER_PAGE||30);let S=null,portfolioState={category:'',page:1},presetState={category:'',page:1},requestSeq=0;const $=id=>document.getElementById(id);const esc=s=>String(s??'');
async function api(path,opt={}){const r=await fetch(API+path,{...opt,credentials:'include',headers:{'Content-Type':'application/json',...(opt.headers||{})}});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||`HTTP ${r.status}`);return r.json()}
function set(id,v){if($(id))$(id).textContent=esc(v)}
function media(path){return path?API+'/media/'+path.split('/').map(encodeURIComponent).join('/'):''}
function renderSettings(s){S=s;set('scheduleTitle',s.scheduleTitle||'작업 일정 안내');renderSchedule(s);set('noticeTitle',s.noticeTitle);set('noticeText',s.noticeText||'');set('formTitle',s.formTitle);set('formDescription',s.formDescription);set('copyButton',s.copyButton);set('portfolioTitle',s.portfolioTitle);set('footerText',s.footerText);renderAuthorIntro(s);renderEvents(s);renderNotices(s.noticeItems||[]);renderInquiryForm();renderPreset(s)}
function koreaDate(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const o={};parts.forEach(x=>{if(x.type!=='literal')o[x.type]=x.value});return `${o.year}-${o.month}-${o.day}`}
function renderSchedule(s){const today=koreaDate(),chosen=/^\d{4}-\d{2}-\d{2}$/.test(s.scheduleDate||'')?s.scheduleDate:today,effective=chosen>today?chosen:today,[y,m,d]=effective.split('-');$('scheduleText').innerHTML=`현재 신청시 <strong class="schedule-date">${Number(m)}월 ${Number(d)}일</strong>부터 순차적으로 작업이 진행됩니다!`}
function renderAuthorIntro(s){const on=!!s.authorEnabled,sec=$('authorIntro');sec.hidden=!on;if(!on)return;const im=$('authorImage');if(s.aboutImage){im.src=media(s.aboutImage);im.hidden=false}else{im.removeAttribute('src');im.hidden=true}set('authorText',s.authorText||'');$('authorText').style.fontSize=(s.authorFontSize||15)+'px'}
function renderEvents(s){const on=!!s.eventsEnabled,sec=$('eventsSection');sec.hidden=!on;if(!on)return;set('eventsKicker',s.eventsKicker||'EVENTS');set('eventsTitle',s.eventsTitle||'이벤트 안내');set('eventsText',s.eventsText||'');$('eventsTitle').style.fontSize=(s.eventsTitleFontSize||20)+'px';$('eventsText').style.fontSize=(s.eventsFontSize||15)+'px'}
function renderNotices(items){$('noticeItems').innerHTML=items.map(x=>`<article class="notice-item"><div class="notice-icon">${esc(x.icon||'')}</div><div><strong class="notice-item-title">${esc(x.title)}</strong><p class="notice-item-description">${esc(x.description)}</p></div></article>`).join('')}
function visibleCats(xs){return (xs||[]).filter(function(x){return x.enabled!==false})}
function inquiryTypes(){return visibleCats((S&&S.designTypes)||[])}
function inquiryType(id){return ((S&&S.designTypes)||[]).find(function(x){return x.id===id})||{}}
function htmlAttr(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function requiredLabel(text){return '<span class="field-label-row"><span>'+htmlAttr(text)+'</span><small class="required-badge">필수</small></span>'}

function renderInquiryForm(){
  set('nicknameLabel',S.nicknameLabel||'방송 닉네임 및 주소');
  var nickname=$('nicknameInput');
  nickname.placeholder=S.nicknamePlaceholder||'';
  nickname.value='';
  nickname.classList.remove('is-required-missing');
  nickname.setAttribute('aria-invalid','false');

  var container=$('requestsContainer');
  container.innerHTML='';
  requestSeq=0;

  var types=inquiryTypes();
  var addRow=$('requestAddRow');
  addRow.hidden=types.length<2;
  $('addRequestButton').onclick=function(){addRequest('')};

  if(!types.length){
    container.innerHTML='<div class="request-empty">현재 신청 가능한 디자인 종류가 없습니다.</div>';
    return;
  }

  addRequest(types.length===1?types[0].id:'');
  nickname.oninput=function(){
    if(String(nickname.value||'').trim()){
      nickname.classList.remove('is-required-missing');
      nickname.setAttribute('aria-invalid','false');
    }
    clearRequiredMessageIfComplete();
  };
}

function requestTypeOptions(requestId,selectedId){
  return inquiryTypes().map(function(t){
    return '<label class="request-type-option"><input type="radio" name="requestType-'+requestId+'" value="'+htmlAttr(t.id)+'" '+(t.id===selectedId?'checked':'')+'><span>'+htmlAttr(t.label)+'</span></label>';
  }).join('');
}

function addRequest(typeId){
  var types=inquiryTypes();
  if(!types.length)return;
  typeId=typeId||'';
  if(types.length===1)typeId=types[0].id;

  var id=++requestSeq;
  var card=document.createElement('article');
  card.className='request-card';
  card.dataset.requestId=String(id);
  card.dataset.typeId=typeId;
  card.innerHTML=
    '<div class="request-card-head">'+
      '<span class="request-seq"></span>'+
      '<button class="request-remove" type="button" aria-label="신청 항목 삭제">×</button>'+
    '</div>'+
    '<div class="request-type-selector '+(types.length===1?'is-single':'')+'">'+
      requiredLabel(S.designTypeLabel||'신청하시는 디자인 종류')+
      '<div class="request-type-options">'+requestTypeOptions(id,typeId)+'</div>'+
    '</div>'+
    '<div class="request-fields"></div>';

  $('requestsContainer').appendChild(card);

  card.querySelectorAll('input[name^="requestType-"]').forEach(function(input){
    input.onchange=function(){
      var prev=readRequestValues(card);
      card.dataset.typeId=input.value;
      card.querySelector('.request-type-selector').classList.remove('is-required-missing');
      renderRequestFields(card,input.value,prev);
      clearRequiredMessageIfComplete();
    };
  });

  card.querySelector('.request-remove').onclick=function(){
    card.remove();
    updateRequestCardMeta();
    clearRequiredMessageIfComplete();
  };

  renderRequestFields(card,typeId,{});
  updateRequestCardMeta();
}

function updateRequestCardMeta(){
  var cards=Array.from(document.querySelectorAll('.request-card'));
  cards.forEach(function(card,i){
    var head=card.querySelector('.request-card-head');
    var seq=card.querySelector('.request-seq');
    var multi=cards.length>1;
    head.hidden=!multi;
    seq.textContent=multi?'신청 항목 '+String(i+1).padStart(2,'0'):'';
    card.querySelector('.request-remove').hidden=!multi;
  });
}

function readRequestValues(card){
  function q(s){return card.querySelector(s)}
  function qa(s){return Array.from(card.querySelectorAll(s))}
  return{
    typeId:card.dataset.typeId||'',
    signatureNumber:(q('[data-field="signatureNumber"]')||{}).value||'',
    signatureContent:(q('[data-field="signatureContent"]')||{}).value||'',
    frameKeep:(q('input[data-field="frameKeep"]:checked')||{}).value||'O',
    concept:(q('[data-field="concept"]')||{}).value||'',
    extra:(q('[data-field="extra"]')||{}).value||'',
    bannerText:(q('[data-field="bannerText"]')||{}).value||'',
    banners:qa('input[data-field="bannerType"]:checked').map(function(x){return x.value}),
    review:(q('input[data-field="reviewEvent"]:checked')||{}).value||'미참여',
    options:qa('input[data-field="extraOption"]:checked').map(function(x){return x.value})
  };
}

function renderRequestFields(card,typeId,prev){
  prev=prev||{};
  var fields=card.querySelector('.request-fields');
  var t=inquiryType(typeId);
  var rid=card.dataset.requestId;

  if(!typeId||!t.id){
    fields.innerHTML='';
    return;
  }

  var html='';
  if(t.showSignatureFields){
    html+='<div class="signature-fields signature-inline-fields">'+
      '<label class="signature-inline-row"><span>'+htmlAttr(S.signatureNumberLabel||'시그풍 숫자')+'</span><input data-field="signatureNumber" placeholder="'+htmlAttr(S.signatureNumberPlaceholder||'')+'"></label>'+
      '<label class="signature-inline-row"><span>'+htmlAttr(S.signatureContentLabel||'시그풍 내용')+'</span><input data-field="signatureContent" placeholder="'+htmlAttr(S.signatureContentPlaceholder||'')+'"></label>'+
    '</div>';
  }

  if(t.showFrameRetention){
    html+='<fieldset class="choice-field"><legend>'+htmlAttr(S.frameKeepLabel||'틀 보관 여부')+'</legend><p class="field-help preline">'+htmlAttr(S.frameKeepDescription||'')+'</p><div class="choice-row">'+
      '<label class="choice-pill"><input data-field="frameKeep" name="frameKeep-'+rid+'" type="radio" value="O"><span>'+htmlAttr(S.frameKeepYes||'O')+'</span></label>'+
      '<label class="choice-pill"><input data-field="frameKeep" name="frameKeep-'+rid+'" type="radio" value="X"><span>'+htmlAttr(S.frameKeepNo||'X')+'</span></label>'+
    '</div></fieldset>';
  }

  html+='<label class="request-full-field">'+requiredLabel(S.conceptLabel||'원하는 디자인 컨셉 및 색상')+'<textarea data-field="concept" aria-required="true" placeholder="'+htmlAttr(S.conceptPlaceholder||'')+'"></textarea></label>';
  html+='<label class="request-full-field"><span>'+htmlAttr(S.extraLabel||'추가 요청사항')+'</span><textarea data-field="extra" placeholder="'+htmlAttr(S.extraPlaceholder||'')+'"></textarea></label>';

  if(t.showBannerFields){
    var bannerValues=['상단','플로팅','하단 1칸','하단 3칸','하단 6칸'];
    html+='<div class="banner-fields"><fieldset class="choice-field"><legend>신청 배너 종류</legend><p class="field-help">필요한 배너를 모두 체크해 주세요.</p><div class="check-grid">'+
      bannerValues.map(function(v){return '<label class="choice-pill"><input data-field="bannerType" type="checkbox" value="'+v+'"><span>'+v+'</span></label>'}).join('')+
      '</div></fieldset><label class="request-full-field"><span>배너 입력 문구</span><textarea data-field="bannerText" placeholder="배너에 들어갈 문구를 적어주세요."></textarea></label></div>';
  }

  if(t.showReviewEvent){
    html+='<fieldset class="choice-field review-event-field"><legend>리뷰이벤트 참여 여부</legend><div class="choice-row">'+
      '<label class="choice-pill"><input data-field="reviewEvent" name="reviewEvent-'+rid+'" type="radio" value="참여"><span>참여</span></label>'+
      '<label class="choice-pill"><input data-field="reviewEvent" name="reviewEvent-'+rid+'" type="radio" value="미참여"><span>미참여</span></label>'+
    '</div></fieldset>';
  }

  html+='<fieldset class="choice-field option-field"><legend>추가 옵션</legend><p class="field-help">해당되는 항목이 있을 경우 체크해 주세요.</p><div class="check-grid">'+
    '<label class="choice-pill"><input data-field="extraOption" type="checkbox" value="당일마감"><span>당일마감</span></label>'+
    '<label class="choice-pill"><input data-field="extraOption" type="checkbox" value="빠른 마감"><span>빠른 마감</span></label>'+
    '<label class="choice-pill"><input data-field="extraOption" type="checkbox" value="포트폴리오 비공개"><span>포트폴리오 비공개</span></label>'+
  '</div></fieldset>';

  fields.innerHTML=html;

  function q(s){return card.querySelector(s)}
  function qa(s){return Array.from(card.querySelectorAll(s))}
  if(q('[data-field="signatureNumber"]'))q('[data-field="signatureNumber"]').value=prev.signatureNumber||'';
  if(q('[data-field="signatureContent"]'))q('[data-field="signatureContent"]').value=prev.signatureContent||'';
  if(q('[data-field="concept"]'))q('[data-field="concept"]').value=prev.concept||'';
  if(q('[data-field="extra"]'))q('[data-field="extra"]').value=prev.extra||'';
  if(q('[data-field="bannerText"]'))q('[data-field="bannerText"]').value=prev.bannerText||'';

  var frame=q('input[data-field="frameKeep"][value="'+(prev.frameKeep||'O')+'"]')||q('input[data-field="frameKeep"][value="O"]');
  if(frame)frame.checked=true;
  var review=q('input[data-field="reviewEvent"][value="'+(prev.review||'미참여')+'"]')||q('input[data-field="reviewEvent"][value="미참여"]');
  if(review)review.checked=true;
  qa('input[data-field="bannerType"]').forEach(function(x){x.checked=(prev.banners||[]).includes(x.value)});
  qa('input[data-field="extraOption"]').forEach(function(x){x.checked=(prev.options||[]).includes(x.value)});

  var concept=q('[data-field="concept"]');
  if(concept)concept.oninput=function(){
    if(String(concept.value||'').trim()){
      concept.classList.remove('is-required-missing');
      concept.setAttribute('aria-invalid','false');
    }
    clearRequiredMessageIfComplete();
  };
}

function requestText(card){
  var t=inquiryType(card.dataset.typeId);
  var v=readRequestValues(card);
  var lines=[(S.designTypeLabel||'신청하시는 디자인 종류')+': '+(t.label||'')];

  if(t.showSignatureFields){
    lines.push(S.signatureNumberLabel+': '+v.signatureNumber,S.signatureContentLabel+': '+v.signatureContent);
  }
  if(t.showFrameRetention)lines.push(S.frameKeepLabel+': '+v.frameKeep);
  if(t.showBannerFields){
    lines.push('신청 배너 종류: '+(v.banners.length?v.banners.join(', '):'선택 없음'),'배너 입력 문구: '+v.bannerText);
  }

  lines.push(S.conceptLabel+': '+v.concept,S.extraLabel+': '+v.extra);
  if(t.showReviewEvent)lines.push('리뷰이벤트 참여 여부: '+v.review);
  lines.push('추가 옵션: '+(v.options.length?v.options.join(', '):'선택 없음'));
  return lines.join('\n');
}

function buildInquiryText(){
  var nickname=String($('nicknameInput').value||'').trim();
  var blocks=Array.from(document.querySelectorAll('.request-card')).map(requestText);
  return (S.nicknameLabel||'방송 닉네임 및 주소')+': '+nickname+'\n'+blocks.join('\n\n------------------------------\n\n');
}

function validateRequiredInquiryFields(){
  var firstMissing=null;
  var nickname=$('nicknameInput');
  var nicknameMissing=!String(nickname.value||'').trim();
  nickname.classList.toggle('is-required-missing',nicknameMissing);
  nickname.setAttribute('aria-invalid',nicknameMissing?'true':'false');
  if(nicknameMissing)firstMissing=nickname;

  document.querySelectorAll('.request-card').forEach(function(card){
    var selector=card.querySelector('.request-type-selector');
    var typeMissing=!card.dataset.typeId;
    selector.classList.toggle('is-required-missing',typeMissing);
    if(typeMissing&&!firstMissing)firstMissing=selector.querySelector('input')||selector;

    var concept=card.querySelector('[data-field="concept"]');
    if(concept){
      var missing=!String(concept.value||'').trim();
      concept.classList.toggle('is-required-missing',missing);
      concept.setAttribute('aria-invalid',missing?'true':'false');
      if(missing&&!firstMissing)firstMissing=concept;
    }
  });

  if(firstMissing){
    $('copyStatus').textContent='필수 항목을 확인해주세요.';
    if(typeof firstMissing.focus==='function')firstMissing.focus();
    if(firstMissing.scrollIntoView)firstMissing.scrollIntoView({behavior:'smooth',block:'center'});
    return false;
  }
  $('copyStatus').textContent='';
  return true;
}

function allRequiredInquiryFieldsFilled(){
  if(!String($('nicknameInput').value||'').trim())return false;
  var cards=Array.from(document.querySelectorAll('.request-card'));
  return !!cards.length&&cards.every(function(card){
    var concept=card.querySelector('[data-field="concept"]');
    return !!card.dataset.typeId&&!!String((concept&&concept.value)||'').trim();
  });
}

function clearRequiredMessageIfComplete(){
  if(allRequiredInquiryFieldsFilled())$('copyStatus').textContent='';
}
function renderPreset(s){const on=!!s.presetEnabled;$('presetSection').hidden=!on;set('presetTitle',s.presetTitle||'미판매 프리셋');set('presetNotice',s.presetNotice||'');if(on){const cats=visibleCats(s.presetCategories||[]);if(!presetState.category||!cats.some(c=>c.id===presetState.category))presetState.category=cats[0]?.id||'';renderPresetTabs(cats);loadPresets()}}
function renderPresetTabs(cats){cats=visibleCats(cats);if(!presetState.category||!cats.some(c=>c.id===presetState.category))presetState.category=cats[0]?.id||'';$('presetTabs').innerHTML=cats.map(c=>`<button class="tab ${c.id===presetState.category?'is-active':''}" data-preset-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('');$('presetTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{presetState.category=b.dataset.presetCat;presetState.page=1;renderPresetTabs(cats);loadPresets()})}
function renderPortfolioTabs(cats){cats=visibleCats(cats);if(!portfolioState.category||!cats.some(c=>c.id===portfolioState.category))portfolioState.category=cats[0]?.id||'';const tabs=$('portfolioTabs');tabs.hidden=cats.length<=1;tabs.innerHTML=cats.map(c=>`<button class="tab ${c.id===portfolioState.category?'is-active':''}" data-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('');tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{portfolioState.category=b.dataset.cat;portfolioState.page=1;renderPortfolioTabs(cats);loadPortfolio()})}
function portfolioLayout(c={}){const w=Number(c.uploadWidth||0),h=Number(c.uploadHeight||0),label=String(c.label||'').replace(/\s/g,'');if(w===2320&&h===338||label.includes('상단배너'))return'top-banner';if(w===80&&h===209||label.includes('플로팅'))return'floating-banner';if(w===720&&h===150||label.includes('하단배너일반'))return'bottom-banner';if(w===720&&h===450||label.includes('하단배너분할'))return'bottom-split';if(w===293&&h===165||label.includes('시그'))return'signature';if(w===200&&h===200||label.includes('움짤프사'))return'profile';return'default'}
function grid(items,cat,empty='등록된 작업물이 아직 없습니다.'){const c=(S?.portfolioCategories||[]).find(x=>x.id===cat)||{},g=$('portfolioGrid'),layout=portfolioLayout(c);g.className='portfolio-grid layout-'+layout;g.style.setProperty('--display-width',`${c.displayWidth||200}px`);g.style.setProperty('--display-height',`${c.displayHeight||200}px`);g.innerHTML=items.length?items.map(x=>`<article class="work-card"><button class="work-button" data-image="${esc(x.demoSrc||media(x.file))}"><div class="media-wrap"><img src="${esc(x.demoSrc||media(x.file))}" alt="${esc(x.alt||x.originalName)}" loading="lazy"></div></button></article>`).join(''):`<div class="empty-state">${esc(c.emptyText||empty)}</div>`;bindLightboxes()}
function presetGrid(items,cat){const c=(S?.presetCategories||[]).find(x=>x.id===cat)||{},g=$('presetGrid'),layout=portfolioLayout(c);g.className='portfolio-grid layout-'+layout;g.style.setProperty('--display-width',`${c.displayWidth||240}px`);g.style.setProperty('--display-height',`${c.displayHeight||240}px`);g.innerHTML=items.length?items.map(x=>`<article class="work-card"><button class="work-button" data-image="${esc(x.demoSrc||media(x.file))}"><div class="media-wrap"><img src="${esc(x.demoSrc||media(x.file))}" alt="${esc(x.originalName||'프리셋')}" loading="lazy"></div></button></article>`).join(''):`<div class="empty-state">등록된 프리셋이 아직 없습니다.</div>`;bindLightboxes()}
function pages(el,total,current,fn){el.innerHTML=total>1?Array.from({length:total},(_,i)=>`<button class="page-button ${i+1===current?'is-active':''}" data-page="${i+1}">${i+1}</button>`).join(''):'';el.querySelectorAll('button').forEach(b=>b.onclick=()=>fn(Number(b.dataset.page)))}
async function loadPortfolio(){try{$('portfolioStatus').textContent='불러오는 중…';const d=await api(`/api/public/portfolio?category=${encodeURIComponent(portfolioState.category)}&page=${portfolioState.page}&perPage=${PER}`);grid(d.items||[],portfolioState.category);$('portfolioStatus').textContent=d.total?`${d.total}개의 작업물`:'';pages($('pagination'),d.totalPages||1,d.page||1,p=>{portfolioState.page=p;loadPortfolio()})}catch(e){$('portfolioStatus').textContent='포트폴리오를 불러오지 못했습니다.'}}
async function loadPresets(){try{$('presetStatus').textContent='불러오는 중…';const d=await api(`/api/public/presets?category=${encodeURIComponent(presetState.category)}&page=${presetState.page}&perPage=${PER}`);presetGrid(d.items||[],presetState.category);$('presetStatus').textContent=d.total?`${d.total}개의 프리셋`:'';pages($('presetPagination'),d.totalPages||1,d.page||1,p=>{presetState.page=p;loadPresets()})}catch(e){$('presetStatus').textContent='프리셋을 불러오지 못했습니다.'}}
function bindLightboxes(){document.querySelectorAll('[data-image]').forEach(b=>b.onclick=()=>{const d=$('lightbox');$('lightboxImage').src=b.dataset.image;d.showModal()})}
function showCopied(btn,text='✓ 복사 완료'){const original=btn.textContent;btn.classList.add('is-copied');btn.textContent=text;setTimeout(()=>{btn.classList.remove('is-copied');btn.textContent=original},1800)}
async function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){
    try{await navigator.clipboard.writeText(text);return true}catch{}
  }
  const ta=document.createElement('textarea');
  ta.value=text;
  ta.setAttribute('readonly','');
  ta.style.position='fixed';
  ta.style.left='-9999px';
  ta.style.top='0';
  ta.style.opacity='0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0,ta.value.length);
  let ok=false;
  try{ok=document.execCommand('copy')}catch{}
  ta.remove();
  return ok
}
$('lightboxClose').onclick=()=>$('lightbox').close();
$('copyButton').onclick=async()=>{
  if(!validateRequiredInquiryFields())return;
  const btn=$('copyButton'),ok=await copyText(buildInquiryText());
  if(ok){$('copyStatus').textContent='';showCopied(btn)}
  else{$('copyStatus').textContent='복사에 실패했습니다.'}
};
(async()=>{try{const d=await api('/api/public/settings');renderSettings(d.settings);renderPortfolioTabs(visibleCats(S.portfolioCategories||[]));loadPortfolio()}catch(e){$('portfolioStatus').textContent='설정을 불러오지 못했습니다.'}})();
