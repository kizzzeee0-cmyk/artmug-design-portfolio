const C=window.ARTMUG_CONFIG||{};const API=C.API_BASE||'';const PER=Number(C.ITEMS_PER_PAGE||30);let S=null,portfolioState={category:'',page:1},presetState={category:'',page:1},requestSeq=0,scheduleCutoffTimer=0,publicQuoteQty={},availabilityCalendarView=null;const portfolioCache=new Map(),presetCache=new Map();const $=id=>document.getElementById(id);const esc=s=>String(s??'');
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

  if(portfolioOnly&&['top','schedule','notice','calendar','inquiry'].includes(name))return null;
  if(inquiryOnly&&['portfolio','preset'].includes(name))return null;

  const map={
    top:document.querySelector('.site-shell'),
    schedule:document.querySelector('.schedule-card'),
    calendar:document.getElementById('availabilityCalendarSection')||document.querySelector('.availability-calendar-card'),
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
    ['.schedule-card','schedule-section'],
    ['#availabilityCalendarSection','calendar-section'],
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
    'schedule-section':'schedule',
    'calendar-section':'calendar',
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
const MEDIA_VERSION='20261015-live-media-v1';
function media(path){return path?API+'/media/'+path.split('/').map(encodeURIComponent).join('/')+'?v='+MEDIA_VERSION:''}
function renderSettings(s){S=s;renderWorkStatus(s);set('scheduleTitle',s.scheduleTitle||'작업 일정 안내');renderSchedule(s);renderAvailabilityCalendar(s);armScheduleCutoffRefresh();set('noticeTitle',s.noticeTitle);set('noticeText',s.noticeText||'');set('formTitle',s.formTitle);set('formDescription',s.formDescription);set('copyButton',s.copyButton);set('portfolioTitle',s.portfolioTitle);set('footerText',s.footerText);renderAuthorIntro(s);renderEvents(s);renderNotices(s.noticeItems||[]);renderInquiryForm();renderPreset(s);requestAnimationFrame(()=>window.dispatchEvent(new Event('artmug-sections-changed')))}
function renderWorkStatus(s){
  const box=$('workStatus');
  const enabled=s.workStatusEnabled===true;
  const mode=s.workStatusMode==='sleeping'?'sleeping':'working';
  const description=String(
    mode==='sleeping'
      ? (s.workStatusSleepingText??'현재 취침 중으로 문의 답변이 조금 늦을 수 있어요.')
      : (s.workStatusWorkingText??'')
  ).trim();
  try{
    if('BroadcastChannel'in window){
      window.__artmugWorkStatusChannel=window.__artmugWorkStatusChannel||new BroadcastChannel('artmug-portfolio-section-nav');
      window.__artmugWorkStatusChannel.postMessage({type:'work-status',enabled,mode,description})
    }
  }catch{}
  if(!box)return;
  box.hidden=!enabled;
  box.dataset.status=mode;
  if(!enabled)return;

  const label=$('workStatusLabel');
  const descriptionEl=$('workStatusDescription');
  if(label)label.textContent=mode==='sleeping'?'취침중':'작업중';

  if(descriptionEl){
    descriptionEl.textContent=description;
    descriptionEl.hidden=!description;
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
  const dateColor=/^#[0-9a-f]{6}$/i.test(String(s.scheduleDateColor||''))?String(s.scheduleDateColor).toUpperCase():'#4E9BC6';
  if(card)card.style.setProperty('--schedule-date-color',dateColor);
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
  card?.querySelectorAll('.schedule-date').forEach(el=>el.style.setProperty('color',dateColor,'important'));

}

function availabilityMonthFromYmd(ymd){
  const m=String(ymd||'').match(/^(\d{4})-(\d{2})-/);
  return m?{year:Number(m[1]),month:Number(m[2])}:null
}
function availabilityMonthShift(view,delta){
  const d=new Date(Date.UTC(Number(view.year),Number(view.month)-1+Number(delta||0),1));
  return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1}
}
function availabilityMonthKey(view){
  return String(view.year)+'-'+String(view.month).padStart(2,'0')
}
function availabilityDaysInMonth(year,month){
  return new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate()
}
function availabilityFirstDay(year,month){
  return new Date(Date.UTC(Number(year),Number(month)-1,1)).getUTCDay()
}
function availabilityStatusMeta(status){
  return {
    available:{label:'접수 가능',className:'is-available'},
    closed:{label:'마감',className:'is-closed'},
    off:{label:'휴무',className:'is-off'},
    reserved:{label:'예약',className:'is-reserved'}
  }[status]||null
}
function renderAvailabilityCalendar(s){
  const card=document.querySelector('.availability-calendar-card');
  const root=$('availabilityCalendar');
  if(!card||!root)return;
  const cfg=s?.availabilityCalendar&&typeof s.availabilityCalendar==='object'?s.availabilityCalendar:{enabled:false,dates:{}};
  const scheduleDateColor=/^#[0-9a-f]{6}$/i.test(String(s?.scheduleDateColor||''))?String(s.scheduleDateColor).toUpperCase():'#4E9BC6';
  card.style.setProperty('--schedule-date-color',scheduleDateColor);
  const enabled=cfg.enabled===true;
  card.hidden=!enabled;
  if(!enabled){root.innerHTML='';return}
  const today=koreaDate();
  if(!availabilityCalendarView)availabilityCalendarView=availabilityMonthFromYmd(today)||{year:new Date().getUTCFullYear(),month:new Date().getUTCMonth()+1};
  const view=availabilityCalendarView,days=availabilityDaysInMonth(view.year,view.month),first=availabilityFirstDay(view.year,view.month);
  const dates=cfg.dates&&typeof cfg.dates==='object'&&!Array.isArray(cfg.dates)?cfg.dates:{};
  const weekdayLabels=['일','월','화','수','목','금','토'];
  const cells=[];
  for(let i=0;i<first;i++)cells.push('<span class="availability-day is-empty" aria-hidden="true"></span>');
  for(let day=1;day<=days;day++){
    const ymd=availabilityMonthKey(view)+'-'+String(day).padStart(2,'0');
    const savedStatus=dates[ymd];
    const dayOfWeek=new Date(Date.UTC(view.year,view.month-1,day)).getUTCDay();
    const isWeekend=dayOfWeek===0||dayOfWeek===6;
    const weekendsDefaultOff=cfg.weekendsDefaultOff!==false;
    const resolvedStatus=ymd<today
      ?'closed'
      :(['available','closed','off','reserved'].includes(savedStatus)?savedStatus:((weekendsDefaultOff&&isWeekend)?'off':'available'));
    const meta=availabilityStatusMeta(resolvedStatus);
    cells.push(
      '<div class="availability-day '+meta.className+' '+(ymd===today?'is-today':'')+'" aria-label="'+htmlAttr(ymd+' '+meta.label)+'">'+
        '<span class="availability-day-number">'+day+'</span>'+
        '<span class="availability-day-status">'+meta.label+'</span>'+
      '</div>'
    )
  }
  const remainder=cells.length%7;
  if(remainder)for(let i=remainder;i<7;i++)cells.push('<span class="availability-day is-empty" aria-hidden="true"></span>');
  root.innerHTML=
    '<div class="availability-calendar-inner">'+
      '<div class="availability-calendar-nav">'+
        '<button type="button" data-availability-shift="-1" aria-label="이전 달">‹</button>'+
        '<strong>'+view.year+'.'+String(view.month).padStart(2,'0')+'</strong>'+
        '<button type="button" data-availability-shift="1" aria-label="다음 달">›</button>'+
      '</div>'+

      '<div class="availability-weekdays">'+weekdayLabels.map((x,i)=>'<span class="'+(i===0?'is-sunday':i===6?'is-saturday':'')+'">'+x+'</span>').join('')+'</div>'+
      '<div class="availability-days">'+cells.join('')+'</div>'+
    '</div>';
  root.querySelectorAll('[data-availability-shift]').forEach(button=>button.onclick=()=>{
    availabilityCalendarView=availabilityMonthShift(availabilityCalendarView,Number(button.dataset.availabilityShift||0));
    renderAvailabilityCalendar(S||s);
    requestAnimationFrame(()=>window.dispatchEvent(new Event('artmug-sections-changed')))
  });
  requestAnimationFrame(()=>window.dispatchEvent(new Event('artmug-sections-changed')))
}

function renderAuthorIntro(s){
  const on=!!s.authorEnabled,sec=$('authorIntro');
  sec.hidden=!on;
  if(!on)return;
  const im=$('authorImage'),hasImage=!!s.aboutImage;
  sec.classList.toggle('has-image',hasImage);
  if(hasImage){im.src=media(s.aboutImage);im.hidden=false}else{im.removeAttribute('src');im.hidden=true}
  set('authorName',s.authorName||'CHILGONG DESIGN');
  set('authorText',s.authorText||'');
  $('authorText').style.fontSize=(s.authorFontSize||15)+'px'
}
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

function safeNoticeTextHtml(value){
  return String(value??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\r?\n/g,'<br>')
}
function safeNoticeColor(value){
  const v=String(value||'').trim();
  if(/^#[0-9a-f]{3,8}$/i.test(v))return v;
  if(/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(v))return v;
  return ''
}
function noticeRichHtml(raw,fallback){
  const source=String(raw||'').trim();
  if(!source)return safeNoticeTextHtml(fallback);
  const template=document.createElement('template');
  template.innerHTML=source;
  const serialize=node=>{
    if(node.nodeType===Node.TEXT_NODE)return safeNoticeTextHtml(node.nodeValue);
    if(node.nodeType!==Node.ELEMENT_NODE)return '';
    const tag=node.tagName.toUpperCase();
    const inner=Array.from(node.childNodes).map(serialize).join('');
    if(tag==='BR')return '<br>';
    if(tag==='B'||tag==='STRONG')return '<strong>'+inner+'</strong>';
    if(tag==='FONT'||tag==='SPAN'){
      const color=safeNoticeColor(tag==='FONT'?node.getAttribute('color'):node.style.color);
      return color?'<span style="color:'+color+'">'+inner+'</span>':inner
    }
    if(tag==='DIV'||tag==='P')return inner+'<br>';
    return inner
  };
  return Array.from(template.content.childNodes).map(serialize).join('').replace(/(?:<br>)+$/,'')
}
function renderNotices(items){
  const visible=(Array.isArray(items)?items:[]).filter(x=>x&&x.enabled!==false);
  $('noticeItems').innerHTML=visible.map((x,i)=>{
    const description=noticeRichHtml(x.descriptionRich,x.description);
    return `
      <article class="notice-item">
        <span class="notice-index" aria-hidden="true">${i+1}</span>
        <div class="notice-message">
          <span class="notice-item-description">${description}</span>
        </div>
      </article>
    `
  }).join('')
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

function inquirySchema(){
  const v=S?.inquiryV3;
  return v&&v.enabled!==false&&v.version>=3?v:null
}
function inquiryTypes(){
  const v=inquirySchema();
  if(v){
    const designs=v.designs||{};
    return (Array.isArray(v.designOrder)?v.designOrder:Object.keys(designs))
      .map(id=>designs[id])
      .filter(x=>x&&(x.enabled!==false||x.comingSoon===true))
      .map(x=>({...x,disabled:x.enabled===false,displayLabel:x.enabled===false&&x.comingSoon?String(x.label||x.id)+' (추가예정)':String(x.label||x.id)}))
  }
  return visibleCats((S&&S.designTypes)||[])
}
function inquiryType(id){
  const v=inquirySchema();
  if(v)return v.designs?.[id]||{};
  return ((S&&S.designTypes)||[]).find(function(x){return x.id===id})||{}
}
function isProfileInquiryType(t){
  const id=String(t?.id||''),label=String(t?.label||'').replace(/\s/g,'');
  return id==='profile'||id==='profile-a'||label.includes('움짤프사')||label.includes('움짤프로필')
}
function isFourCutInquiryType(t){
  const id=String(t?.id||'').toLowerCase(),label=String(t?.label||'').replace(/\s/g,'');
  return id==='fourcut'||/four-cut|4cut/.test(id)||label.includes('인생네컷')
}
function isBannerInquiryType(t){
  const id=String(t?.id||''),label=String(t?.label||'').replace(/\s/g,'');
  return id==='soopBanner'||label.includes('배너')
}
function showsContentField(t){
  return t?.showContentField===true||t?.showBannerTextField===true||String(t?.id||'')==='soopBanner'
}
function inquiryPricing(){
  const p=S?.quoteConfig?.pricingV2;
  return p&&typeof p==='object'?p:{designs:{},profileModes:{},bottomTypes:{},fourCutTypes:{},signatureTypes:{},options:{},customOptions:[]}
}
function inquiryPrice(v){return Math.max(0,Number(v||0))}
function inquiryProfileModesFromCard(card){
  const raw=String(card?.dataset?.profileModes||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(raw.length)return [...new Set(raw)];
  const legacy=String(card?.dataset?.profileMode||'').trim();
  return legacy?[legacy]:[]
}
function inquiryOption(key,fallbackLabel){
  const x=inquiryPricing().options?.[key]||{};
  return {...x,id:String(x.id||key),label:String(x.label||fallbackLabel||key),price:inquiryPrice(x.price)}
}
function inquiryProfileMode(key,fallbackLabel){
  const x=inquiryPricing().profileModes?.[key]||{};
  return {...x,id:String(x.id||key),label:String(x.label||fallbackLabel||key),price:x.price==null?null:inquiryPrice(x.price)}
}
function inquiryBottomType(key,fallbackLabel){
  const x=inquiryPricing().bottomTypes?.[key]||{};
  return {...x,id:String(x.id||key),label:String(x.label||fallbackLabel||key),price:inquiryPrice(x.price)}
}
function inquiryFourCutType(key,fallbackLabel){
  const x=inquiryPricing().fourCutTypes?.[key]||{};
  return {...x,id:String(x.id||key),label:String(x.label||fallbackLabel||key),price:inquiryPrice(x.price)}
}
function inquirySignatureType(key,fallbackLabel){
  const x=inquiryPricing().signatureTypes?.[key]||{};
  return {...x,id:String(x.id||key),label:String(x.label||fallbackLabel||key),price:inquiryPrice(x.price)}
}
function inquiryDesignPriceForType(t){
  const designs=inquiryPricing().designs||{},id=String(t?.id||''),label=String(t?.label||'').replace(/\s/g,'');
  if(id==='profile')return designs.profile||{id:'profile',pricing:'profileMode'};
  if(id==='soopBanner')return {id:'soopBanner',pricing:'bannerGroup'};
  if(id==='fourCut')return designs.fourCut||{id:'fourCut',pricing:'fourCutType'};
  if(id==='signature')return designs.signature||{id:'signature',pricing:'signatureType'};
  const entries=Object.values(designs);
  const exact=entries.find(x=>String(x?.typeId||'')&&String(x.typeId)===id);
  if(exact)return exact;
  if(isProfileInquiryType(t))return designs.profile||{id:'profile',pricing:'profileMode'};
  if(isFourCutInquiryType(t))return designs.fourCut||{id:'fourCut',pricing:'fourCutType'};
  if(label.includes('상단배너'))return designs.topBanner||{id:'topBanner',price:0};
  if(label.includes('플로팅배너'))return designs.floatingBanner||{id:'floatingBanner',price:0};
  if(label.includes('하단배너'))return designs.bottomBanner||{id:'bottomBanner',pricing:'bottomType'};
  return null
}
function inquiryCustomOptions(){
  return (Array.isArray(inquiryPricing().customOptions)?inquiryPricing().customOptions:[]).filter(x=>x&&x.enabledInInquiry!==false)
}
function inquiryQuantityOptions(t){
  if(isProfileInquiryType(t))return [
    {key:'nameOnlyChangeQty',label:inquiryOption('nameOnlyChange','움짤프사 · 이름 변경').label},
    {key:'profileChangeQty',label:inquiryOption('profileChange','움짤프사 · 이름/움짤 변경').label}
  ];
  if(isFourCutInquiryType(t))return [
    {key:'sameDesignColorChangeQty',label:inquiryOption('sameDesignColorChange','동일 디자인 · 색상 변경').label}
  ];
  if(isBannerInquiryType(t))return [
    {key:'textChangeQty',label:inquiryOption('textImageChange','배너 · 텍스트/이미지 변경').label}
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
function requiredLabel(text){return '<span class="field-label-row"><span>'+htmlAttr(text)+'</span><small class="required-badge">필수</small></span>'}
function updateInquiryQuestionNumbers(){
  const form=document.querySelector('.contact-form');
  if(!form)return;
  if(inquirySchema())return;
  let number=0;
  form.querySelectorAll('[data-question-title]').forEach(function(el){
    const hiddenParent=el.closest('[hidden]');
    const visible=!hiddenParent&&el.getClientRects().length>0;
    if(!visible){delete el.dataset.questionNumber;return}
    el.dataset.questionNumber=String(++number)
  })
}
window.updateInquiryQuestionNumbers=updateInquiryQuestionNumbers;

function readV3Map(card){
  const out={};
  if(!card)return out;
  const checkboxKeys=new Set(Array.from(card.querySelectorAll('input[type="checkbox"][data-v3-field]')).map(el=>String(el.dataset.v3Field||'')).filter(Boolean));
  checkboxKeys.forEach(key=>{out[key]=[]});
  card.querySelectorAll('[data-v3-field]').forEach(el=>{
    const key=String(el.dataset.v3Field||'');if(!key)return;
    if(el.type==='checkbox'){
      if(!el.checked)return;
      if(!Array.isArray(out[key]))out[key]=[];
      out[key].push(el.value||'1');
      return
    }
    if(el.type==='radio'){
      if(el.checked)out[key]=el.value;
      return
    }
    out[key]=el.value
  });
  return out
}
window.readV3Map=readV3Map;
function v3Remember(card,map){
  card.__v3State={...(card.__v3State||{}),...(map||{})};
  return card.__v3State
}
function v3Value(state,key,fallback=''){
  const v=state?.[key];
  return v==null?fallback:v
}
function v3Array(state,key){
  const v=state?.[key];
  if(Array.isArray(v))return v;
  return v==null||v===''?[]:[v]
}
function v3Checked(state,key,value){
  return v3Array(state,key).map(String).includes(String(value))
}
function v3RequiredMark(required){return required?'<small class="required-badge">필수</small>':''}
function v3FieldVisible(field,state){
  if(!field||field.enabled===false)return false;
  const key=String(field.conditionKey||''),expected=String(field.conditionValue||'');
  if(!key||!expected)return true;
  const actual=state?.[key];
  return Array.isArray(actual)?actual.map(String).includes(expected):String(actual??'')===expected
}
function v3FieldHtml(field,prefix,rid,state){
  if(!v3FieldVisible(field,state))return'';
  const key=prefix+'.'+String(field.id||'field'),label=String(field.label||'항목'),type=String(field.type||'text'),value=v3Value(state,key,''),help=String(field.help||'').trim(),helpHtml=help?'<small class="field-help">'+htmlAttr(help)+'</small>':'';
  const cls='inquiry-v3-field '+(field.wide?'is-wide':'')+(field.required?' is-required':'');
  if(type==='radio'||type==='multi'){
    const opts=Array.isArray(field.options)?field.options:[];
    return '<fieldset class="'+cls+' inquiry-v3-choice-field"><legend>'+htmlAttr(label)+v3RequiredMark(field.required)+'</legend><div class="choice-row">'+opts.map(opt=>{
      const raw=typeof opt==='object'?String(opt.value??opt.label??''):String(opt);
      const text=typeof opt==='object'?String(opt.label??opt.value??''):String(opt);
      const inputType=type==='multi'?'checkbox':'radio';
      const checked=type==='multi'?v3Checked(state,key,raw):String(value)===raw;
      return '<label class="choice-pill"><input type="'+inputType+'" data-v3-field="'+htmlAttr(key)+'" '+(field.required?'data-v3-required="1" ':'')+'name="v3-'+htmlAttr(rid)+'-'+htmlAttr(key)+'" value="'+htmlAttr(raw)+'" '+(checked?'checked':'')+'><span>'+htmlAttr(text)+'</span></label>'
    }).join('')+'</div>'+helpHtml+'</fieldset>'
  }
  if(type==='textarea'){
    return '<label class="'+cls+'"><span class="inquiry-field-title">'+htmlAttr(label)+v3RequiredMark(field.required)+'</span><textarea data-v3-field="'+htmlAttr(key)+'" '+(field.required?'data-v3-required="1" ':'')+'placeholder="'+htmlAttr(field.placeholder||'')+'">'+htmlAttr(value)+'</textarea>'+helpHtml+'</label>'
  }
  if(type==='number'){
    return '<label class="'+cls+'"><span class="inquiry-field-title">'+htmlAttr(label)+v3RequiredMark(field.required)+'</span><input type="number" data-v3-field="'+htmlAttr(key)+'" '+(field.required?'data-v3-required="1" ':'')+'min="'+htmlAttr(field.min??0)+'" step="'+htmlAttr(field.step??1)+'" value="'+htmlAttr(value)+'" placeholder="'+htmlAttr(field.placeholder||'')+'">'+helpHtml+'</label>'
  }
  return '<label class="'+cls+'"><span class="inquiry-field-title">'+htmlAttr(label)+v3RequiredMark(field.required)+'</span><input type="text" data-v3-field="'+htmlAttr(key)+'" '+(field.required?'data-v3-required="1" ':'')+'value="'+htmlAttr(value)+'" placeholder="'+htmlAttr(field.placeholder||'')+'">'+helpHtml+'</label>'
}
function v3QtyHtml(fieldKey,label,value){
  const n=Math.max(0,Math.floor(Number(value||0)));
  return '<div class="inquiry-qty-row inquiry-v3-qty-row"><span class="inquiry-qty-label">'+htmlAttr(label)+'</span><div class="inquiry-qty-control">'+
    '<button type="button" class="inquiry-qty-button" data-qty-field="'+htmlAttr(fieldKey)+'" data-qty-delta="-1" aria-label="'+htmlAttr(label)+' 수량 감소">−</button>'+
    '<input class="inquiry-qty-input" data-field="'+htmlAttr(fieldKey)+'" data-v3-field="'+htmlAttr(fieldKey==='textChangeQty'?'banner.textChangeQty':fieldKey==='sameDesignColorChangeQty'?'fourCut.colorChangeQty':fieldKey)+'" type="number" min="0" step="1" inputmode="numeric" value="'+n+'" aria-label="'+htmlAttr(label)+' 수량">'+
    '<button type="button" class="inquiry-qty-button" data-qty-field="'+htmlAttr(fieldKey)+'" data-qty-delta="1" aria-label="'+htmlAttr(label)+' 수량 증가">+</button>'+
  '</div></div>'
}
function v3DesignCardHead(label){
  return '<div class="inquiry-design-card-head"><strong>'+htmlAttr(label)+'</strong></div>'
}
function renderV3BannerCard(card,design,state){
  const rid=card.dataset.requestId||'0',kinds=(Array.isArray(design.bannerKinds)?design.bannerKinds:[]).filter(x=>x.enabled!==false),selected=v3Array(state,'bannerKinds');
  const selectedBottom=selected.includes('bottomBanner'),bottomTypes=['bottom1','bottom3','bottom6'].map(k=>inquiryBottomType(k,k)).filter(x=>x.enabledInInquiry!==false);
  let html='<section class="inquiry-design-detail-card" data-design-card="soopBanner">'+v3DesignCardHead(design.label||'SOOP 배너')+
    '<fieldset class="inquiry-v3-field inquiry-v3-choice-field"><legend>배너 종류'+v3RequiredMark(true)+'</legend><div class="choice-row">'+
      kinds.map(x=>'<label class="choice-pill"><input type="checkbox" data-v3-field="bannerKinds" data-v3-rerender="1" value="'+htmlAttr(x.id)+'" '+(selected.includes(x.id)?'checked':'')+'><span>'+htmlAttr(x.label)+'</span></label>').join('')+
    '</div></fieldset>';
  if(selectedBottom){
    html+='<fieldset class="inquiry-v3-field inquiry-v3-choice-field"><legend>하단배너 종류'+v3RequiredMark(true)+'</legend><div class="choice-row">'+
      bottomTypes.map(x=>'<label class="choice-pill"><input type="checkbox" data-v3-field="bottomTypes" data-v3-rerender="1" value="'+htmlAttr(x.id)+'" '+(v3Checked(state,'bottomTypes',x.id)?'checked':'')+'><span>'+htmlAttr(x.label)+'</span></label>').join('')+
    '</div></fieldset>'
  }
  if(S?.bannerTypeEnabled!==false&&selected.length){
    html+='<div class="inquiry-v3-banner-types">'+selected.map(kind=>{
      const k=kinds.find(x=>x.id===kind),key='banner.type.'+kind,val=String(v3Value(state,key,'B'));
      return '<fieldset class="inquiry-v3-field inquiry-v3-choice-field"><legend>'+htmlAttr(k?.label||kind)+' TYPE</legend><div class="choice-row">'+
        ['A','B'].map(t=>'<label class="choice-pill"><input type="radio" data-v3-field="'+htmlAttr(key)+'" name="v3-'+rid+'-'+htmlAttr(key)+'" value="'+t+'" '+(val===t?'checked':'')+'><span>TYPE '+t+'</span></label>').join('')+
      '</div></fieldset>'
    }).join('')+'</div>'
  }
  html+='<div class="inquiry-v3-field-grid">'+
    v3FieldHtml({id:'concept',label:design.conceptLabel||'원하는 디자인 컨셉 및 색상',type:'textarea',required:true,placeholder:S?.conceptPlaceholder||'',wide:true},'banner',rid,state)+
    v3FieldHtml({id:'content',label:design.contentLabel||'내용 입력',type:'textarea',required:true,placeholder:S?.bannerTextPlaceholder||'',wide:true},'banner',rid,state)+
  '</div>';
  html+='<div class="inquiry-v3-design-options">'+v3QtyHtml('textChangeQty',design.textChangeLabel||inquiryOption('textImageChange','배너 · 텍스트/이미지 변경').label,v3Value(state,'banner.textChangeQty',0))+'</div>';
  (design.customFields||[]).filter(x=>x.enabled!==false).forEach(field=>{html+=v3FieldHtml(field,'banner.custom',rid,state)});
  return html+'</section>'
}
function renderV3FourCutCard(card,design,state){
  const rid=card.dataset.requestId||'0',types=(Array.isArray(design.types)?design.types:[]).filter(x=>x.enabled!==false),selected=v3Array(state,'fourCut.type').map(String);
  let html='<section class="inquiry-design-detail-card" data-design-card="fourCut">'+v3DesignCardHead(design.label||'인생네컷')+
    '<fieldset class="inquiry-v3-field inquiry-v3-choice-field"><legend>인생네컷 종류</legend><div class="choice-row">'+
      types.map(x=>'<label class="choice-pill"><input type="checkbox" data-v3-field="fourCut.type" data-v3-rerender="1" value="'+htmlAttr(x.id)+'" '+(selected.includes(String(x.id))?'checked':'')+'><span>'+htmlAttr(x.label)+'</span></label>').join('')+
    '</div></fieldset>'+
    '<div class="inquiry-v3-field-grid">'+v3FieldHtml({id:'concept',label:design.conceptLabel||'원하는 디자인 컨셉 및 색상',type:'textarea',required:false,placeholder:S?.conceptPlaceholder||'',wide:true},'fourCut',rid,state)+'</div>'+
    '<div class="inquiry-v3-design-options">'+v3QtyHtml('sameDesignColorChangeQty',design.colorChangeLabel||inquiryOption('sameDesignColorChange','동일 디자인 · 색상 변경').label,v3Value(state,'fourCut.colorChangeQty',0))+'</div>';
  (design.customFields||[]).filter(x=>x.enabled!==false).forEach(field=>{html+=v3FieldHtml({...field,required:false},'fourCut.custom',rid,state)});
  return html+'</section>'
}
function renderV3SignatureCard(card,design,state){
  const rid=card.dataset.requestId||'0',counts=(Array.isArray(design.counts)?design.counts:[]).filter(x=>x.enabled!==false),modes=(Array.isArray(design.modes)?design.modes:[]).filter(x=>x.enabled!==false),count=String(v3Value(state,'signature.count','')),mode=String(v3Value(state,'signature.mode',''));
  let html='<section class="inquiry-design-detail-card" data-design-card="signature">'+v3DesignCardHead(design.label||'시그풍')+
    '<fieldset class="inquiry-v3-field inquiry-v3-choice-field"><legend>시그풍 종류'+v3RequiredMark(true)+'</legend><div class="choice-row">'+
      counts.map(x=>'<label class="choice-pill"><input type="radio" data-v3-field="signature.count" data-v3-rerender="1" name="v3-sign-count-'+rid+'" value="'+htmlAttr(x.id)+'" '+(count===String(x.id)?'checked':'')+'><span>'+htmlAttr(x.label)+'</span></label>').join('')+
    '</div></fieldset>';
  if(count==='custom')html+=v3FieldHtml({id:'customQty',label:'갯수 직접입력',type:'number',required:true,min:1,step:1,placeholder:'1 이상의 숫자'},'signature',rid,state);
  html+='<fieldset class="inquiry-v3-field inquiry-v3-choice-field"><legend>디자인 신청 방식'+v3RequiredMark(true)+'</legend><div class="choice-row">'+
    modes.map(x=>'<label class="choice-pill"><input type="radio" data-v3-field="signature.mode" data-v3-rerender="1" name="v3-sign-mode-'+rid+'" value="'+htmlAttr(x.id)+'" '+(mode===String(x.id)?'checked':'')+'><span>'+htmlAttr(x.label)+'</span></label>').join('')+
  '</div></fieldset>';
  if(mode){
    html+='<div class="inquiry-v3-field-grid">'+
      v3FieldHtml({id:'content',label:'시그풍 숫자 및 내용',type:'textarea',required:true,placeholder:'숫자와 문구를 여러 줄로 작성해주세요',wide:true},'signature',rid,state)+
      (mode==='omakase'
        ?v3FieldHtml({id:'colors',label:'색상 입력',type:'textarea',required:true,placeholder:'원하는 색상 / 싫어하는 색상을 작성해주세요',wide:true},'signature',rid,state)
        :v3FieldHtml({id:'concept',label:'원하는 디자인 컨셉 및 색상',type:'textarea',required:true,placeholder:'원하는 분위기, 키워드, 색상을 작성해주세요',wide:true},'signature',rid,state))+
    '</div>'
  }
  (design.customFields||[]).filter(x=>x.enabled!==false).forEach(field=>{html+=v3FieldHtml(field,'signature.custom',rid,state)});
  return html+'</section>'
}
function renderV3GenericCard(card,design,state){
  const rid=card.dataset.requestId||'0';
  let html='<section class="inquiry-design-detail-card" data-design-card="'+htmlAttr(design.id||'custom')+'">'+v3DesignCardHead(design.label||'새 디자인')+
    '<div class="inquiry-v3-field-grid">';
  (design.customFields||[]).filter(x=>x.enabled!==false).forEach(field=>{html+=v3FieldHtml(field,'generic.'+design.id,rid,state)});
  html+='</div></section>';
  return html
}
function renderInquiryCommonSections(card,prev,state){
  const host=card.querySelector('.inquiry-v3-global-sections');if(!host)return;
  const schema=inquirySchema(),common=schema?.common||{};
  const optionOrder=Array.isArray(common.optionOrder)?common.optionOrder:['sameDay','fast','private'];
  const checkboxOptions=optionOrder.map(k=>inquiryOption(k,k)).filter(o=>o.enabledInInquiry!==false).concat(inquiryCustomOptions().map(x=>({id:String(x.id||''),label:String(x.label||'추가 옵션'),price:inquiryPrice(x.price),custom:true,enabledInInquiry:x.enabledInInquiry!==false})));
  const extraValue=v3Value(state,'extraRequest',prev.extra||'');
  host.innerHTML='<section class="inquiry-v3-common-section inquiry-v3-extra-section"><div class="inquiry-v3-step-heading"><span class="inquiry-v3-step-number">4</span><div><strong>'+htmlAttr(common.extraLabel||'추가 요청사항')+'</strong></div></div>'+
    '<textarea data-field="extra" data-v3-field="extraRequest" placeholder="'+htmlAttr(common.extraPlaceholder||'')+'">'+htmlAttr(extraValue)+'</textarea></section>'+
    '<section class="inquiry-v3-common-section inquiry-v3-option-section"><div class="inquiry-v3-step-heading"><span class="inquiry-v3-step-number">5</span><div><strong>추가 옵션</strong></div></div><div class="check-grid">'+
      checkboxOptions.map(o=>'<label class="choice-pill"><input data-field="extraOption" data-quote-option-id="'+htmlAttr(o.id)+'" type="checkbox" value="'+htmlAttr(o.label)+'" '+((prev.optionIds||[]).includes(o.id)||(prev.options||[]).includes(o.label)?'checked':'')+'><span>'+htmlAttr(o.label)+'</span></label>').join('')+
    '</div></section>';
  host.querySelectorAll('[data-v3-field]').forEach(el=>{
    const sync=()=>{card.__v3State={...card.__v3State,...readV3Map(card)};window.refreshInquiryEstimate?.()};
    el.addEventListener(el.tagName==='TEXTAREA'||['text','number','url'].includes(el.type)?'input':'change',sync)
  });
  const sameDay=host.querySelector('input[data-quote-option-id="sameDay"]'),fast=host.querySelector('input[data-quote-option-id="fast"]');
  if(sameDay&&fast){
    sameDay.addEventListener('change',()=>{if(sameDay.checked)fast.checked=false});
    fast.addEventListener('change',()=>{if(fast.checked)sameDay.checked=false})
  }
}
function renderRequestFieldsV3(card,typeIds,prev){
  prev=prev||{};
  const state=v3Remember(card,prev.v3||readV3Map(card));
  const schema=inquirySchema(),designs=schema?.designs||{},fields=card.querySelector('.request-fields');
  const selected=(typeIds||[]).map(id=>designs[id]).filter(Boolean);
  let html='<div class="inquiry-v3-step-heading inquiry-v3-detail-heading"><span class="inquiry-v3-step-number">3</span><div><strong>상세 옵션</strong></div></div>';
  if(selected.length){
    html+='<div class="inquiry-design-cards">';
    selected.forEach(design=>{
      if(design.id==='profile')html+='<section class="inquiry-design-detail-card" data-design-card="profile">'+v3DesignCardHead(design.label||'움짤프사')+'<div data-v3-profile-slot></div></section>';
      else if(design.id==='soopBanner')html+=renderV3BannerCard(card,design,state);
      else if(design.id==='fourCut')html+=renderV3FourCutCard(card,design,state);
      else if(design.id==='signature')html+=renderV3SignatureCard(card,design,state);
      else html+=renderV3GenericCard(card,design,state);
    });
    html+='</div>'
  }
  fields.innerHTML=html;
  renderInquiryCommonSections(card,prev,state);

  fields.querySelectorAll('[data-v3-rerender]').forEach(el=>el.addEventListener('change',()=>{
    const now={...card.__v3State,...readV3Map(card)};card.__v3State=now;
    renderRequestFieldsV3(card,typeIds,{...readRequestValues(card),v3:now});
    clearRequiredMessageIfComplete()
  }));
  fields.querySelectorAll('[data-v3-field]').forEach(el=>{
    const sync=()=>{card.__v3State={...card.__v3State,...readV3Map(card)};window.refreshInquiryEstimate?.()};
    el.addEventListener(el.tagName==='TEXTAREA'||['text','number','url'].includes(el.type)?'input':'change',sync)
  });
  fields.querySelectorAll('[data-qty-field]').forEach(btn=>btn.onclick=()=>{
    const input=fields.querySelector('[data-field="'+CSS.escape(btn.dataset.qtyField)+'"]');if(!input)return;
    input.value=String(Math.max(0,Math.floor(Number(input.value||0))+Number(btn.dataset.qtyDelta||0)));
    input.dispatchEvent(new Event('input',{bubbles:true}))
  });
  fields.querySelectorAll('.inquiry-qty-input').forEach(input=>input.addEventListener('blur',()=>{input.value=String(Math.max(0,Math.floor(Number(input.value||0))))}));
  requestAnimationFrame(()=>window.dispatchEvent(new Event('artmug-sections-changed')))
}
function renderInquiryForm(){
  const schema=inquirySchema(),broadcast=schema?.broadcast||{};
  set('nicknameLabel',broadcast.nicknameLabel||S.nicknameLabel||'방송 닉네임');
  set('broadcastAddressLabel',broadcast.addressLabel||'방송 주소');
  const nickname=$('nicknameInput'),address=$('broadcastAddressInput');
  nickname.placeholder=broadcast.nicknamePlaceholder||S.nicknamePlaceholder||'';
  if(address)address.placeholder=broadcast.addressPlaceholder||'https://...';
  nickname.value='';if(address)address.value='';
  [nickname,address].filter(Boolean).forEach(el=>{el.classList.remove('is-required-missing');el.setAttribute('aria-invalid','false')});
  const container=$('requestsContainer');container.innerHTML='';requestSeq=0;
  const types=inquiryTypes();
  if(!types.length){container.innerHTML='<div class="request-empty">현재 신청 가능한 디자인 종류가 없습니다.</div>';return}
  addRequest([]);
  initInquiryEstimate();
  [nickname,address].filter(Boolean).forEach(el=>el.oninput=()=>{
    if(String(el.value||'').trim()){el.classList.remove('is-required-missing');el.setAttribute('aria-invalid','false')}
    clearRequiredMessageIfComplete()
  });
  requestAnimationFrame(updateInquiryQuestionNumbers)
}
function requestTypeOptions(selectedIds){
  selectedIds=Array.isArray(selectedIds)?selectedIds:[];
  return inquiryTypes().map(t=>{
    const disabled=t.disabled===true;
    return '<label class="request-type-option '+(disabled?'is-disabled':'')+'"><input type="checkbox" data-field="requestType" value="'+htmlAttr(t.id)+'" '+(selectedIds.includes(t.id)?'checked ':'')+(disabled?'disabled ':'')+'><span>'+htmlAttr(t.displayLabel||t.label)+'</span></label>'
  }).join('')
}
function selectedInquiryTypes(card){
  return Array.from(card.querySelectorAll('input[data-field="requestType"]:checked'))
    .map(input=>inquiryType(input.value))
    .filter(t=>t&&t.id)
}
function addRequest(typeIds){
  const types=inquiryTypes();if(!types.length)return;
  typeIds=Array.isArray(typeIds)?typeIds:[];
  const id=++requestSeq,card=document.createElement('article');
  card.className='request-card request-card-combined request-card-v3';
  card.dataset.requestId=String(id);card.dataset.typeIds=typeIds.join(',');
  card.innerHTML='<div class="request-type-selector">'+
    '<div class="inquiry-v3-step-heading"><span class="inquiry-v3-step-number">2</span><div><strong>'+htmlAttr(inquirySchema()?.designTypeLabel||S.designTypeLabel||'신청하시는 디자인 종류')+' <span class="inquiry-title-note">(중복 선택 가능)</span></strong></div></div>'+
    '<div class="request-type-options">'+requestTypeOptions(typeIds)+'</div>'+
  '</div><div class="request-fields"></div><div class="inquiry-v3-global-sections"></div>';
  $('requestsContainer').appendChild(card);
  card.querySelectorAll('input[data-field="requestType"]').forEach(input=>input.onchange=()=>{
    const prev=readRequestValues(card),selected=Array.from(card.querySelectorAll('input[data-field="requestType"]:checked')).map(x=>x.value);
    card.dataset.typeIds=selected.join(',');
    if(!selected.includes('profile')){
      delete card.dataset.profileMode;delete card.dataset.profileModes;delete card.dataset.selectedFixedProductId;delete card.dataset.selectedPresetFile;delete card.dataset.selectedPresetColorFile
    }
    renderRequestFields(card,selected,prev);clearRequiredMessageIfComplete()
  });
  renderRequestFields(card,typeIds,{})
}
function updateRequestCardMeta(){}
window.refreshInquiryRequestFields=function(card){
  if(!card)return;
  const prev=readRequestValues(card),selected=Array.from(card.querySelectorAll('input[data-field="requestType"]:checked')).map(x=>x.value);
  renderRequestFields(card,selected,prev)
};
function readRequestValues(card){
  const q=s=>card.querySelector(s),qa=s=>Array.from(card.querySelectorAll(s)),v3=readV3Map(card);
  return{
    typeIds:qa('input[data-field="requestType"]:checked').map(x=>x.value),
    signatureNumber:String(v3['signature.content']||''),
    signatureContent:String(v3['signature.content']||''),
    frameKeep:String(v3['profile.common.frameKeep']||v3['profile.custom.frameKeep']||v3['profile.preset.frameKeep']||'O'),
    concept:String(v3['banner.concept']||v3['fourCut.concept']||v3['profile.custom.concept']||''),
    extra:String(v3.extraRequest||(q('[data-field="extra"]')||{}).value||''),
    bannerText:String(v3['banner.content']||''),
    banners:v3Array(v3,'bottomTypes'),
    bannerIds:v3Array(v3,'bottomTypes'),
    nameOnlyChangeQty:Math.max(0,Number((q('[data-field="nameOnlyChangeQty"]')||{}).value||v3['profile.change.nameOnlyQty']||0)),
    profileChangeQty:Math.max(0,Number((q('[data-field="profileChangeQty"]')||{}).value||v3['profile.change.fullQty']||0)),
    textChangeQty:Math.max(0,Number((q('[data-field="textChangeQty"]')||{}).value||v3['banner.textChangeQty']||0)),
    sameDesignColorChangeQty:Math.max(0,Number((q('[data-field="sameDesignColorChangeQty"]')||{}).value||v3['fourCut.colorChangeQty']||0)),
    options:qa('input[data-field="extraOption"]:checked').map(x=>x.value),
    optionIds:qa('input[data-field="extraOption"]:checked').map(x=>x.dataset.quoteOptionId||'').filter(Boolean),
    v3
  }
}
function renderRequestFields(card,typeIds,prev){
  if(inquirySchema())return renderRequestFieldsV3(card,typeIds,prev);
  const fields=card.querySelector('.request-fields');
  fields.innerHTML='<label class="request-full-field"><span class="inquiry-field-title">추가 요청사항</span><textarea data-field="extra"></textarea></label>'
}

function ensureInquiryEstimateBox(){
  let box=$('inquiryEstimate');
  if(box)return box;
  const attachment=document.querySelector('.inquiry-attachment-notice');
  if(!attachment?.parentNode)return null;
  box=document.createElement('section');
  box.id='inquiryEstimate';
  box.className='span-2 inquiry-estimate';
  box.hidden=true;
  box.setAttribute('aria-live','polite');
  attachment.parentNode.insertBefore(box,attachment);
  return box
}
function estimateQty(key){
  if(publicQuoteQty[key]==null)publicQuoteQty[key]=1;
  return Math.max(1,Math.floor(Number(publicQuoteQty[key]||1)))
}

function selectedInquiryEstimateRows(card){
  if(!card)return[];
  if(!inquirySchema()){
    const p=inquiryPricing(),types=selectedInquiryTypes(card),v=readRequestValues(card),rows=[];
    types.forEach(t=>{const d=inquiryDesignPriceForType(t);if(d)rows.push({key:'design:'+d.id,label:String(d.label||t.label||''),price:inquiryPrice(d.price),qty:estimateQty('design:'+d.id),adjustable:true})});
    return rows
  }
  const p=inquiryPricing(),types=selectedInquiryTypes(card),v=readRequestValues(card),rows=[],state={...(card.__v3State||{}),...v.v3};
  const v2=window.__ARTMUG_V2__?.inquiryData?.(card)||{};
  const designs=inquirySchema()?.designs||{};
  types.forEach(t=>{
    if(t.id==='profile'){
      const modes=Array.isArray(v2.profileModes)&&v2.profileModes.length?v2.profileModes:inquiryProfileModesFromCard(card);
      modes.filter(mode=>mode&&mode!=='change').forEach(mode=>{
        const m=inquiryProfileMode(mode,mode);
        let label='움짤프사 · '+m.label,price=inquiryPrice(m.price),key='profile:'+mode;
        if(mode==='fixed'&&v2.selectedFixedProductName){
          label='고정틀 · '+v2.selectedFixedProductName;
          key='fixed:'+String(v2.selectedFixedProductId||v2.selectedFixedProductName);
          if(inquiryPrice(v2.selectedFixedPrice)>0)price=inquiryPrice(v2.selectedFixedPrice)
        }
        if(mode==='preset'&&v2.selectedPresetName){
          label='프리셋 · '+v2.selectedPresetName;
          key='preset:'+String(v2.selectedPresetFile||v2.selectedPresetName);
          if(inquiryPrice(v2.selectedPresetPrice)>0)price=inquiryPrice(v2.selectedPresetPrice)
        }
        rows.push({key,label,price,qty:estimateQty(key),adjustable:true})
      });
      return
    }
    if(t.id==='soopBanner'){
      const kinds=v3Array(state,'bannerKinds');
      kinds.forEach(kind=>{
        if(kind==='bottomBanner'){
          v3Array(state,'bottomTypes').forEach(id=>{
            const b=inquiryBottomType(id,id),key='bottom:'+b.id;
            rows.push({key,label:'하단배너 · '+b.label,price:inquiryPrice(b.price),qty:estimateQty(key),adjustable:true})
          })
        }else{
          const d=p.designs?.[kind]||{},key='design:'+kind;
          rows.push({key,label:String(d.label||designs.soopBanner?.bannerKinds?.find(x=>x.id===kind)?.label||kind),price:inquiryPrice(d.price),qty:estimateQty(key),adjustable:true})
        }
      });
      return
    }
    if(t.id==='fourCut'){
      const ids=v3Array(state,'fourCut.type').map(String);
      ids.forEach(id=>{
        const x=inquiryFourCutType(id,id),key='fourCut:'+id;
        rows.push({key,label:x.label,price:x.price,qty:estimateQty(key),adjustable:true})
      });
      return
    }
    if(t.id==='signature'){
      const id=String(v3Value(state,'signature.count',''));if(!id)return;
      if(id==='custom'){
        const qty=Math.max(0,Math.floor(Number(v3Value(state,'signature.customQty',0)||0))),x=inquirySignatureType('direct','시그풍 직접 수량 · 개당');
        if(qty>0)rows.push({key:'signature:custom',label:'시그풍 직접 수량',price:x.price,qty,adjustable:false})
      }else{
        const x=inquirySignatureType(id,id);
        rows.push({key:'signature:'+id,label:x.label,price:x.price,qty:1,adjustable:false})
      }
      return
    }
    const customPrice=p.designs?.[t.id];
    if(customPrice)rows.push({key:'design:'+t.id,label:String(customPrice.label||t.label||t.id),price:inquiryPrice(customPrice.price),qty:estimateQty('design:'+t.id),adjustable:true})
  });
  [
    ['nameOnlyChange','nameOnlyChangeQty'],
    ['profileChange','profileChangeQty'],
    ['textImageChange','textChangeQty'],
    ['sameDesignColorChange','sameDesignColorChangeQty']
  ].forEach(pair=>{
    const o=inquiryOption(pair[0],pair[0]),qty=Math.max(0,Number(v[pair[1]]||0));
    if(qty>0)rows.push({key:'option:'+o.id,label:o.label,price:o.price,qty,adjustable:false})
  });
  const workCount=Math.max(1,rows.filter(x=>!String(x.key||'').startsWith('option:')).reduce((sum,x)=>sum+Math.max(1,Number(x.qty||1)),0));
  card.querySelectorAll('input[data-field="extraOption"]:checked').forEach(input=>{
    const id=String(input.dataset.quoteOptionId||''),built=p.options?.[id],custom=(p.customOptions||[]).find(x=>String(x.id)===id),o=built||custom;
    const qty=o?.applyMode==='perItem'?workCount:1;
    rows.push({key:'option:'+id,label:String(o?.label||input.value||'추가 옵션'),price:inquiryPrice(o?.price),qty,adjustable:false})
  });
  return rows
}

function renderInquiryEstimate(){
  const box=ensureInquiryEstimateBox();if(!box)return;
  const card=document.querySelector('.request-card'),types=card?selectedInquiryTypes(card):[];
  if(!card){box.hidden=true;box.innerHTML='';return}
  const rows=types.length?selectedInquiryEstimateRows(card):[];
  let total=0,hasInquiryOnly=false;
  rows.forEach(x=>{if(x.price>0)total+=x.price*x.qty;else hasInquiryOnly=true});
  const rowHtml=rows.map(x=>{
    const unit=x.price>0?x.price.toLocaleString('ko-KR')+'원':'별도 문의';
    const subtotal=x.price>0?(x.price*x.qty).toLocaleString('ko-KR')+'원':'별도 문의';
    const qty=x.adjustable
      ?'<div class="inquiry-estimate-qty"><button type="button" data-estimate-qty-key="'+htmlAttr(x.key)+'" data-estimate-delta="-1">−</button><b>'+x.qty+'</b><button type="button" data-estimate-qty-key="'+htmlAttr(x.key)+'" data-estimate-delta="1">+</button></div>'
      :'<span class="inquiry-estimate-count">× '+x.qty+'개</span>';
    return '<div class="inquiry-estimate-row"><div class="inquiry-estimate-name"><strong>'+htmlAttr(x.label)+'</strong><span>'+unit+'</span></div>'+qty+'<b class="inquiry-estimate-subtotal">'+subtotal+'</b></div>'
  }).join('');
  const emptyText=types.length?'선택된 가격 항목이 없습니다.':'디자인 종류를 선택하면 예상 견적이 표시됩니다.';
  const wasOpen=box.dataset.open==='1';
  box.innerHTML='<details class="inquiry-estimate-details" '+(wasOpen?'open':'')+'>'+
    '<summary class="inquiry-estimate-head"><div class="inquiry-estimate-head-title"><strong>예상 견적</strong></div><div class="inquiry-estimate-head-total"><b>'+total.toLocaleString('ko-KR')+'원</b><span class="inquiry-estimate-chevron" aria-hidden="true">▾</span></div></summary>'+
    '<div class="inquiry-estimate-body">'+(rowHtml?'<div class="inquiry-estimate-list">'+rowHtml+'</div>':'<p class="inquiry-estimate-empty">'+emptyText+'</p>')+
    (hasInquiryOnly?'<p class="inquiry-estimate-note">※ 별도 문의 항목은 총 금액에서 제외됩니다.</p>':'')+'</div></details>';
  const details=box.querySelector('details');if(details)details.ontoggle=()=>{box.dataset.open=details.open?'1':'0'};
  box.hidden=false
}
let inquiryEstimateObserver=null;
function initInquiryEstimate(){
  const box=ensureInquiryEstimateBox(),root=$('requestsContainer');if(!box||!root)return;
  if(box.dataset.bound!=='1'){
    box.dataset.bound='1';
    box.addEventListener('click',function(e){
      const b=e.target.closest('[data-estimate-qty-key]');if(!b)return;
      const key=b.dataset.estimateQtyKey,delta=Number(b.dataset.estimateDelta||0);
      publicQuoteQty[key]=Math.max(1,estimateQty(key)+delta);
      renderInquiryEstimate()
    })
  }
  if(root.dataset.quoteBound!=='1'){
    root.dataset.quoteBound='1';
    const syncInquiry=()=>{requestAnimationFrame(renderInquiryEstimate);requestAnimationFrame(clearRequiredMessageIfComplete)};
    root.addEventListener('change',syncInquiry);
    root.addEventListener('input',syncInquiry);
  }
  if(!inquiryEstimateObserver){
    let pending=false;
    inquiryEstimateObserver=new MutationObserver(()=>{
      if(pending)return;pending=true;
      requestAnimationFrame(()=>{pending=false;renderInquiryEstimate()})
    });
    inquiryEstimateObserver.observe(root,{subtree:true,childList:true})
  }
  window.refreshInquiryEstimate=renderInquiryEstimate;
  requestAnimationFrame(renderInquiryEstimate)
}


function v3FormatValue(value){
  if(Array.isArray(value))return value.filter(Boolean).join(', ');
  return String(value??'').trim()
}
function v3FieldLines(fields,prefix,state){
  const out=[];
  (Array.isArray(fields)?fields:[]).filter(f=>v3FieldVisible(f,state)).forEach(f=>{
    const value=v3FormatValue(state[prefix+'.'+f.id]);
    if(value)out.push(String(f.label||f.id)+': '+value)
  });
  return out
}
function requestText(card){
  const v=readRequestValues(card),types=v.typeIds.map(inquiryType).filter(t=>t&&t.id);
  if(!inquirySchema())return (S.designTypeLabel||'신청하시는 디자인 종류')+': '+types.map(t=>t.label||'').join(', ');
  const schema=inquirySchema(),state={...(card.__v3State||{}),...v.v3},v2=window.__ARTMUG_V2__?.inquiryData?.(card)||{},blocks=[];
  blocks.push((schema.designTypeLabel||'신청하시는 디자인 종류')+': '+types.map(t=>t.label||'').filter(Boolean).join(', '));
  types.forEach(type=>{
    const lines=[],design=schema.designs?.[type.id]||type;
    if(type.id==='profile'){
      const modes=Array.isArray(v2.profileModes)?v2.profileModes:inquiryProfileModesFromCard(card);
      if(modes.length)lines.push('신청 방식: '+modes.map(mode=>inquiryProfileMode(mode,mode).label).join(', '));
      let profileGroupCount=0;
      const addProfileGroup=group=>{
        const items=(group||[]).filter(Boolean);
        if(!items.length)return;
        if(profileGroupCount>0)lines.push('');
        lines.push(...items);
        profileGroupCount++
      };
      if(modes.includes('custom')){
        addProfileGroup(v3FieldLines((design.modeFields?.custom||[]).filter(f=>f.id!=='frameKeep'),'profile.custom',state))
      }
      if(modes.includes('fixed')){
        const fixedLines=[];
        if(v2.selectedFixedProductName)fixedLines.push('고정틀 선택: '+v2.selectedFixedProductName);
        const product=(S.fixedProducts||[]).find(x=>String(x.id)===String(v2.selectedFixedProductId||''));
        fixedLines.push(...v3FieldLines((product?.inquiryFields||[]).filter(f=>f.id!=='frameKeep'),'profile.fixed.'+String(v2.selectedFixedProductId||''),state));
        addProfileGroup(fixedLines)
      }
      if(modes.includes('preset')){
        const presetLines=[];
        if(v2.selectedPresetName)presetLines.push('프리셋 선택: '+v2.selectedPresetName);
        if(v2.selectedPresetNeedsColor&&v2.selectedPresetColorName)presetLines.push('색상 선택: '+v2.selectedPresetColorName);
        presetLines.push(...v3FieldLines((design.modeFields?.preset||[]).filter(f=>f.id!=='frameKeep'),'profile.preset',state));
        addProfileGroup(presetLines)
      }
      if(modes.includes('change')){
        addProfileGroup(v3FieldLines(design.modeFields?.change,'profile.change',state))
      }
      if(modes.some(mode=>mode!=='change')){
        const frameKeep=v3FormatValue(state['profile.common.frameKeep']);
        if(frameKeep)lines.push('움짤프사 파일 보관 여부: '+frameKeep)
      }
      if(v.nameOnlyChangeQty>0)lines.push(inquiryOption('nameOnlyChange','움짤프사 · 이름 변경').label+': × '+v.nameOnlyChangeQty+'개');
      if(v.profileChangeQty>0)lines.push(inquiryOption('profileChange','움짤프사 · 이름/움짤 변경').label+': × '+v.profileChangeQty+'개');
    }else if(type.id==='soopBanner'){
      const kinds=v3Array(state,'bannerKinds'),kindDefs=design.bannerKinds||[];
      if(kinds.length)lines.push('선택 종류: '+kinds.map(id=>kindDefs.find(x=>x.id===id)?.label||id).join(', '));
      if(kinds.includes('bottomBanner')){
        const bottoms=v3Array(state,'bottomTypes');
        if(bottoms.length)lines.push('하단배너 종류: '+bottoms.map(id=>inquiryBottomType(id,id).label).join(', '))
      }
      if(S?.bannerTypeEnabled!==false)kinds.forEach(id=>{
        const label=kindDefs.find(x=>x.id===id)?.label||id,val=v3FormatValue(state['banner.type.'+id]);
        if(val)lines.push(label+' TYPE: '+val)
      });
      const concept=v3FormatValue(state['banner.concept']),content=v3FormatValue(state['banner.content']);
      if(concept)lines.push((design.conceptLabel||'원하는 디자인 컨셉 및 색상')+': '+concept);
      if(content)lines.push((design.contentLabel||'내용 입력')+': '+content);
      if(v.textChangeQty>0)lines.push((design.textChangeLabel||inquiryOption('textImageChange','배너 · 텍스트/이미지 변경').label)+': × '+v.textChangeQty+'개');
      lines.push(...v3FieldLines(design.customFields,'banner.custom',state))
    }else if(type.id==='fourCut'){
      const ids=v3Array(state,'fourCut.type').map(String);
      if(ids.length)lines.push('인생네컷 종류: '+ids.map(id=>(design.types||[]).find(x=>String(x.id)===id)?.label||id).join(', '));
      const concept=v3FormatValue(state['fourCut.concept']);
      if(concept)lines.push((design.conceptLabel||'원하는 디자인 컨셉 및 색상')+': '+concept);
      if(v.sameDesignColorChangeQty>0)lines.push((design.colorChangeLabel||inquiryOption('sameDesignColorChange','동일 디자인 · 색상 변경').label)+': × '+v.sameDesignColorChangeQty+'개');
      lines.push(...v3FieldLines(design.customFields,'fourCut.custom',state))
    }else if(type.id==='signature'){
      const countId=v3FormatValue(state['signature.count']),countDef=(design.counts||[]).find(x=>String(x.id)===countId);
      if(countId)lines.push('시그풍 종류: '+(countDef?.label||countId)+(countId==='custom'&&state['signature.customQty']?' · '+state['signature.customQty']+'개':''));
      const mode=v3FormatValue(state['signature.mode']),modeDef=(design.modes||[]).find(x=>String(x.id)===mode);
      if(mode)lines.push('디자인 신청 방식: '+(modeDef?.label||mode));
      const content=v3FormatValue(state['signature.content']);if(content)lines.push('시그풍 숫자 및 내용: '+content);
      if(mode==='omakase'){const colors=v3FormatValue(state['signature.colors']);if(colors)lines.push('색상 입력: '+colors)}
      if(mode==='direct'){const concept=v3FormatValue(state['signature.concept']);if(concept)lines.push('원하는 디자인 컨셉 및 색상: '+concept)}
      lines.push(...v3FieldLines(design.customFields,'signature.custom',state))
    }else{
      lines.push(...v3FieldLines(design.customFields,'generic.'+type.id,state))
    }
    if(lines.length)blocks.push('['+(design.label||type.label||type.id)+']\n'+lines.join('\n'))
  });
  const extra=v3FormatValue(state.extraRequest);if(extra)blocks.push('추가 요청사항: '+extra);
  const optionLines=[];
  v.options.forEach(x=>optionLines.push(x+': 선택'));
  if(optionLines.length)blocks.push('[추가 옵션]\n'+optionLines.join('\n'));
  return blocks.join('\n\n')
}
function buildInquiryText(){
  const schema=inquirySchema(),nickname=String($('nicknameInput')?.value||'').trim(),address=String($('broadcastAddressInput')?.value||'').trim(),card=document.querySelector('.request-card'),request=card?requestText(card):'';
  const b=schema?.broadcast||{};
  return [
    (b.nicknameLabel||'방송 닉네임')+': '+nickname,
    (b.addressLabel||'방송 주소')+': '+address,
    request
  ].filter(Boolean).join('\n\n')
}
function validBroadcastUrl(value){
  try{const u=new URL(String(value||'').trim());return ['http:','https:'].includes(u.protocol)&&!!u.hostname}catch{return false}
}
function inquiryValidationState(mark){
  let firstMissing=null,message='';
  if(mark)document.querySelectorAll('.inquiry-inline-error').forEach(el=>el.remove());
  const markEl=(el,missing)=>{
    if(!el)return;
    el.classList.toggle('is-required-missing',!!missing);
    if(el.matches?.('input,textarea,select'))el.setAttribute('aria-invalid',missing?'true':'false')
  };
  const nickname=$('nicknameInput'),address=$('broadcastAddressInput'),nicknameMissing=!String(nickname?.value||'').trim(),addressValue=String(address?.value||'').trim(),addressMissing=!addressValue||!validBroadcastUrl(addressValue);
  if(mark){markEl(nickname,nicknameMissing);markEl(address,addressMissing)}
  if(nicknameMissing){firstMissing=nickname;message='방송 닉네임을 입력해주세요.'}
  else if(addressMissing){firstMissing=address;message=addressValue?'방송 주소를 올바른 URL 형식으로 입력해주세요.':'방송 주소를 입력해주세요.'}
  const card=document.querySelector('.request-card');
  if(!card)return {ok:false,first:firstMissing||nickname,message:message||'신청 정보를 확인해주세요.'};
  const selector=card.querySelector('.request-type-selector'),types=selectedInquiryTypes(card),typeMissing=!types.length;
  if(mark)selector?.classList.toggle('is-required-missing',typeMissing);
  if(!firstMissing&&typeMissing){firstMissing=selector?.querySelector('input')||selector;message='신청하시는 디자인 종류를 선택해주세요.'}
  if(!firstMissing&&window.__ARTMUG_V2__?.validateCard){
    const r=window.__ARTMUG_V2__.validateCard(card);
    if(r&&!r.ok){firstMissing=card.querySelector('[data-design-card="profile"]')||card;message=r.message||'움짤프사 필수 항목을 확인해주세요.'}
  }
  const state={...(card.__v3State||{}),...readV3Map(card)};
  if(!firstMissing&&types.some(x=>x.id==='soopBanner')){
    const kinds=v3Array(state,'bannerKinds');
    if(!kinds.length){firstMissing=card.querySelector('[data-design-card="soopBanner"]');message='SOOP 배너 종류를 선택해주세요.'}
    else if(kinds.includes('bottomBanner')&&!v3Array(state,'bottomTypes').length){firstMissing=card.querySelector('[data-design-card="soopBanner"]');message='하단배너 종류를 선택해주세요.'}
  }
  if(!firstMissing&&types.some(x=>x.id==='fourCut')&&!v3FormatValue(state['fourCut.type'])){firstMissing=card.querySelector('[data-design-card="fourCut"]');message='인생네컷 종류를 선택해주세요.'}
  if(!firstMissing&&types.some(x=>x.id==='signature')){
    const count=v3FormatValue(state['signature.count']),mode=v3FormatValue(state['signature.mode']);
    if(!count){firstMissing=card.querySelector('[data-design-card="signature"]');message='시그풍 종류를 선택해주세요.'}
    else if(count==='custom'&&Math.floor(Number(state['signature.customQty']||0))<1){firstMissing=card.querySelector('[data-v3-field="signature.customQty"]');message='시그풍 갯수를 1개 이상 입력해주세요.'}
    else if(!mode){firstMissing=card.querySelector('[data-design-card="signature"]');message='시그풍 디자인 신청 방식을 선택해주세요.'}
  }
  if(!firstMissing){
    const seen=new Set();
    for(const el of card.querySelectorAll('[data-v3-required="1"]')){
      if(el.closest('[hidden]'))continue;
      const key=String(el.dataset.v3Field||'');if(!key||seen.has(key))continue;seen.add(key);
      let missing=false;
      if(el.type==='radio'||el.type==='checkbox')missing=!card.querySelector('[data-v3-field="'+CSS.escape(key)+'"]:checked');
      else if(el.type==='number')missing=!String(el.value||'').trim()||Number(el.value)<Number(el.min||0);
      else missing=!String(el.value||'').trim();
      const wrap=el.closest('.inquiry-v3-field')||el;
      if(mark)wrap.classList.toggle('is-required-missing',missing);
      if(missing){firstMissing=el;message=(wrap.querySelector('legend,.inquiry-field-title')?.textContent||'필수 항목').replace('필수','').trim()+'을(를) 입력해주세요.';break}
    }
  }
  if(mark&&firstMissing){
    const host=firstMissing.closest?.('.inquiry-v3-field,.inquiry-v3-choice-field,.inquiry-broadcast-grid label,.request-type-selector,.inquiry-design-detail-card')||firstMissing.parentElement;
    if(host){
      const error=document.createElement('small');error.className='inquiry-inline-error';error.textContent=message||'필수 항목을 확인해주세요.';host.appendChild(error)
    }
  }
  return {ok:!firstMissing,first:firstMissing,message}
}
function validateRequiredInquiryFields(){
  $('copyStatus').textContent='';
  document.querySelectorAll('.inquiry-inline-error').forEach(el=>el.remove());
  document.querySelectorAll('.is-required-missing').forEach(el=>el.classList.remove('is-required-missing'));
  document.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.setAttribute('aria-invalid','false'));
  return true
}
function allRequiredInquiryFieldsFilled(){return true}
function clearRequiredMessageIfComplete(){
  $('copyStatus').textContent='';
  document.querySelectorAll('.inquiry-inline-error').forEach(el=>el.remove());
  document.querySelectorAll('.is-required-missing').forEach(el=>el.classList.remove('is-required-missing'));
  document.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.setAttribute('aria-invalid','false'))
}

function parsePresetOriginalName(name){
  const raw=String(name||''),m=raw.match(/^__PG_(.+?)__PM_(.+?)__(.+)$/);
  return m?{cleanName:m[3]}:{cleanName:raw}
}
function presetMetaForItem(x){
  const meta=S?.presetMeta;
  const registered=!!(x?.file&&meta&&typeof meta==='object'&&Object.prototype.hasOwnProperty.call(meta,x.file));
  const saved=registered?meta[x.file]:{};
  return {
    registered,
    name:String(saved.name||''),
    enabled:registered&&saved.enabled!==false,
    isNew:saved.isNew===true,
    isReserved:saved.isReserved===true,
    colorChangeAvailable:saved.colorChangeAvailable===true,
    colorOnlyChangeAvailable:saved.colorOnlyChangeAvailable===true
  }
}
function renderPreset(s){
  const on=!!s.presetEnabled,sec=$('presetSection');
  if(document.getElementById('showcaseSectionV2')){
    if(sec)sec.hidden=true;
    return
  }
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
    const colorNote=meta.colorChangeAvailable?'<span class="preset-color-change-note">수정가능</span>':meta.colorOnlyChangeAvailable?'<span class="preset-color-change-note">색상만 수정가능</span>':'';
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
    all=all.filter(x=>{const meta=presetMetaForItem(x);return meta.registered&&meta.enabled});
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
  const btn=$('copyButton'),ok=await copyText(buildInquiryText());
  if(ok){$('copyStatus').textContent='';showCopied(btn)}
  else{$('copyStatus').textContent='복사에 실패했습니다.'}
};
const publicSettingsPromise=window.__ARTMUG_PUBLIC_SETTINGS_PROMISE__||(window.__ARTMUG_PUBLIC_SETTINGS_PROMISE__=api('/api/public/catalog?fresh='+Date.now()));
(async()=>{try{
  const d=await publicSettingsPromise;
  renderSettings(d.settings);
  const legacyPortfolio=$('portfolioSection');
  if(document.getElementById('portfolioAllSectionV2')){
    if(legacyPortfolio)legacyPortfolio.hidden=true;
    return
  }
  const cats=visiblePortfolioCats(S.portfolioCategories||[]);
  renderPortfolioTabs(cats);
  loadPortfolio()
 }catch(e){$('portfolioStatus').textContent='설정을 불러오지 못했습니다.'}})();
