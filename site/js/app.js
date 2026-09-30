const C=window.ARTMUG_CONFIG||{};const API=C.API_BASE||'';const PER=Number(C.ITEMS_PER_PAGE||30);let S=null,portfolioState={category:'',page:1},presetState={category:'',page:1},requestSeq=0;const portfolioCache=new Map(),presetCache=new Map();const $=id=>document.getElementById(id);const esc=s=>String(s??'');
const PRESET_COLORS=[
  {id:'pink',label:'핑크',hex:'#f39abb'},
  {id:'red',label:'빨강',hex:'#e85c62'},
  {id:'orange',label:'주황',hex:'#f29a52'},
  {id:'yellow',label:'노랑',hex:'#f2cf58'},
  {id:'green',label:'초록',hex:'#67b979'},
  {id:'blue',label:'파랑',hex:'#69a9df'},
  {id:'navy',label:'남색',hex:'#5066a8'},
  {id:'purple',label:'보라',hex:'#9389de'},
  {id:'black',label:'검정',hex:'#34343b'}
];
async function api(path,opt={}){const r=await fetch(API+path,{...opt,credentials:'include',headers:{'Content-Type':'application/json',...(opt.headers||{})}});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||`HTTP ${r.status}`);return r.json()}
function set(id,v){if($(id))$(id).textContent=esc(v)}
function media(path){return path?API+'/media/'+path.split('/').map(encodeURIComponent).join('/'):''}
function renderSettings(s){S=s;set('scheduleTitle',s.scheduleTitle||'작업 일정 안내');renderSchedule(s);set('noticeTitle',s.noticeTitle);set('noticeText',s.noticeText||'');set('formTitle',s.formTitle);set('formDescription',s.formDescription);set('copyButton',s.copyButton);set('portfolioTitle',s.portfolioTitle);set('footerText',s.footerText);renderAuthorIntro(s);renderEvents(s);renderNotices(s.noticeItems||[]);renderInquiryForm();renderPreset(s)}
function koreaDate(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const o={};parts.forEach(x=>{if(x.type!=='literal')o[x.type]=x.value});return `${o.year}-${o.month}-${o.day}`}
function renderSchedule(s){const today=koreaDate(),chosen=/^\d{4}-\d{2}-\d{2}$/.test(s.scheduleDate||'')?s.scheduleDate:today,effective=chosen>today?chosen:today,[y,m,d]=effective.split('-');$('scheduleText').innerHTML=`현재 신청시 <strong class="schedule-date">${Number(m)}월 ${Number(d)}일</strong>부터 작업이 진행됩니다!`}
function renderAuthorIntro(s){const on=!!s.authorEnabled,sec=$('authorIntro');sec.hidden=!on;if(!on)return;const im=$('authorImage');if(s.aboutImage){im.src=media(s.aboutImage);im.hidden=false}else{im.removeAttribute('src');im.hidden=true}set('authorText',s.authorText||'');$('authorText').style.fontSize=(s.authorFontSize||15)+'px'}
function renderEvents(s){const on=!!s.eventsEnabled,sec=$('eventsSection');sec.hidden=!on;if(!on)return;set('eventsKicker',s.eventsKicker||'EVENTS');set('eventsTitle',s.eventsTitle||'이벤트 안내');set('eventsText',s.eventsText||'');$('eventsTitle').style.fontSize=(s.eventsTitleFontSize||20)+'px';$('eventsText').style.fontSize=(s.eventsFontSize||15)+'px'}
function renderNotices(items){$('noticeItems').innerHTML=items.map(x=>`<article class="notice-item"><div class="notice-icon">${esc(x.icon||'')}</div><div><strong class="notice-item-title">${esc(x.title)}</strong><p class="notice-item-description">${esc(x.description)}</p></div></article>`).join('')}

