const C=window.ARTMUG_CONFIG||{};const API=C.API_BASE||'';const PER=Number(C.ITEMS_PER_PAGE||30);let S=null,portfolioState={category:'',page:1},presetState={category:'',page:1},requestSeq=0,scheduleCutoffTimer=0;const portfolioCache=new Map(),presetCache=new Map();const $=id=>document.getElementById(id);const esc=s=>String(s??'');
function initArtmugEmbedMode(){
  // Report content height for both the complete public page and split embed pages.
  if(window.parent===window)return;
  // Preserve a usable inner scrollbar if the host blocks parent resize scripts.
  // Hide inner scrolling only after the parent confirms it handles live height updates.

  const shell=document.querySelector('.site-shell');
  let raf=0;
  let settleTimer=0;
  let lastHeight=0;

  function actualContentHeight(){
    const target=shell||document.body;
    if(!target)return 0;

    const rect=target.getBoundingClientRect();
    const top=Math.max(0,Math.round(rect.top+window.scrollY));
    const bottom=Math.ceil(rect.bottom+window.scrollY);

    // Measure the real content box, not the iframe viewport. This allows shrinking
    // after dynamically-added inquiry sections are removed again.
    const boxHeight=Math.ceil(rect.height);
    const offsetHeight=Math.ceil(target.offsetHeight||0);
    return Math.max(1,bottom,top+boxHeight,top+offsetHeight);
  }

  function sectionTop(el){
    if(!el||el.hidden)return null;
    const r=el.getBoundingClientRect();
    return Math.max(0,Math.round(r.top+window.scrollY))
  }

  function sendHeight(force){
    if(window.parent===window)return;
    const height=actualContentHeight();
    const contentHeightChanged=height!==lastHeight;
    // Chrome 154+ supports native cross-origin responsive iframe sizing.
    // Recalculate only when the actual content height changes, avoiding resize loops.
    if(contentHeightChanged&&typeof window.requestResize==='function'){
      try{window.requestResize()}catch{}
    }
    if(!force&&!contentHeightChanged)return;
    lastHeight=height;

    const sections={
      top:0,
      notice:sectionTop(document.querySelector('.notice-card')),
      inquiry:sectionTop(document.getElementById('inquirySection')||document.querySelector('.form-card')),
      portfolio:sectionTop(document.getElementById('portfolioAllSectionV2')||document.getElementById('portfolioSection')),
      preset:sectionTop(document.getElementById('showcase-preset')||document.getElementById('showcaseSectionV2')||document.getElementById('presetSection'))
    };
    const role=document.body.classList.contains('artmug-part-inquiry')
      ?'inquiry'
      :document.body.classList.contains('artmug-part-portfolio')
        ?'portfolio'
        :'full';

    const heightPayload={
      type:'artmug-portfolio-height',
      height:height,
      role:role
    };
    const mapPayload={
      type:'artmug-section-map',
      height:height,
      sections:sections,
      role:role
    };

    try{window.parent.postMessage(heightPayload,'*')}catch{}
    try{window.parent.postMessage(mapPayload,'*')}catch{}
    try{
      if(window.top!==window.parent){
        window.top.postMessage(heightPayload,'*');
        window.top.postMessage(mapPayload,'*')
      }
    }catch{}
  }

  function report(force){
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>sendHeight(!!force));

    clearTimeout(settleTimer);
    settleTimer=window.setTimeout(()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>sendHeight(true))
    },80)
  }

  // Size changes from responsive layout, textarea resizing, images, etc.
  if('ResizeObserver'in window){
    const ro=new ResizeObserver(()=>report(false));
    ro.observe(shell||document.body);
    if(shell&&document.body!==shell)ro.observe(document.body);
    window.__artmugHeightResizeObserver=ro
  }

  // DOM additions/removals and conditional fields can change height before a
  // ResizeObserver notification settles, so observe mutations as well.
  if('MutationObserver'in window){
    const mo=new MutationObserver(()=>report(false));
    mo.observe(shell||document.body,{
      subtree:true,
      childList:true,
      characterData:true,
      attributes:true,
      attributeFilter:['hidden','class','style','open']
    });
    window.__artmugHeightMutationObserver=mo
  }

  // Capture lazy image/media completion without assigning per-element handlers.
  document.addEventListener('load',e=>{
    const t=e.target;
    if(t&&(/^(IMG|VIDEO|IFRAME)$/.test(t.tagName||'')))report(false)
  },true);

  window.addEventListener('resize',()=>report(true),{passive:true});
  window.addEventListener('orientationchange',()=>report(true),{passive:true});
  window.addEventListener('artmug-sections-changed',()=>report(true));
  window.addEventListener('message',e=>{
    const d=e&&e.data;
    if(d&&d.type==='artmug-request-section-map')report(true);
    if(d&&d.type==='artmug-parent-resize-ready'){
      document.documentElement.classList.add('artmug-embed-root');
      report(true)
    }
  });

  if(document.fonts&&document.fonts.ready){
    document.fonts.ready.then(()=>report(true)).catch(()=>{})
  }

  window.addEventListener('load',()=>{
    report(true);
    window.setTimeout(()=>report(true),250)
  },{once:true});

  report(true)
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initArtmugEmbedMode,{once:true});else initArtmugEmbedMode();

const ARTMUG_NAV_CHANNEL='artmug-portfolio-section-nav';
function artmugNavTarget(name){
  const body=document.body;
  const inquiryOnly=body&&body.classList.contains('artmug-part-inquiry');
  const portfolioOnly=body&&body.classList.contains('artmug-part-portfolio');

  if(portfolioOnly&&['top','notice','inquiry'].includes(name))return null;
  if(inquiryOnly&&['portfolio','preset'].includes(name))return null;

  const map={
    top:document.querySelector('.site-shell'),
    notice:document.querySelector('.notice-card'),
    inquiry:document.getElementById('inquirySection')||document.querySelector('.form-card'),
    portfolio:document.getElementById('portfolioAllSectionV2')||document.getElementById('portfolioSection'),
    showcase:document.getElementById('showcaseSectionV2'),
    preset:document.getElementById('showcase-preset')||document.getElementById('showcaseSectionV2')||document.getElementById('presetSection')
  };
  return map[name]||null
}
function navigateArtmugSection(name){
  const el=artmugNavTarget(name);
  if(!el||el.hidden)return false;

  const root=document.documentElement;
  if(root.classList.contains('artmug-embed-root'))root.classList.add('artmug-nav-programmatic');

  try{el.scrollIntoView({behavior:'auto',block:'start'})}catch{el.scrollIntoView()}

  window.setTimeout(()=>{
    root.classList.remove('artmug-nav-programmatic');
  },120);
  return true
}
function initArtmugSectionNavigation(){
  const sectionMap=[
    ['.site-shell','page-top'],
    ['.notice-card','notice-section'],
    ['#inquirySection','inquiry-section'],
    ['#portfolioAllSectionV2','portfolio-section'],
    ['#showcaseSectionV2','preset-section']
  ];
  sectionMap.forEach(([selector,id])=>{
    const el=document.querySelector(selector);
    if(el&&!el.id)el.id=id
  });

  if('BroadcastChannel' in window){
    const ch=new BroadcastChannel(ARTMUG_NAV_CHANNEL);
    ch.onmessage=e=>{
      const d=e&&e.data;
      if(d&&d.type==='navigate'&&d.target)navigateArtmugSection(String(d.target))
    };
    window.__artmugSectionNavChannel=ch
  }

  window.addEventListener('message',e=>{
    const d=e&&e.data;
    if(d&&d.type==='artmug-section-nav'&&d.target)navigateArtmugSection(String(d.target))
  });

  const hashTarget=String(location.hash||'').replace(/^#/,'');
  const hashMap={
    'page-top':'top',
    'notice-section':'notice',
    'inquiry-section':'inquiry',
    'portfolio-section':'portfolio',
    'preset-section':'preset'
  };
  if(hashMap[hashTarget])requestAnimationFrame(()=>navigateArtmugSection(hashMap[hashTarget]));
  window.addEventListener('hashchange',()=>{
    const key=String(location.hash||'').replace(/^#/,'');
    if(hashMap[key])navigateArtmugSection(hashMap[key])
  })
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initArtmugSectionNavigation,{once:true});else initArtmugSectionNavigation();
async function api(path,opt={}){const r=await fetch(API+path,{...opt,credentials:'include',headers:{'Content-Type':'application/json',...(opt.headers||{})}});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||`HTTP ${r.status}`);return r.json()}
function set(id,v){if($(id))$(id).textContent=esc(v)}
function media(path){return path?API+'/media/'+path.split('/').map(encodeURIComponent).join('/'):''}
function renderSettings(s){S=s;renderWorkStatus(s);set('scheduleTitle',s.scheduleTitle||'작업 일정 안내');renderSchedule(s);armScheduleCutoffRefresh();set('noticeTitle',s.noticeTitle);set('noticeText',s.noticeText||'');set('formTitle',s.formTitle);set('formDescription',s.formDescription);set('copyButton',s.copyButton);set('portfolioTitle',s.portfolioTitle);set('footerText',s.footerText);renderAuthorIntro(s);renderEvents(s);renderNotices(s.noticeItems||[]);renderInquiryForm();renderPreset(s);requestAnimationFrame(()=>window.dispatchEvent(new Event('artmug-sections-changed')))}
function renderWorkStatus(s){
  const box=$('workStatus');
  if(!box)return;
  const enabled=s.workStatusEnabled===true;
  const mode=s.workStatusMode==='sleeping'?'sleeping':'working';
  box.hidden=!enabled;
  box.dataset.status=mode;
  if(!enabled)return;

  const label=$('workStatusLabel');
  const description=$('workStatusDescription');
  if(label)label.textContent=mode==='sleeping'?'취침중':'작업중';

  const text=String(
    mode==='sleeping'
      ? (s.workStatusSleepingText??'현재 취침 중으로 문의 답변이 조금 늦을 수 있어요.')
      : (s.workStatusWorkingText??'')
  ).trim();

  if(description){
    description.textContent=text;
    description.hidden=!text;
  }
}
function koreaNowParts(){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
    hour:'2-digit',
    hourCycle:'h23'
  }).formatToParts(new Date());
  const o={};
  parts.forEach(x=>{if(x.type!=='literal')o[x.type]=x.value});
  return {
    date:`${o.year}-${o.month}-${o.day}`,
    hour:Number(o.hour||0)
  }
}
function addDaysYmd(ymd,days){
  const m=String(ymd||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return ymd;
  const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])+Number(days||0)));
  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth()+1).padStart(2,'0'),
    String(d.getUTCDate()).padStart(2,'0')
  ].join('-')
}
function koreaDate(){return koreaNowParts().date}
function msUntilNextKorea22(){
  const now=Date.now();
  const kst=new Date(now+9*60*60*1000);
  let target=Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
    13,0,0,100
  );
  if(target<=now)target+=24*60*60*1000;
  return Math.max(1000,target-now)
}
function armScheduleCutoffRefresh(){
  if(scheduleCutoffTimer)clearTimeout(scheduleCutoffTimer);
  scheduleCutoffTimer=setTimeout(function(){
    if(S)renderSchedule(S);
    armScheduleCutoffRefresh();
  },msUntilNextKorea22())
}
function renderSchedule(s){
  const card=document.querySelector('.schedule-card');
  const enabled=s.scheduleEnabled!==false;
  if(card)card.hidden=!enabled;
  if(!enabled)return;

  const now=koreaNowParts();
  const today=now.date;
  const minimumDate=now.hour>=22?addDaysYmd(today,1):today;
  const savedDate=/^\d{4}-\d{2}-\d{2}$/.test(s.scheduleDate||'')?s.scheduleDate:minimumDate;
  const chosen=savedDate<minimumDate?minimumDate:savedDate;
  const [,m,d]=chosen.split('-');
  const dateLabel=`${Number(m)}월 ${Number(d)}일`;
  const mode=['start','deadline','custom'].includes(s.scheduleMode)?s.scheduleMode:'start';
  const template=mode==='deadline'
    ? '현재 신청시 {date}까지 마감됩니다!'
    : mode==='custom'
      ? String(s.scheduleCustomText||'현재 신청시 {date}부터 작업이 진행됩니다!')
      : '현재 신청시 {date}부터 작업이 진행됩니다!';

  const dateHtml=`<strong class="schedule-date">${htmlAttr(dateLabel)}</strong>`;
  const main=mode==='start'
    ? `<span class="schedule-mobile-line schedule-mobile-line-1">현재 신청시 ${dateHtml}부터</span><span class="schedule-mobile-line schedule-mobile-line-2">작업이 진행됩니다!</span>`
    : mode==='deadline'
      ? `<span class="schedule-mobile-line schedule-mobile-line-1">현재 신청시 ${dateHtml}까지</span><span class="schedule-mobile-line schedule-mobile-line-2">마감됩니다!</span>`
      : htmlAttr(template).replaceAll('{date}',dateHtml);
  const extras=(Array.isArray(s.scheduleExtras)?s.scheduleExtras:[])
    .map(x=>String(x||'').trim())
    .filter(Boolean);

  $('scheduleText').innerHTML=
    `<span class="schedule-main-line">${main}</span>`+
    (extras.length?`<span class="schedule-extra-lines">${extras.map(x=>`<span class="schedule-extra-line">${htmlAttr(x)}</span>`).join('')}</span>`:'');

}
function renderAuthorIntro(s){const on=!!s.authorEnabled,sec=$('authorIntro');sec.hidden=!on;if(!on)return;const im=$('authorImage');if(s.aboutImage){im.src=media(s.aboutImage);im.hidden=false}else{im.removeAttribute('src');im.hidden=true}set('authorText',s.authorText||'');$('authorText').style.fontSize=(s.authorFontSize||15)+'px'}
function renderEvents(s){
  const on=!!s.eventsEnabled,sec=$('eventsSection');sec.hidden=!on;if(!on)return;
  set('eventsKicker',s.eventsKicker||'OPEN EVENT');
  set('eventsTitle',s.eventsTitle||'오픈 기념 이벤트 안내');
  const text=String(s.eventsText||'').trim();
  set('eventsText',text);
  $('eventsText').hidden=!text;
  $('eventsTitle').style.fontSize=(s.eventsTitleFontSize||22)+'px';
  $('eventsText').style.fontSize=(s.eventsFontSize||15)+'px';

  const offer=$('eventOffer');
  const items=(Array.isArray(s.eventsItems)?s.eventsItems:[]).map(x=>({
    label:String(x?.label||'').trim(),
    oldPrice:Number(x?.oldPrice||0),
    newPrice:Number(x?.newPrice||0)
  })).filter(x=>x.label&&x.oldPrice>0&&x.newPrice>0);
  const fmt=n=>new Intl.NumberFormat('ko-KR').format(Math.max(0,Math.round(n)));
  const discounts=items.map(x=>Math.max(0,x.oldPrice-x.newPrice)).filter(v=>v>0);
  const discount=discounts[0]||2000;
  const note=String(s.eventsNote||'※ 움짤프사 + 상단배너 둘 다 주문해도 중복 할인은 적용되지 않습니다.').trim();

  offer.hidden=!items.length;
  if(items.length){
    const rows=items.map(x=>`<div class="event-price-item"><span class="event-price-label">${htmlAttr(x.label)}</span><div class="event-price-row"><del>${fmt(x.oldPrice)}원</del><span class="event-price-arrow">→</span><b>${fmt(x.newPrice)}원</b></div></div>`).join('');
    offer.innerHTML=`<div class="event-offer-summary"><span>리뷰 작성 시</span><strong>${fmt(discount)}원 할인</strong></div><div class="event-price-list">${rows}</div>${note?`<p class="event-offer-note">${htmlAttr(note)}</p>`:''}`
  }else{
    offer.innerHTML=''
  }
}