function guideDefaults(){
  return {
    enabled:true,kicker:'PROFILE OPTIONS',title:'움짤 프사 옵션 구성',subtitle:'',
    options:[
      {key:'a',badge:'A',title:'기본 움짤 프사',description:'원하시는 색상과 키워드를 바탕으로, 분위기에 어울리는 디자인 요소를 더해 제작하는 방식입니다.',details:['간단한 키워드만 전달해 주셔도 전체적인 무드에 맞춰 오마카세 형식으로 제작해드립니다.'],note:'',referenceImage:'',buttonLabel:'디자인 보러가기',targetKind:'portfolio',targetCategory:'profile'},
      {key:'b',badge:'B',title:'심플형 움짤 프사',description:'체크, 도트, 땡땡이, 그라데이션 등 비교적 간단한 패턴 배경이나 직접 제작한 고정형 프리셋을 활용해 제작하는 방식입니다.',details:['색상은 원하는 분위기에 맞게 자유롭게 변경 가능합니다.'],note:'프리셋에 없는 무늬나 패턴도 원하시는 느낌이 있다면 편하게 문의해 주세요.',referenceImage:'',buttonLabel:'디자인 보러가기',targetKind:'preset',targetCategory:'profile'}
    ]
  }
}
function renderBackgroundGuide(s){
  const sec=$('backgroundTypeSection');if(!sec)return;
  const d=guideDefaults(),raw=s.backgroundGuide&&typeof s.backgroundGuide==='object'?s.backgroundGuide:{},g={...d,...raw};
  g.options=d.options.map((base,i)=>({...base,...((raw.options||[])[i]||{})}));
  sec.hidden=g.enabled===false;
  if(sec.hidden)return;
  set('backgroundGuideKicker',g.kicker||'');
  set('backgroundGuideTitle',g.title||'움짤 프사 옵션 구성');
  set('backgroundGuideSubtitle',g.subtitle||'배경 디자인 유형');
  const grid=$('backgroundTypeGrid');
  grid.innerHTML=g.options.map((x,i)=>{
    const details=(Array.isArray(x.details)?x.details:[]).filter(Boolean);
    const targetAvailable=x.targetKind==='preset'
      ? !!s.presetEnabled&&visibleCats(s.presetCategories||[]).some(c=>c.id===x.targetCategory)
      : visiblePortfolioCats(s.portfolioCategories||[]).some(c=>c.id===x.targetCategory);
    const referencePath=x.referenceImage||(i===0?s.comparisonAImage:s.comparisonBImage)||'';
    const reference=referencePath?`<div class="background-type-reference"><img src="${esc(media(referencePath))}" alt="${htmlAttr(x.title||'')} 참고 움" loading="lazy"></div>`:'';
    return `<article class="background-type-card">
      <span class="background-type-letter">${htmlAttr(x.badge||String.fromCharCode(65+i))}</span>
      <h3>${htmlAttr(x.title||'')}</h3>
      <div class="background-type-content ${reference?'has-reference':''}">
        ${reference}
        ${x.description?`<p class="background-type-description">${htmlAttr(x.description)}</p>`:''}
        <div class="background-type-secondary">
          ${details.length?`<ul class="background-type-details">${details.map(v=>`<li>${htmlAttr(v)}</li>`).join('')}</ul>`:''}
          ${x.note?`<p class="background-type-note">${htmlAttr(x.note)}</p>`:''}
        </div>
      </div>
      <button type="button" class="background-type-jump" data-guide-kind="${htmlAttr(x.targetKind||'')}" data-guide-category="${htmlAttr(x.targetCategory||'')}" ${targetAvailable?'':'disabled'}>${htmlAttr(x.buttonLabel||'디자인 보기')}</button>
    </article>`
  }).join('');
  grid.querySelectorAll('[data-guide-kind]').forEach(b=>b.onclick=()=>jumpToGuideTarget(b.dataset.guideKind,b.dataset.guideCategory))
}
function jumpToGuideTarget(kind,category){
  if(kind==='preset'){
    const cats=visibleCats(S?.presetCategories||[]);
    if(!cats.some(c=>c.id===category)||!S?.presetEnabled)return;
    presetState.category=category;presetState.page=1;
    renderPresetTabs(cats);loadPresets();
    requestAnimationFrame(()=>$('presetSection')?.scrollIntoView({behavior:'smooth',block:'start'}));
    return
  }
  if(kind==='portfolio'){
    const cats=visiblePortfolioCats(S?.portfolioCategories||[]);
    if(!cats.some(c=>c.id===category))return;
    portfolioState.category=category;portfolioState.page=1;
    renderPortfolioTabs(cats);loadPortfolio();
    requestAnimationFrame(()=>$('portfolioSection')?.scrollIntoView({behavior:'smooth',block:'start'}))
  }
}
function visibleCats(xs){return (xs||[]).filter(function(x){return x.enabled!==false})}
function visiblePortfolioCats(xs){
  return visibleCats(xs).filter(x=>x.id!=='profile-b'&&x.id!=='profile-c'&&!x.hiddenLegacy)
}
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
function parsePresetOriginalName(name){
  const raw=String(name||''),m=raw.match(/^__PG_(.+?)__PM_(.+?)__(.+)$/);
  return m?{cleanName:m[3]}:{cleanName:raw}
}
function presetMetaForItem(x){
  const saved=(S?.presetMeta&&S.presetMeta[x.file])||{};
  return {
    name:String(saved.name||''),
    enabled:saved.enabled!==undefined?saved.enabled:x.enabled!==false,
    isNew:saved.isNew===true
  }
}
function presetColorStateFor(x){
  const raw=(S?.presetColorMeta&&S.presetColorMeta[x.file])||{};
  return {
    enabled:raw.enabled&&typeof raw.enabled==='object'?raw.enabled:{},
    images:raw.images&&typeof raw.images==='object'?raw.images:{}
  }
}
function presetVariantFileSet(){
  const set=new Set(Array.isArray(S?.presetVariantFiles)?S.presetVariantFiles:[]);
  const all=S?.presetColorMeta&&typeof S.presetColorMeta==='object'?S.presetColorMeta:{};
  Object.values(all).forEach(v=>Object.values(v?.images||{}).forEach(path=>{if(path)set.add(path)}));
  return set
}
function renderPreset(s){
  const on=!!s.presetEnabled,sec=$('presetSection');
  sec.hidden=!on;
  set('presetTitle',s.presetTitle||'고정틀 프리셋');
  const notice=$('presetNotice'),noticeText=String(s.presetNotice||'').trim();
  notice.textContent=noticeText;
  notice.hidden=!noticeText;
  if(!on)return;
  const cats=visibleCats(s.presetCategories||[]);
  if(!presetState.category||!cats.some(c=>c.id===presetState.category))presetState.category=cats[0]?.id||'';
  renderPresetTabs(cats);
  loadPresets();
  prefetchPresetCategories(cats)
}
function updateTabWrapState(tabs){
  if(!tabs||tabs.hidden)return;
  const buttons=[...tabs.querySelectorAll('button')];
  if(buttons.length<2){tabs.classList.remove('is-multiline');return}
  requestAnimationFrame(()=>{
    const firstTop=buttons[0]?.offsetTop;
    tabs.classList.toggle('is-multiline',buttons.some(b=>b.offsetTop!==firstTop))
  });
  if(!tabs.dataset.wrapObserved&&'ResizeObserver' in window){
    tabs.dataset.wrapObserved='1';
    new ResizeObserver(()=>updateTabWrapState(tabs)).observe(tabs)
  }
}
function renderPresetTabs(cats){
  cats=visibleCats(cats);
  const tabs=$('presetTabs');
  tabs.hidden=cats.length<=1;
  tabs.innerHTML=cats.map(c=>`<button class="tab ${c.id===presetState.category?'is-active':''}" data-preset-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('');
  updateTabWrapState(tabs);
  tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    presetState.category=b.dataset.presetCat;
    presetState.page=1;
    renderPresetTabs(cats);
    loadPresets()
  })
}
function renderPortfolioTabs(cats){cats=visiblePortfolioCats(cats);if(!portfolioState.category||!cats.some(c=>c.id===portfolioState.category))portfolioState.category=cats[0]?.id||'';const tabs=$('portfolioTabs');tabs.hidden=cats.length<=1;tabs.innerHTML=cats.map(c=>`<button class="tab ${c.id===portfolioState.category?'is-active':''}" data-cat="${esc(c.id)}">${esc(c.label)}</button>`).join('');updateTabWrapState(tabs);tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>{portfolioState.category=b.dataset.cat;portfolioState.page=1;renderPortfolioTabs(cats);loadPortfolio()})}
function portfolioLayout(c={}){const w=Number(c.uploadWidth||0),h=Number(c.uploadHeight||0),label=String(c.label||'').replace(/\s/g,'');if(w===2320&&h===338||label.includes('상단배너'))return'top-banner';if(w===80&&h===209||label.includes('플로팅'))return'floating-banner';if(w===720&&h===150||label.includes('하단배너일반'))return'bottom-banner';if(w===720&&h===450||label.includes('하단배너분할'))return'bottom-split';if(w===293&&h===165||label.includes('시그'))return'signature';if(w===200&&h===200||label.includes('움짤프사')||/^profile(?:-|$)/.test(String(c.id||'')))return'profile';return'default'}
function portfolioMetaForItem(x){
  const saved=(S?.portfolioMeta&&S.portfolioMeta[x.file])||{};
  return {profileType:['A','B'].includes(saved.profileType)?saved.profileType:''}
}
function applyManualOrder(items,order){
  if(!Array.isArray(order)||!order.length)return [...items];
  const pos=new Map(order.map((file,i)=>[file,i]));
  return [...items].sort((a,b)=>{
    const ai=pos.has(a.file)?pos.get(a.file):Number.MAX_SAFE_INTEGER;
    const bi=pos.has(b.file)?pos.get(b.file):Number.MAX_SAFE_INTEGER;
    return ai-bi
  })
}
function grid(items,cat,empty='등록된 작업물이 아직 없습니다.'){
  const c=(S?.portfolioCategories||[]).find(x=>x.id===cat)||{},g=$('portfolioGrid'),layout=portfolioLayout(c);
  g.className='portfolio-grid layout-'+layout;
  g.style.setProperty('--display-width',`${c.displayWidth||200}px`);
  g.style.setProperty('--display-height',`${c.displayHeight||200}px`);
  g.innerHTML=items.length?items.map(x=>{
    const src=x.demoSrc||media(x.file);
    return `<article class="work-card portfolio-work-card"><button class="work-button protected-media-button" data-image="${esc(src)}"><div class="media-wrap"><img src="${esc(src)}" alt="${esc(x.alt||x.originalName)}" loading="lazy" draggable="false"></div></button></article>`
  }).join(''):`<div class="empty-state">${esc(c.emptyText||empty)}</div>`;
  bindLightboxes()
}
function presetGrid(items,cat){
  const c=(S?.presetCategories||[]).find(x=>x.id===cat)||{},g=$('presetGrid');
  g.className='portfolio-grid preset-grid';
  g.innerHTML=items.length?items.map(x=>{
    const meta=presetMetaForItem(x),state=presetColorStateFor(x),rep=x.demoSrc||media(x.file);
    const colors=PRESET_COLORS.filter(col=>state.enabled[col.id]===true&&state.images[col.id]);
    const chips=colors.length?`<div class="preset-color-chips" aria-label="지원 색상">${colors.map(col=>{
      const src=media(state.images[col.id]);
      return `<button type="button" class="preset-color-chip" data-preset-color="${col.id}" data-color-src="${esc(src)}" style="--chip:${col.hex}" title="${col.label}" aria-label="${col.label}"><span></span></button>`
    }).join('')}</div>`:'';
    const name=meta.name.trim()?`<strong class="preset-card-name">${esc(meta.name.trim())}</strong>`:'';
    const badge=meta.isNew?'<span class="preset-new-badge">NEW</span>':'';
    return `<article class="work-card preset-work-card" data-representative-src="${esc(rep)}">${badge}<button class="work-button protected-media-button" data-image="${esc(rep)}"><div class="media-wrap"><img src="${esc(rep)}" alt="${esc(meta.name||'프리셋')}" loading="lazy" draggable="false"></div></button><div class="preset-card-copy">${name}${chips}</div></article>`
  }).join(''):`<div class="empty-state">${esc(c.emptyText||'등록된 프리셋이 아직 없습니다.')}</div>`;

  g.querySelectorAll('[data-preset-color]').forEach(btn=>btn.onclick=()=>{
    const card=btn.closest('.preset-work-card'),img=card?.querySelector('.media-wrap img'),viewer=card?.querySelector('.work-button');
    if(!card||!img||!viewer)return;
    const wasSelected=btn.classList.contains('is-selected');
    card.querySelectorAll('[data-preset-color]').forEach(x=>x.classList.remove('is-selected'));
    const src=wasSelected?card.dataset.representativeSrc:btn.dataset.colorSrc;
    if(!wasSelected)btn.classList.add('is-selected');
    img.src=src;viewer.dataset.image=src
  });
  bindLightboxes()
}
function pages(el,total,current,fn){el.innerHTML=total>1?Array.from({length:total},(_,i)=>`<button class="page-button ${i+1===current?'is-active':''}" data-page="${i+1}">${i+1}</button>`).join(''):'';el.querySelectorAll('button').forEach(b=>b.onclick=()=>fn(Number(b.dataset.page)))}
function portfolioCacheKey(category,page){return category+'::'+page}
function getPortfolioPage(category,page){
  const key=portfolioCacheKey(category,page);
  if(!portfolioCache.has(key)){
    portfolioCache.set(key,api(`/api/public/portfolio?category=${encodeURIComponent(category)}&page=${page}&perPage=${PER}`).catch(e=>{portfolioCache.delete(key);throw e}))
  }
  return portfolioCache.get(key)
}
function fetchPhysicalPortfolio(category){
  const allKey='physical::'+category;
  if(portfolioCache.has(allKey))return portfolioCache.get(allKey);
  const promise=(async()=>{
    const first=await getPortfolioPage(category,1);
    let all=[...(first.items||[])];
    const count=Number(first.totalPages||1);
    if(count>1){
      const more=await Promise.all(Array.from({length:count-1},(_,i)=>getPortfolioPage(category,i+2).catch(()=>({items:[]}))));
      more.forEach(d=>all.push(...(d.items||[])))
    }
    return all
  })().catch(e=>{portfolioCache.delete(allKey);throw e});
  portfolioCache.set(allKey,promise);
  return promise
}
function fetchAllPortfolio(category){
  const allKey='all::'+category;
  if(portfolioCache.has(allKey))return portfolioCache.get(allKey);
  const promise=(async()=>{
    if(category==='profile'){
      const groups=await Promise.all(['profile','profile-b','profile-c'].map(c=>fetchPhysicalPortfolio(c).catch(()=>[])));
      const seen=new Set(),all=[];
      groups.flat().forEach(x=>{if(x?.file&&!seen.has(x.file)){seen.add(x.file);all.push(x)}});
      return all
    }
    return fetchPhysicalPortfolio(category)
  })().catch(e=>{portfolioCache.delete(allKey);throw e});
  portfolioCache.set(allKey,promise);
  return promise
}
function prefetchPortfolioCategories(cats){
  (cats||[]).forEach(c=>{if(c.id!==portfolioState.category)fetchAllPortfolio(c.id).catch(()=>{})})
}
async function loadPortfolio(){
  try{
    const allKey='all::'+portfolioState.category;
    if(!portfolioCache.has(allKey))$('portfolioStatus').textContent='불러오는 중…';
    let all=await fetchAllPortfolio(portfolioState.category);
    all=applyManualOrder(all,S?.portfolioOrder);
    const total=all.length,totalPages=Math.max(1,Math.ceil(total/PER)),page=Math.min(Math.max(1,portfolioState.page),totalPages),items=all.slice((page-1)*PER,page*PER);
    portfolioState.page=page;
    grid(items,portfolioState.category);
    $('portfolioStatus').textContent='';
    pages($('pagination'),totalPages,page,p=>{portfolioState.page=p;loadPortfolio()})
  }catch(e){$('portfolioStatus').textContent='포트폴리오를 불러오지 못했습니다.'}
}
function fetchAllPresets(category){
  if(presetCache.has(category))return presetCache.get(category);
  const promise=(async()=>{
    const first=await api('/api/public/presets?category='+encodeURIComponent(category)+'&page=1&perPage=30');
    let all=[...(first.items||[])];
    const count=Number(first.totalPages||1);
    if(count>1){
      const more=await Promise.all(Array.from({length:count-1},(_,i)=>api('/api/public/presets?category='+encodeURIComponent(category)+'&page='+(i+2)+'&perPage=30').catch(()=>({items:[]}))));
      more.forEach(d=>all.push(...(d.items||[])))
    }
    return all
  })().catch(e=>{presetCache.delete(category);throw e});
  presetCache.set(category,promise);
  return promise
}
function prefetchPresetCategories(cats){
  (cats||[]).forEach(c=>{if(c.id!==presetState.category)fetchAllPresets(c.id).catch(()=>{})})
}
async function loadPresets(){
  try{
    if(!presetCache.has(presetState.category))$('presetStatus').textContent='불러오는 중…';
    let all=await fetchAllPresets(presetState.category);
    const variants=presetVariantFileSet();
    all=all.filter(x=>!variants.has(x.file));
    all=applyManualOrder(all,S?.presetOrder);
    all=all.filter(x=>presetMetaForItem(x).enabled);
    const total=all.length,totalPages=Math.max(1,Math.ceil(total/PER)),page=Math.min(Math.max(1,presetState.page),totalPages),items=all.slice((page-1)*PER,page*PER);
    presetState.page=page;
    presetGrid(items,presetState.category);
    $('presetStatus').textContent='';
    pages($('presetPagination'),totalPages,page,p=>{presetState.page=p;loadPresets()})
  }catch(e){$('presetStatus').textContent='프리셋을 불러오지 못했습니다.'}
}
function protectMedia(root=document){
  root.querySelectorAll?.('#portfolioGrid img,#presetGrid img,#lightboxImage').forEach(img=>{
    img.draggable=false;
    img.setAttribute('draggable','false');
    img.oncontextmenu=e=>{e.preventDefault();return false};
    img.ondragstart=e=>{e.preventDefault();return false}
  })
}
function bindLightboxes(){
  document.querySelectorAll('[data-image]').forEach(b=>b.onclick=()=>{
    const d=$('lightbox'),im=$('lightboxImage');im.src=b.dataset.image;im.draggable=false;d.showModal();protectMedia(d)
  });
  protectMedia()
}
document.addEventListener('contextmenu',e=>{
  if(e.target.closest?.('#portfolioGrid,#presetGrid,#lightbox'))e.preventDefault()
});
document.addEventListener('dragstart',e=>{
  if(e.target.closest?.('#portfolioGrid,#presetGrid,#lightbox'))e.preventDefault()
});
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
(async()=>{try{const d=await api('/api/public/settings');renderSettings(d.settings);const cats=visiblePortfolioCats(S.portfolioCategories||[]);renderPortfolioTabs(cats);loadPortfolio();prefetchPortfolioCategories(cats)}catch(e){$('portfolioStatus').textContent='설정을 불러오지 못했습니다.'}})();