function renderNotices(items){
  $('noticeItems').innerHTML=items.map((x,i)=>`
    <article class="notice-item">
      <div class="notice-item-head">
        <span class="notice-index">${String(i+1).padStart(2,'0')}</span>
        <strong class="notice-item-title">${esc(x.title)}</strong>
      </div>
      <p class="notice-item-description">${esc(x.description)}</p>
    </article>
  `).join('')
}

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
function inquiryQuantityOptions(t){
  const id=String(t?.id||''),label=String(t?.label||'').replace(/\s/g,'');
  if(id==='profile-a'||label.includes('움짤프사'))return [
    {key:'nameChangeQty',label:'프사 이름 변경'},
    {key:'gifChangeQty',label:'프사 움짤 변경'}
  ];
  if(t?.showBannerTextField===true||label.includes('상단배너')||label.includes('플로팅배너')||label.includes('하단배너'))return [
    {key:'textChangeQty',label:'배너 텍스트 변경'}
  ];
  return []
}
function inquiryQuantityOptionsForTypes(types){
  const seen=new Set(),out=[];
  (types||[]).forEach(t=>inquiryQuantityOptions(t).forEach(o=>{
    if(!seen.has(o.key)){seen.add(o.key);out.push(o)}
  }));
  return out
}
function htmlAttr(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function requiredLabel(text){return '<span class="field-label-row" data-question-title><span>'+htmlAttr(text)+'</span><small class="required-badge">필수</small></span>'}
function updateInquiryQuestionNumbers(){
  const form=document.querySelector('.contact-form');
  if(!form)return;
  let number=0;
  form.querySelectorAll('[data-question-title]').forEach(function(el){
    const hiddenParent=el.closest('[hidden]');
    const visible=!hiddenParent&&el.getClientRects().length>0;
    if(!visible){
      delete el.dataset.questionNumber;
      return;
    }
    el.dataset.questionNumber=String(++number);
  })
}

function renderInquiryForm(){
  set('nicknameLabel',S.nicknameLabel||'방송 닉네임 및 주소');
  const nicknameTitle=document.querySelector('.inquiry-nickname-field>.field-label-row');
  if(nicknameTitle)nicknameTitle.setAttribute('data-question-title','');
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
  if(addRow)addRow.hidden=true;

  if(!types.length){
    container.innerHTML='<div class="request-empty">현재 신청 가능한 디자인 종류가 없습니다.</div>';
    return;
  }

  var initial=types.length===1?[types[0].id]:[];
  addRequest(initial);
  requestAnimationFrame(updateInquiryQuestionNumbers);

  nickname.oninput=function(){
    if(String(nickname.value||'').trim()){
      nickname.classList.remove('is-required-missing');
      nickname.setAttribute('aria-invalid','false');
    }
    clearRequiredMessageIfComplete();
  };
}

function requestTypeOptions(selectedIds){
  selectedIds=Array.isArray(selectedIds)?selectedIds:[];
  return inquiryTypes().map(function(t){
    return '<label class="request-type-option"><input type="checkbox" data-field="requestType" value="'+htmlAttr(t.id)+'" '+(selectedIds.includes(t.id)?'checked':'')+'><span>'+htmlAttr(t.label)+'</span></label>';
  }).join('');
}

function selectedInquiryTypes(card){
  return Array.from(card.querySelectorAll('input[data-field="requestType"]:checked'))
    .map(input=>inquiryType(input.value))
    .filter(t=>t&&t.id)
}

function addRequest(typeIds){
  var types=inquiryTypes();
  if(!types.length)return;
  typeIds=Array.isArray(typeIds)?typeIds:[];
  if(types.length===1)typeIds=[types[0].id];

  var id=++requestSeq;
  var card=document.createElement('article');
  card.className='request-card request-card-combined';
  card.dataset.requestId=String(id);
  card.dataset.typeIds=typeIds.join(',');
  card.innerHTML=
    '<div class="request-type-selector '+(types.length===1?'is-single':'')+'">'+
      requiredLabel(S.designTypeLabel||'신청하시는 디자인 종류')+
      '<div class="request-type-options">'+requestTypeOptions(typeIds)+'</div>'+
    '</div>'+
    '<div class="inquiry-form-divider inquiry-form-divider-primary" aria-hidden="true"></div>'+
    '<div class="request-fields"></div>';

  $('requestsContainer').appendChild(card);

  card.querySelectorAll('input[data-field="requestType"]').forEach(function(input){
    input.onchange=function(){
      var prev=readRequestValues(card);
      var selected=Array.from(card.querySelectorAll('input[data-field="requestType"]:checked')).map(x=>x.value);
      card.dataset.typeIds=selected.join(',');
      card.querySelector('.request-type-selector').classList.remove('is-required-missing');
      renderRequestFields(card,selected,prev);
      clearRequiredMessageIfComplete();
    };
  });

  renderRequestFields(card,typeIds,{});
}

function updateRequestCardMeta(){}

function readRequestValues(card){
  function q(s){return card.querySelector(s)}
  function qa(s){return Array.from(card.querySelectorAll(s))}
  return{
    typeIds:qa('input[data-field="requestType"]:checked').map(function(x){return x.value}),
    signatureNumber:(q('[data-field="signatureNumber"]')||{}).value||'',
    signatureContent:(q('[data-field="signatureContent"]')||{}).value||'',
    frameKeep:(q('input[data-field="frameKeep"]:checked')||{}).value||'O',
    concept:(q('[data-field="concept"]')||{}).value||'',
    extra:(q('[data-field="extra"]')||{}).value||'',
    bannerText:(q('[data-field="bannerText"]')||{}).value||'',
    banners:qa('input[data-field="bannerType"]:checked').map(function(x){return x.value}),
    nameChangeQty:Math.max(0,Number((q('[data-field="nameChangeQty"]')||{}).value||0)),
    gifChangeQty:Math.max(0,Number((q('[data-field="gifChangeQty"]')||{}).value||0)),
    textChangeQty:Math.max(0,Number((q('[data-field="textChangeQty"]')||{}).value||0)),
    options:qa('input[data-field="extraOption"]:checked').map(function(x){return x.value})
  };
}

function renderRequestFields(card,typeIds,prev){
  prev=prev||{};
  typeIds=Array.isArray(typeIds)?typeIds:[];
  var fields=card.querySelector('.request-fields');
  var types=typeIds.map(inquiryType).filter(t=>t&&t.id);
  var rid=card.dataset.requestId;
  var has=function(key){return types.some(t=>t[key])};

  if(!types.length){
    fields.innerHTML='';
    requestAnimationFrame(updateInquiryQuestionNumbers);
    return;
  }

  var html='';

  html+='<label class="request-full-field inquiry-standard-field concept-request-field concept-color-combined-field">'+
    requiredLabel(S.conceptLabel||'원하는 디자인 컨셉 및 색상')+
    '<textarea data-field="concept" aria-required="true" placeholder="'+htmlAttr(S.conceptPlaceholder||'예: 하트, 귀여운 느낌, 민트·화이트·라벤더 조합')+'"></textarea>'+
  '</label>';

  if(has('showSignatureFields')){
    html+='<div class="signature-fields signature-inline-fields">'+
      '<label class="signature-inline-row"><span data-question-title>'+htmlAttr(S.signatureNumberLabel||'시그풍 숫자')+'</span><input data-field="signatureNumber" placeholder="'+htmlAttr(S.signatureNumberPlaceholder||'')+'"></label>'+
      '<label class="signature-inline-row"><span data-question-title>'+htmlAttr(S.signatureContentLabel||'시그풍 내용')+'</span><input data-field="signatureContent" placeholder="'+htmlAttr(S.signatureContentPlaceholder||'')+'"></label>'+
    '</div>';
  }

  if(has('showFrameRetention')){
    html+='<fieldset class="choice-field inquiry-plain-choice frame-retention-field">'+
      '<div class="choice-title-row frame-retention-title-row"><span class="inquiry-field-title" data-question-title>'+htmlAttr(S.frameKeepLabel||'움짤프사 파일 보관 여부')+'</span>'+
      '<span class="frame-retention-inline-help">'+htmlAttr(S.frameKeepDescription||'')+'</span></div>'+
      '<div class="choice-row">'+
        '<label class="choice-pill"><input data-field="frameKeep" name="frameKeep-'+rid+'" type="radio" value="O"><span>'+htmlAttr(S.frameKeepYes||'O')+'</span></label>'+
        '<label class="choice-pill"><input data-field="frameKeep" name="frameKeep-'+rid+'" type="radio" value="X"><span>'+htmlAttr(S.frameKeepNo||'X')+'</span></label>'+
      '</div>'+
    '</fieldset>';
  }

  if(has('showBannerFields')){
    var bannerValues=['하단 1칸','하단 3칸','하단 6칸'];
    html+='<div class="banner-fields"><fieldset class="choice-field inquiry-plain-choice"><legend data-question-title>하단 배너 종류</legend><p class="field-help">필요한 배너를 선택해주세요.</p><div class="check-grid">'+
      bannerValues.map(function(v){return '<label class="choice-pill"><input data-field="bannerType" type="checkbox" value="'+v+'"><span>'+v+'</span></label>'}).join('')+
      '</div></fieldset></div>';
  }

  if(has('showBannerTextField')){
    html+='<label class="request-full-field inquiry-standard-field banner-text-field"><span class="inquiry-field-title" data-question-title>배너 입력 문구</span>'+
      '<textarea data-field="bannerText" placeholder="'+htmlAttr(S.bannerTextPlaceholder||'예: 상단 배너 - 칠공\n플로팅 배너 - 노래책, 유튜브, 팬카페')+'"></textarea></label>';
  }

  html+='<div class="inquiry-form-divider inquiry-form-divider-secondary" aria-hidden="true"></div>';

  html+='<label class="request-full-field inquiry-standard-field"><span class="inquiry-field-title" data-question-title>'+htmlAttr(S.extraLabel||'추가 요청사항')+'</span><textarea data-field="extra" placeholder="'+htmlAttr(S.extraPlaceholder||'')+'"></textarea></label>';

  var qtyOptions=inquiryQuantityOptionsForTypes(types);
  var qtyHtml=qtyOptions.length?'<div class="inquiry-qty-options">'+qtyOptions.map(function(o){
    return '<div class="inquiry-qty-row"><span class="inquiry-qty-label">'+htmlAttr(o.label)+'</span><div class="inquiry-qty-control">'+
      '<button type="button" class="inquiry-qty-button" data-qty-field="'+htmlAttr(o.key)+'" data-qty-delta="-1" aria-label="'+htmlAttr(o.label)+' 수량 감소">−</button>'+
      '<input class="inquiry-qty-input" data-field="'+htmlAttr(o.key)+'" type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="'+htmlAttr(o.label)+' 수량">'+
      '<button type="button" class="inquiry-qty-button" data-qty-field="'+htmlAttr(o.key)+'" data-qty-delta="1" aria-label="'+htmlAttr(o.label)+' 수량 증가">+</button>'+
    '</div></div>'
  }).join('')+'</div>':'';

  html+='<fieldset class="choice-field inquiry-plain-choice option-field"><legend data-question-title>추가 옵션</legend>'+qtyHtml+'<div class="check-grid">'+
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

  ['nameChangeQty','gifChangeQty','textChangeQty'].forEach(function(key){
    var el=q('[data-field="'+key+'"]');
    if(el)el.value=String(Math.max(0,Math.floor(Number(prev[key]||0))))
  });

  qa('[data-qty-field]').forEach(function(btn){
    btn.onclick=function(){
      var input=q('[data-field="'+btn.dataset.qtyField+'"]');
      if(!input)return;
      var next=Math.max(0,Math.floor(Number(input.value||0))+Number(btn.dataset.qtyDelta||0));
      input.value=String(next)
    }
  });
  qa('.inquiry-qty-input').forEach(function(input){
    input.oninput=function(){if(Number(input.value)<0)input.value='0'};
    input.onblur=function(){input.value=String(Math.max(0,Math.floor(Number(input.value||0))))}
  });

  var frame=q('input[data-field="frameKeep"][value="'+(prev.frameKeep||'O')+'"]')||q('input[data-field="frameKeep"][value="O"]');
  if(frame)frame.checked=true;
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

  requestAnimationFrame(updateInquiryQuestionNumbers);
}

function requestText(card){
  var v=readRequestValues(card);
  var types=v.typeIds.map(inquiryType).filter(t=>t&&t.id);
  var has=function(key){return types.some(t=>t[key])};
  var info=[(S.designTypeLabel||'신청하시는 디자인 종류')+': '+types.map(t=>t.label||'').filter(Boolean).join(', ')];
  if(window.__ARTMUG_V2__&&typeof window.__ARTMUG_V2__.inquiryLines==='function'){
    info.push.apply(info,window.__ARTMUG_V2__.inquiryLines(card))
  }

  var details=[];
  var conceptEl=card.querySelector('[data-field="concept"]');
  var conceptHidden=!!conceptEl&&!!conceptEl.closest('.v2-hidden-field');
  if(!conceptHidden)details.push((S.conceptLabel||'원하는 디자인 컨셉 및 색상')+': '+v.concept);

  if(has('showSignatureFields')){
    details.push(S.signatureNumberLabel+': '+v.signatureNumber,S.signatureContentLabel+': '+v.signatureContent);
  }
  var frameEl=card.querySelector('.frame-retention-field');
  if(has('showFrameRetention')&&!(frameEl&&frameEl.classList.contains('v2-hidden-field')))details.push(S.frameKeepLabel+': '+v.frameKeep);
  if(has('showBannerFields')){
    details.push('하단 배너 종류: '+(v.banners.length?v.banners.join(', '):'선택 없음'));
  }
  if(has('showBannerTextField')){
    details.push('배너 입력 문구: '+v.bannerText);
  }

  var additional=[
    (S.extraLabel||'추가 요청사항')+': '+v.extra
  ];

  var extraOptions=[];
  if(v.nameChangeQty>0)extraOptions.push('프사 이름 변경 '+v.nameChangeQty+'개');
  if(v.gifChangeQty>0)extraOptions.push('프사 움짤 변경 '+v.gifChangeQty+'개');
  if(v.textChangeQty>0)extraOptions.push('배너 텍스트 변경 '+v.textChangeQty+'개');
  extraOptions.push.apply(extraOptions,v.options);
  if(extraOptions.length)additional.push('추가 옵션: '+extraOptions.join(', '));

  return [info.join('\n'),details.join('\n'),additional.join('\n')].filter(Boolean).join('\n\n');
}

function buildInquiryText(){
  var nickname=String($('nicknameInput').value||'').trim();
  var card=document.querySelector('.request-card');
  var request=card?requestText(card):'';
  var sections=[(S.nicknameLabel||'방송 닉네임 및 주소')+': '+nickname,request];
  var attachmentNotice='※ 작업에 사용되는 모든 이미지 및 동영상은 아트머그 <파일첨부>를 통해\n개별 첨부 또는 압축 파일로 전달 부탁드립니다.';
  sections.push(attachmentNotice);
  return sections.filter(Boolean).join('\n\n');
}

function validateRequiredInquiryFields(){
  var firstMissing=null;
  var customMessage='';
  var nickname=$('nicknameInput');
  var nicknameMissing=!String(nickname.value||'').trim();
  nickname.classList.toggle('is-required-missing',nicknameMissing);
  nickname.setAttribute('aria-invalid',nicknameMissing?'true':'false');
  if(nicknameMissing)firstMissing=nickname;

  document.querySelectorAll('.request-card').forEach(function(card){
    var selector=card.querySelector('.request-type-selector');
    var typeMissing=!selectedInquiryTypes(card).length;
    selector.classList.toggle('is-required-missing',typeMissing);
    if(typeMissing&&!firstMissing)firstMissing=selector.querySelector('input')||selector;

    var concept=card.querySelector('[data-field="concept"]');
    var conceptWrap=concept&&concept.closest('.concept-request-field');
    var conceptVisible=!!concept&&!(conceptWrap&&conceptWrap.classList.contains('v2-hidden-field'));
    if(conceptVisible){
      var missing=!String(concept.value||'').trim();
      concept.classList.toggle('is-required-missing',missing);
      concept.setAttribute('aria-invalid',missing?'true':'false');
      if(missing&&!firstMissing)firstMissing=concept;
    }else if(concept){
      concept.classList.remove('is-required-missing');
      concept.setAttribute('aria-invalid','false');
    }

    if(window.__ARTMUG_V2__&&typeof window.__ARTMUG_V2__.validateCard==='function'){
      var r=window.__ARTMUG_V2__.validateCard(card);
      if(r&&!r.ok&&!firstMissing){
        customMessage=r.message||'필수 항목을 확인해주세요.';
        firstMissing=card.querySelector('.v2-product-select')||card.querySelector('.v2-inquiry-enhancements')||card
      }
    }
  });

  if(firstMissing){
    $('copyStatus').textContent=customMessage||'필수 항목을 확인해주세요.';
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
    if(!selectedInquiryTypes(card).length)return false;
    var concept=card.querySelector('[data-field="concept"]');
    var conceptWrap=concept&&concept.closest('.concept-request-field');
    if(concept&&!(conceptWrap&&conceptWrap.classList.contains('v2-hidden-field'))&&!String(concept.value||'').trim())return false;
    if(window.__ARTMUG_V2__&&typeof window.__ARTMUG_V2__.validateCard==='function'){
      var r=window.__ARTMUG_V2__.validateCard(card);if(r&&!r.ok)return false
    }
    return true;
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
    isNew:saved.isNew===true,
    isReserved:saved.isReserved===true,
    colorChangeAvailable:saved.colorChangeAvailable===true
  }
}
function renderPreset(s){
  const on=!!s.presetEnabled,sec=$('presetSection');
  sec.hidden=!on;
  set('presetTitle',s.presetTitle||'프리셋');
  const notice=$('presetNotice'),noticeText=String(s.presetNotice||'').trim();
  notice.textContent=noticeText;
  notice.hidden=!noticeText;
  if(!on)return;
  const cats=visibleCats(s.presetCategories||[]);
  if(!presetState.category||!cats.some(c=>c.id===presetState.category))presetState.category=cats[0]?.id||'';
  renderPresetTabs(cats);
  loadPresets()
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
function portfolioLayout(c={}){const w=Number(c.uploadWidth||0),h=Number(c.uploadHeight||0),label=String(c.label||'').replace(/\s/g,'');if(c.id==='top-banner'||w===2320&&h===338||label.includes('상단배너'))return'top-banner';if(w===80&&h===209||label.includes('플로팅'))return'floating-banner';if(w===720&&h===150||label.includes('하단배너일반'))return'bottom-banner';if(c.id==='bottom-split'||label.includes('하단배너분할'))return'bottom-split';if(c.id==='four-cut'||w===1200&&h===1800||label.includes('인생네컷'))return'four-cut';if(w===293&&h===165||label.includes('시그'))return'signature';if(w===200&&h===200||label.includes('움짤프사')||/^profile(?:-|$)/.test(String(c.id||'')))return'profile';return'default'}
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
function setupBottomSplitGrid(g){
  if(!g)return;
  const cards=Array.from(g.querySelectorAll('.work-card'));
  const arrange=()=>{
    let leftRow=0,rightRow=0;
    cards.forEach(card=>{
      const slot=card.dataset.bottomSplitSlot||'';
      if(slot==='left'){
        card.style.gridColumn='1';
        card.style.gridRow=String(++leftRow)
      }else if(slot==='right'){
        card.style.gridColumn='2';
        card.style.gridRow=String(++rightRow)
      }
    })
  };
  cards.forEach(card=>{
    const img=card.querySelector('img');
    if(!img)return;
    const classify=()=>{
      const w=Number(img.naturalWidth||0),h=Number(img.naturalHeight||0);
      let slot='';
      if(w===720&&h===450)slot='left';
      else if(w===1440&&h===450)slot='right';
      else if(w&&h)slot=(w/h>2.4?'right':'left');
      if(!slot)return;
      card.dataset.bottomSplitSlot=slot;
      arrange()
    };
    if(img.complete&&img.naturalWidth)classify();
    else img.addEventListener('load',classify,{once:true})
  })
}
function grid(items,cat){
  const c=(S?.portfolioCategories||[]).find(x=>x.id===cat)||{},g=$('portfolioGrid'),layout=portfolioLayout(c);
  g.className='portfolio-grid layout-'+layout;
  g.style.setProperty('--display-width',`${c.displayWidth||200}px`);
  g.style.setProperty('--display-height',`${c.displayHeight||200}px`);
  g.innerHTML=items.length?items.map(x=>{
    const src=x.demoSrc||media(x.file);
    return `<article class="work-card portfolio-work-card"><div class="work-button protected-media-button"><div class="media-wrap"><img src="${esc(src)}" alt="${esc(x.alt||x.originalName)}" loading="lazy" draggable="false"></div></div></article>`
  }).join(''):`<div class="empty-state">현재 포트폴리오 준비 중입니다!</div>`;
  if(layout==='bottom-split')setupBottomSplitGrid(g);
  protectMedia()
}
function presetGrid(items,cat){
  const c=(S?.presetCategories||[]).find(x=>x.id===cat)||{},g=$('presetGrid'),layout=portfolioLayout(c);
  g.className='portfolio-grid preset-grid'+(['top-banner','bottom-split','four-cut'].includes(layout)?' layout-'+layout:'');
  g.dataset.layout=layout;
  g.innerHTML=items.length?items.map(x=>{
    const meta=presetMetaForItem(x),rep=x.demoSrc||media(x.file);
    const name=meta.name.trim()?`<strong class="preset-card-name">${esc(meta.name.trim())}</strong>`:'';
    const colorNote=meta.colorChangeAvailable?'<span class="preset-color-change-note">수정가능</span>':'';
    const badgeType=meta.isReserved?'reserved':meta.isNew?'new':'';
    const badgeText=badgeType==='reserved'?'예약중':badgeType==='new'?'NEW':'';
    const mobileBadge=badgeType?`<span class="preset-status-badge preset-${badgeType}-badge">${badgeText}</span>`:'';
    const desktopBadge=badgeType?`<span class="preset-inline-status-badge preset-inline-${badgeType}-badge">${badgeText}</span>`:'';
    return `<article class="work-card preset-work-card">${mobileBadge}<div class="work-button protected-media-button"><div class="media-wrap"><img src="${esc(rep)}" alt="${esc(meta.name||'프리셋')}" loading="lazy" decoding="async" draggable="false"></div></div><div class="preset-card-copy"><div class="preset-name-row">${name}${desktopBadge}</div>${colorNote}</div></article>`
  }).join(''):`<div class="empty-state">${esc(c.emptyText||'등록된 프리셋이 아직 없습니다.')}</div>`;
  if(layout==='bottom-split')setupBottomSplitGrid(g);
  protectMedia()
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
    all=[...all].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
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
    const first=await api('/api/public/presets?category='+encodeURIComponent(category)+'&page=1&perPage=60');
    let all=[...(first.items||[])];
    const count=Number(first.totalPages||1);
    if(count>1){
      const more=await Promise.all(Array.from({length:count-1},(_,i)=>api('/api/public/presets?category='+encodeURIComponent(category)+'&page='+(i+2)+'&perPage=60').catch(()=>({items:[]}))));
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
    all=[...all].sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
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
