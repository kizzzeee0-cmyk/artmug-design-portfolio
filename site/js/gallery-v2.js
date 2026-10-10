(function(){
'use strict';
const C=window.ARTMUG_CONFIG||{};
const API=C.API_BASE||'';
const $=s=>document.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const media=path=>path?API+'/media/'+String(path).split('/').map(encodeURIComponent).join('/'):'';
const api=async path=>{const r=await fetch(API+path,{credentials:'include'});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()};
const state={settings:null,navSummary:null,portfolio:new Map(),showcase:{preset:[],fixed:[]},expanded:{preset:false,fixed:false},mobile:matchMedia('(max-width:680px)').matches};
const portfolioPageCache=new Map();
const portfolioOrder=['profile','top-banner','floating-banner','bottom-banner','bottom-split','four-cut'];
const bannerIds=new Set(['top-banner','floating-banner','bottom-banner','bottom-split']);
const defaults={
 profile:{pcColumns:6,pcPerPage:24,mobileColumns:4,mobilePerPage:16},
 'top-banner':{pcColumns:2,pcPerPage:18,mobileColumns:2,mobilePerPage:18},
 'floating-banner':{pcColumns:8,pcPerPage:24,mobileColumns:5,mobilePerPage:15},
 'bottom-banner':{pcColumns:2,pcPerPage:16,mobileColumns:2,mobilePerPage:16},
 'bottom-split':{pcColumns:2,pcPerPage:10,mobileColumns:2,mobilePerPage:10},
 'four-cut':{pcColumns:5,pcPerPage:15,mobileColumns:3,mobilePerPage:9}
};
function layoutKey(c){
 const id=String(c?.id||''),label=String(c?.label||'').replace(/\s/g,'');
 if(/^profile(?:-|$)/.test(id)||label.includes('움짤프사'))return'profile';
 if(id==='top-banner'||label.includes('상단배너'))return'top-banner';
 if(id==='floating-banner'||label.includes('플로팅'))return'floating-banner';
 if(id==='bottom-banner'||label.includes('하단배너일반'))return'bottom-banner';
 if(id==='bottom-split'||label.includes('하단배너분할'))return'bottom-split';
 if(/four-cut|4cut/.test(id)||label.includes('인생네컷'))return'four-cut';
 return id||'custom'
}
function catConfig(c){
 const k=layoutKey(c),d=defaults[k]||{pcColumns:4,pcPerPage:16,mobileColumns:2,mobilePerPage:10};
 return {
  columns:state.mobile?Number(c.mobileColumns||d.mobileColumns):Number(c.pcColumns||d.pcColumns),
  perPage:state.mobile?Number(c.mobilePerPage||d.mobilePerPage):Number(c.pcPerPage||d.pcPerPage)
 }
}
function visibleCats(){
 const cats=(state.settings?.portfolioCategories||[]).filter(c=>c.enabled!==false&&!c.hiddenLegacy);
 const seen=new Set(),out=[];
 const get=id=>cats.find(c=>layoutKey(c)===id||c.id===id);
 portfolioOrder.forEach(id=>{const c=get(id);if(c&&!seen.has(c.id)){seen.add(c.id);out.push(c)}});
 cats.forEach(c=>{if(!seen.has(c.id)&&layoutKey(c)!=='profile'){seen.add(c.id);out.push(c)}});
 return out
}
async function fetchAll(kind,category){
 const base=kind==='preset'?'/api/public/presets?category=':'/api/public/portfolio?category=';
 const first=await api(base+encodeURIComponent(category)+'&page=1&perPage=60');
 const count=Number(first.totalPages||1);
 if(count<=1)return [...(first.items||[])];
 const rest=await Promise.all(Array.from({length:count-1},(_,i)=>api(base+encodeURIComponent(category)+'&page='+(i+2)+'&perPage=60').catch(()=>({items:[]}))));
 return [...(first.items||[]),...rest.flatMap(d=>d.items||[])]
}
async function fetchPortfolioPage(category,page,perPage,filter='ALL'){
 const key=[category,page,perPage,filter].join('|');
 if(portfolioPageCache.has(key))return portfolioPageCache.get(key);
 const promise=api('/api/public/portfolio?category='+encodeURIComponent(category)+'&page='+page+'&perPage='+perPage+'&filter='+encodeURIComponent(filter)).catch(e=>{portfolioPageCache.delete(key);throw e});
 portfolioPageCache.set(key,promise);
 return promise
}
function applyOrder(items,order){
 const pos=new Map((order||[]).map((x,i)=>[x,i]));
 return [...items].sort((a,b)=>(pos.get(a.file)??1e9)-(pos.get(b.file)??1e9))
}
function pmeta(x){
 const m=state.settings?.portfolioMeta?.[x.file]||{};
 const isFixed=m.isFixed===true;
 return {
  enabled:m.enabled!==false,
  bannerType:isFixed?'':(['A','B'].includes(m.bannerType)?m.bannerType:(bannerIds.has(layoutKey({id:x.category,label:x.category}))?'B':'')),
  featured:m.featured===true,
  isFixed
 }
}
function smeta(x){
 const m=state.settings?.presetMeta?.[x.file]||{};
 const inferred=x.category==='floating-banner'?'fixed':'preset';
 return {
  name:String(m.name||x.originalName||''),
  enabled:m.enabled!==undefined?m.enabled:x.enabled!==false,
  isNew:m.isNew===true,isReserved:m.isReserved===true,isSold:m.isSold===true,
  colorChangeAvailable:m.colorChangeAvailable===true,
  showcaseKind:['preset','fixed'].includes(m.showcaseKind)?m.showcaseKind:inferred,
  featured:m.featured===true,
  bannerType:['A','B'].includes(m.bannerType)?m.bannerType:''
 }
}
function itemCard(x,c){
 const k=layoutKey(c),m=pmeta(x),fixed=k==='floating-banner'&&m.isFixed,type=bannerIds.has(k)&&!fixed?(m.bannerType||'B'):'';
 const badge=fixed
  ?'<span class="v2-type-badge v2-fixed-badge"><span class="v2-badge-label">고정틀</span></span>'
  :type?'<span class="v2-type-badge"><span class="v2-badge-label">TYPE '+type+'</span></span>':'';
 return '<article class="v2-work-card '+(k==='profile'?'is-profile':'')+'"'+(x.__v2SplitSlot?' data-split-slot="'+x.__v2SplitSlot+'"':'')+'>'+
   '<div class="v2-media"><img src="'+esc(media(x.demoSrc||x.file))+'" alt="'+esc(x.alt||x.originalName||c.label)+'" loading="lazy" decoding="async" draggable="false"></div>'+
   (badge?'<div class="v2-work-tags">'+badge+'</div>':'')+
  '</article>'
}
function presetCard(x){
 const m=smeta(x),c=(state.settings?.presetCategories||[]).find(v=>v.id===x.category)||{},profile=layoutKey(c)==='profile';
 const badge=m.isSold?'판매완료':m.isReserved?'예약중':m.isNew?'NEW':'';
 const statusClass=m.isSold?'is-sold':m.isReserved?'is-reserved':'is-new';
 return '<article class="v2-showcase-card '+(profile?'is-profile':'')+'" data-file="'+esc(x.file)+'">'+
   (badge?'<span class="v2-mobile-status '+statusClass+'"><span class="v2-badge-label">'+esc(badge)+'</span></span>':'')+
   '<div class="v2-showcase-media"><img src="'+esc(media(x.demoSrc||x.file))+'" alt="'+esc(m.name||'프리셋')+'" loading="lazy" decoding="async" draggable="false"></div>'+
   '<div class="v2-showcase-name-row"><strong>'+esc(m.name||'이름 없음')+'</strong>'+(badge?'<span class="v2-inline-status '+statusClass+'"><span class="v2-badge-label">'+esc(badge)+'</span></span>':'')+'</div>'+
   (m.colorChangeAvailable?'<span class="v2-editable-note">수정가능</span>':'')+
  '</article>'
}
function pagination(catId,total,page){
 if(total<=1)return'';
 const maxDots=state.mobile?9:26;
 const start=Math.max(1,Math.min(total-maxDots+1,page-Math.floor(maxDots/2)));
 const stop=Math.min(total,start+maxDots-1);
 let html='<nav class="v2-pagination" aria-label="페이지 이동">'+
   '<button class="v2-page-arrow" type="button" aria-label="이전 페이지" data-v2-page="'+catId+':prev" '+(page<=1?'disabled':'')+'>‹</button>'+
   '<div class="v2-page-dots" aria-label="페이지 선택">';
 for(let i=start;i<=stop;i++)html+='<button class="v2-page-dot '+(i===page?'is-active':'')+'" type="button" data-v2-page="'+catId+':'+i+'" aria-label="'+i+'페이지" aria-current="'+(i===page?'page':'false')+'" title="'+i+'페이지"></button>';
 return html+'</div><span class="v2-page-counter">'+page+' / '+total+'</span>'+
  '<button class="v2-page-arrow" type="button" aria-label="다음 페이지" data-v2-page="'+catId+':next" '+(page>=total?'disabled':'')+'>›</button></nav>'
}
function mixAB(items){
 const a=items.filter(x=>{const m=pmeta(x);return !m.isFixed&&m.bannerType==='A'});
 const b=items.filter(x=>{const m=pmeta(x);return !m.isFixed&&m.bannerType==='B'});
 const fixed=items.filter(x=>pmeta(x).isFixed);
 if(!a.length&&!b.length)return items;
 const out=[];let i=0,j=0,k=0;
 while(i<a.length||j<b.length||k<fixed.length){
  if(i<a.length)out.push(a[i++]);
  if(j<b.length)out.push(b[j++]);
  if(k<fixed.length)out.push(fixed[k++])
 }
 return out
}
function guideHtml(cat){
 if(!bannerIds.has(layoutKey(cat)))return'';
 const g=state.settings?.bannerTypeGuide||{},A=g.A||{},B=g.B||{};
 return '<details class="v2-type-guide"><summary>TYPE A / B 차이 보기</summary><div class="v2-type-guide-grid">'+
  [['A',A,'장식과 패턴이 적은 깔끔한 구성'],['B',B,'패턴과 장식이 더 풍부한 구성']].map(([t,x,desc])=>{
   const image=x.referenceImage||x.referenceFile||'';
   return '<div class="v2-type-guide-item">'+
    (image?'<img src="'+esc(media(image))+'" alt="TYPE '+t+' 통합 대표 이미지" loading="lazy" decoding="async">':'')+
    '<div><strong>TYPE '+t+'</strong><p>'+esc(x.description||desc)+'</p></div></div>'
  }).join('')+'</div></details>'
}
function imageSizeFor(x){
 if(x.__v2NaturalWidth&&x.__v2NaturalHeight)return Promise.resolve([x.__v2NaturalWidth,x.__v2NaturalHeight]);
 return new Promise(resolve=>{
  const im=new Image();
  const done=(w,h)=>{x.__v2NaturalWidth=w||0;x.__v2NaturalHeight=h||0;resolve([x.__v2NaturalWidth,x.__v2NaturalHeight])};
  im.onload=()=>done(im.naturalWidth,im.naturalHeight);
  im.onerror=()=>done(0,0);
  im.src=media(x.demoSrc||x.file)
 })
}
async function preclassifyBottomSplit(items){
 await Promise.all(items.map(async x=>{
  const [w,h]=await imageSizeFor(x);
  x.__v2SplitSlot=w===720&&h===450?'left':w===1440&&h===450?'right':'other'
 }));
 const left=items.filter(x=>x.__v2SplitSlot==='left'),right=items.filter(x=>x.__v2SplitSlot==='right'),other=items.filter(x=>x.__v2SplitSlot==='other');
 if(!left.length||!right.length)return items;
 const out=[];let i=0,j=0;
 while(i<left.length||j<right.length){if(i<left.length)out.push(left[i++]);if(j<right.length)out.push(right[j++])}
 out.push(...other);
 return out
}
function arrangeSplit(root){
 const cards=$$('.v2-work-card',root);
 if(!cards.length)return;
 const place=rows=>{
  const left=rows.filter(x=>x.slot==='left'),right=rows.filter(x=>x.slot==='right'),other=rows.filter(x=>x.slot!=='left'&&x.slot!=='right');
  root.innerHTML='<div class="v2-split-col" data-col="left"></div><div class="v2-split-col" data-col="right"></div>';
  const L=root.querySelector('[data-col="left"]'),R=root.querySelector('[data-col="right"]');
  if(left.length&&right.length){
   left.forEach(x=>L.appendChild(x.card));right.forEach(x=>R.appendChild(x.card));other.forEach((x,i)=>(i%2?R:L).appendChild(x.card))
  }else{
   rows.forEach((x,i)=>(i%2?R:L).appendChild(x.card))
  }
 };
 const known=cards.map(card=>({card,slot:card.dataset.splitSlot||''}));
 if(known.every(x=>x.slot)){place(known);return}
 let loaded=0;const rows=[];
 cards.forEach(card=>{
  const img=card.querySelector('img');
  const done=()=>{
   const w=img?.naturalWidth||0,h=img?.naturalHeight||0;
   rows.push({card,slot:w===720&&h===450?'left':w===1440&&h===450?'right':'other'});
   if(++loaded===cards.length)place(rows)
  };
  if(img?.complete&&img.naturalWidth)done();else if(img)img.addEventListener('load',done,{once:true});else done()
 })
}
async function loadRemotePortfolioPage(data){
 const cfg=catConfig(data.cat),res=await fetchPortfolioPage(data.cat.id,data.page||1,cfg.perPage,data.filter||'ALL');
 data.items=applyOrder(res.items||[],state.settings.portfolioOrder).filter(x=>pmeta(x).enabled);
 data.total=Number(res.total||data.items.length);
 data.totalPages=Math.max(1,Number(res.totalPages||1));
 data.availableFilters=Array.isArray(res.availableFilters)?res.availableFilters:[];
 return data
}
async function renderPortfolioCategory(id,scroll,loadRemote=true){
 const data=state.portfolio.get(id);if(!data)return;
 const {cat}=data,k=layoutKey(cat),cfg=catConfig(cat);
 const sec=document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]');if(!sec)return;
 if(data.remote&&loadRemote){
  sec.setAttribute('aria-busy','true');
  try{await loadRemotePortfolioPage(data)}catch(e){sec.innerHTML='<p class="v2-loading">작품을 불러오지 못했습니다.</p>';sec.removeAttribute('aria-busy');return}
 }
 let items,pages,filterValues;
 if(data.remote){
  items=data.items||[];
  pages=Math.max(1,Number(data.totalPages||1));
  filterValues=bannerIds.has(k)?['ALL',...(data.availableFilters||[])]:[];
 }else{
  items=(data.items||[]).filter(x=>pmeta(x).enabled);
  if(data.filter==='A'||data.filter==='B')items=items.filter(x=>{const m=pmeta(x);return !m.isFixed&&m.bannerType===data.filter});
  else if(data.filter==='FIXED'&&k==='floating-banner')items=items.filter(x=>pmeta(x).isFixed);
  else if(bannerIds.has(k))items=mixAB(items);
  const presentTypes=bannerIds.has(k)?['A','B'].filter(t=>(data.items||[]).some(x=>{const m=pmeta(x);return !m.isFixed&&m.bannerType===t})):[];
  const hasFixed=k==='floating-banner'&&(data.items||[]).some(x=>pmeta(x).isFixed);
  filterValues=bannerIds.has(k)?['ALL',...presentTypes,...(hasFixed?['FIXED']:[])]:[];
  pages=Math.max(1,Math.ceil(items.length/cfg.perPage));
  data.page=Math.min(Math.max(1,data.page||1),pages);
  items=items.slice((data.page-1)*cfg.perPage,data.page*cfg.perPage)
 }
 if(data.filter!=='ALL'&&!filterValues.includes(data.filter)){data.filter='ALL';data.page=1;if(data.remote)return renderPortfolioCategory(id,scroll,true)}
 data.page=Math.min(Math.max(1,data.page||1),pages);
 const controls=bannerIds.has(k)?'<div class="v2-type-filter">'+filterValues.map(v=>'<button type="button" data-v2-filter="'+id+':'+v+'" class="'+((data.filter||'ALL')===v?'is-active':'')+'">'+(v==='ALL'?'전체':v==='FIXED'?'고정틀':'TYPE '+v)+'</button>').join('')+'</div>':'';
 sec.hidden=false;
 sec.innerHTML='<div class="v2-cat-head"><h3>'+esc(cat.label)+'</h3>'+controls+'</div>'+guideHtml(cat)+
  '<div class="v2-cat-grid v2-layout-'+k+' '+(k==='bottom-split'?'is-bottom-split':'')+'" style="--v2-cols:'+cfg.columns+'">'+items.map(x=>itemCard(x,cat)).join('')+'</div>'+
  pagination(id,pages,data.page);
 const grid=sec.querySelector('.v2-cat-grid');if(k==='bottom-split'&&grid&&items.length)arrangeSplit(grid);
 sec.querySelectorAll('[data-v2-filter]').forEach(b=>b.onclick=async()=>{
  const [,f]=b.dataset.v2Filter.split(':');data.filter=f;data.page=1;
  await renderPortfolioCategory(id,true,true);announceActive('portfolio:'+id+':'+f)
 });
 sec.querySelectorAll('[data-v2-page]').forEach(b=>b.onclick=async()=>{
  const token=b.dataset.v2Page.split(':').pop();
  data.page=token==='prev'?data.page-1:token==='next'?data.page+1:Number(token);
  await renderPortfolioCategory(id,true,true)
 });
 sec.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',requestHeight,{once:true})});
 sec.removeAttribute('aria-busy');
 sendDetailedSectionMap();requestHeight();
 if(scroll)scrollToElement(sec)
}
async function renderPortfolio(){
 const root=$('#portfolioAllSections');if(!root)return;
 state.portfolio.clear();
 let cats=visibleCats();
 const counts=state.navSummary?.categoryCounts;
 if(counts&&typeof counts==='object'){
  cats=cats.filter(cat=>{
   if(layoutKey(cat)==='profile'){
    return (state.settings.portfolioCategories||[]).filter(c=>/^profile(?:-|$)/.test(String(c.id||''))).some(c=>Number(counts[c.id]||0)>0)
   }
   return Number(counts[cat.id]||0)>0
  })
 }
 if(!cats.length){root.innerHTML='';$('#portfolioAllSectionV2').hidden=true;return}
 $('#portfolioAllSectionV2').hidden=false;
 root.innerHTML=cats.map(cat=>'<section class="v2-portfolio-category" data-v2-cat="'+esc(cat.id)+'" id="portfolio-'+esc(cat.id)+'"><p class="v2-loading">작품을 불러오는 중…</p></section>').join('');
 let shown=0;
 const tasks=cats.map(async cat=>{
  const k=layoutKey(cat),sec=document.querySelector('[data-v2-cat="'+CSS.escape(cat.id)+'"]');
  try{
   if(k==='profile'){
    const physical=(state.settings.portfolioCategories||[]).filter(c=>/^profile(?:-|$)/.test(String(c.id||'')));
    const batches=await Promise.all(physical.map(p=>fetchAll('portfolio',p.id).catch(()=>[])));
    const items=applyOrder(batches.flat(),state.settings.portfolioOrder).filter(x=>pmeta(x).enabled);
    if(!items.length){sec.hidden=true;return}
    state.portfolio.set(cat.id,{cat,items,page:1,filter:'ALL',remote:false});shown++;
    await renderPortfolioCategory(cat.id,false,false);return
   }
   if(k==='bottom-split'){
    let items=applyOrder(await fetchAll('portfolio',cat.id).catch(()=>[]),state.settings.portfolioOrder).filter(x=>pmeta(x).enabled);
    if(!items.length){sec.hidden=true;return}
    items=await preclassifyBottomSplit(items);
    state.portfolio.set(cat.id,{cat,items,page:1,filter:'ALL',remote:false});shown++;
    await renderPortfolioCategory(cat.id,false,false);return
   }
   const cfg=catConfig(cat),res=await fetchPortfolioPage(cat.id,1,cfg.perPage,'ALL');
   const items=applyOrder(res.items||[],state.settings.portfolioOrder).filter(x=>pmeta(x).enabled);
   if(!items.length){sec.hidden=true;return}
   state.portfolio.set(cat.id,{cat,items,page:1,filter:'ALL',remote:true,total:Number(res.total||items.length),totalPages:Math.max(1,Number(res.totalPages||1)),availableFilters:Array.isArray(res.availableFilters)?res.availableFilters:[]});
   shown++;await renderPortfolioCategory(cat.id,false,false)
  }catch(e){if(sec)sec.innerHTML='<p class="v2-loading">작품을 불러오지 못했습니다.</p>'}
 });
 await Promise.all(tasks);
 if(!shown){root.innerHTML='';$('#portfolioAllSectionV2').hidden=true;return}
 announceNavData();sendDetailedSectionMap();requestHeight()
}
async function renderShowcase(){
 const root=$('#showcaseSectionV2');if(!root)return;
 if(state.settings?.presetEnabled===false){root.hidden=true;root.innerHTML='';state.showcase.preset=[];state.showcase.fixed=[];return}
 const presetCats=(state.settings.presetCategories||[]).filter(c=>c.enabled!==false);
 const presetBatches=await Promise.all(presetCats.map(cat=>fetchAll('preset',cat.id).catch(()=>[])));
 let all=applyOrder(presetBatches.flat(),state.settings.presetOrder).filter(x=>smeta(x).enabled);
 const preset=all.filter(x=>smeta(x).showcaseKind!=='fixed'),fixed=all.filter(x=>smeta(x).showcaseKind==='fixed');
 state.showcase.preset=preset;state.showcase.fixed=fixed;
 const cols=[];
 for(const kind of ['preset','fixed']){
  const areaEnabled=kind==='preset'?state.settings.showcasePresetEnabled!==false:state.settings.showcaseFixedEnabled!==false;
  if(!areaEnabled)continue;
  const arr=state.showcase[kind];
  const featured=arr.filter(x=>smeta(x).featured),rest=arr.filter(x=>!smeta(x).featured),ordered=[...featured,...rest];
  const limit=state.mobile?(kind==='preset'?4:Number(state.settings.showcaseInitialMobile||2)):Number(state.settings.showcaseInitialDesktop||4);
  const shown=state.expanded[kind]?ordered:ordered.slice(0,limit);
  const expandEnabled=kind==='preset'?state.settings.showcasePresetExpandEnabled!==false:state.settings.showcaseFixedExpandEnabled!==false;
  const description=kind==='preset'
    ? String(state.settings.showcasePresetDescription??state.settings.presetNotice??'아직 판매되지 않은 작업물입니다. 그대로 제작을 원하시면 문의 시 말씀해 주세요.')
    : String(state.settings.showcaseFixedDescription??'색상이나 일부 디자인은 수정될 수 있지만 전체적인 디자인은 다 똑같이 제작됩니다.');
  cols.push('<section class="v2-showcase-column" data-showcase-kind="'+kind+'" id="showcase-'+kind+'">'+
    '<div class="v2-showcase-head"><h3>'+(kind==='preset'?'미판매 프리셋':'고정틀')+'</h3></div>'+
    '<p class="v2-showcase-description">'+esc(description)+'</p>'+
    (shown.length?'<div class="v2-showcase-grid">'+shown.map(presetCard).join('')+'</div>':'<div class="v2-showcase-empty">준비중입니다</div>')+
    (expandEnabled&&ordered.length>limit?'<button type="button" class="v2-show-all" data-show-all="'+kind+'">'+(state.expanded[kind]?'접기':'전체보기')+'</button>':'')+'</section>')
 }
 if(!cols.length){root.hidden=true;root.innerHTML='';return}
 root.hidden=false;
 root.innerHTML='<h2>미판매 프리셋 · 고정틀</h2><div class="v2-showcase-columns">'+cols.join('')+'</div>';
 root.querySelectorAll('[data-show-all]').forEach(b=>b.onclick=()=>{state.expanded[b.dataset.showAll]=!state.expanded[b.dataset.showAll];renderShowcase();requestHeight()});
 root.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',requestHeight,{once:true})});
 requestHeight();announceNavData()
}
function requestHeight(){
 window.dispatchEvent(new Event('artmug-sections-changed'));
 requestAnimationFrame(sendDetailedSectionMap);
 setTimeout(()=>{window.dispatchEvent(new Event('artmug-sections-changed'));sendDetailedSectionMap()},80)
}
function scrollToElement(el){
 if(!el)return;
 const offset=Math.max(0,Math.round(el.getBoundingClientRect().top+window.scrollY-8));
 let sent=false;
 try{if(window.parent!==window){window.parent.postMessage({type:'artmug-scroll-request',offset,role:document.body.classList.contains('artmug-part-inquiry')?'inquiry':document.body.classList.contains('artmug-part-portfolio')?'portfolio':'full'},'*');sent=true}}catch{}
 if(!sent||window.parent===window)window.scrollTo({top:offset,behavior:'smooth'});
 requestHeight()
}
function navigate(target){
 target=String(target||'');
 if(target==='top'){try{window.parent.postMessage({type:'artmug-scroll-request',offset:0,top:true},'*')}catch{};window.scrollTo({top:0,behavior:'smooth'});return}
 if(target==='notice')return scrollToElement($('.notice-card'));
 if(target==='inquiry')return scrollToElement($('#inquirySection')||$('.form-card'));
 if(target==='preset'||target==='showcase-preset')return scrollToElement($('#showcase-preset'));
 if(target==='fixed'||target==='showcase-fixed')return scrollToElement($('#showcase-fixed'));
 if(target==='portfolio')return scrollToElement($('#portfolioAllSectionV2'));
 if(target==='banner:A'||target==='banner:B'){
  const type=target.slice(-1);
  const entry=[...state.portfolio.entries()].find(([id,d])=>bannerIds.has(layoutKey(d.cat))&&(d.remote?(d.availableFilters||[]).includes(type):(d.items||[]).some(x=>{const m=pmeta(x);return !m.isFixed&&m.bannerType===type})));
  if(!entry)return;
  const [id,d]=entry;d.filter=type;d.page=1;
  renderPortfolioCategory(id,false,true).then(()=>scrollToElement(document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]')));
  return
 }
 if(target.startsWith('portfolio:')){
  const [,id,type]=target.split(':');const d=state.portfolio.get(id);
  if(d&&type&&['A','B','ALL','FIXED'].includes(type)){d.filter=type;d.page=1;renderPortfolioCategory(id,false,true).then(()=>scrollToElement(document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]')));return}
  return scrollToElement(document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]'))
 }
}
function announceActive(target){
 try{window.__v2nav?.postMessage({type:'active',target})}catch{}
}
function sendDetailedSectionMap(){
 const sections=[];
 const add=(target,el)=>{
  if(!el||el.hidden||!el.getClientRects().length)return;
  sections.push({target,offset:Math.max(0,Math.round(el.getBoundingClientRect().top+window.scrollY))})
 };
 add('notice',$('.notice-card'));
 add('showcase-preset',$('#showcase-preset'));
 add('showcase-fixed',$('#showcase-fixed'));
 state.portfolio.forEach((d,id)=>{
  const target='portfolio:'+id+(['A','B','FIXED'].includes(d.filter)?':'+d.filter:'');
  add(target,document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]'))
 });
 add('inquiry',$('#inquirySection'));
 const role=document.body.classList.contains('artmug-part-inquiry')?'inquiry':document.body.classList.contains('artmug-part-portfolio')?'portfolio':'full';
 try{if(window.parent!==window)window.parent.postMessage({type:'artmug-v2-section-map',role,sections},'*')}catch{}
}
function announceNavData(){
 const cats=[...state.portfolio.entries()].map(([id,d])=>{
  const filters=d.remote?(d.availableFilters||[]):null;
  return {id,label:d.cat.label,banner:bannerIds.has(layoutKey(d.cat)),
   hasA:filters?filters.includes('A'):(d.items||[]).some(x=>{const m=pmeta(x);return !m.isFixed&&m.bannerType==='A'}),
   hasB:filters?filters.includes('B'):(d.items||[]).some(x=>{const m=pmeta(x);return !m.isFixed&&m.bannerType==='B'}),
   hasFixed:layoutKey(d.cat)==='floating-banner'&&(filters?filters.includes('FIXED'):(d.items||[]).some(x=>pmeta(x).isFixed))}
 });
 const payload={type:'nav-data',preset:state.showcase.preset.length>0,fixed:state.showcase.fixed.length>0,categories:cats};
 try{window.__v2nav?.postMessage(payload)}catch{}
}
function initNav(){
 if('BroadcastChannel'in window){
  const ch=new BroadcastChannel('artmug-portfolio-section-nav');window.__v2nav=ch;
  ch.addEventListener('message',e=>{const d=e.data;if(d?.type==='navigate')navigate(d.target)})
 }
 window.addEventListener('message',e=>{const d=e.data;if(d?.type==='artmug-section-nav')navigate(d.target)})
}
function selectedTypeInputs(card){
 return Array.from(card.querySelectorAll('input[data-field="requestType"]:checked')).map(i=>({id:i.value,label:i.parentElement?.innerText?.trim()||''}))
}
function injectInquiry(card){
 const fields=card.querySelector('.request-fields');if(!fields)return;
 const types=selectedTypeInputs(card),hasProfile=types.some(x=>/움짤\s*프사/.test(x.label)||x.id==='profile-a'),hasFloating=types.some(x=>/플로팅/.test(x.label));
 const banners=types.filter(x=>/배너/.test(x.label));
 let box=fields.querySelector('.v2-inquiry-enhancements');
 if(!box){box=document.createElement('div');box.className='v2-inquiry-enhancements';fields.prepend(box)}
 const profileMode=card.dataset.profileMode||'custom',floatingMode=card.dataset.floatingMode||'custom';
 const availableProfilePresets=state.showcase.preset.filter(x=>{const c=(state.settings?.presetCategories||[]).find(v=>v.id===x.category)||{},m=smeta(x);return layoutKey(c)==='profile'&&m.enabled&&!m.isSold});
 const availableFixed=state.showcase.fixed.filter(x=>{const c=(state.settings?.presetCategories||[]).find(v=>v.id===x.category)||{},m=smeta(x);return layoutKey(c)==='floating-banner'&&m.enabled&&!m.isReserved&&!m.isSold});
 let html='';
 if(hasProfile){
  html+='<fieldset class="v2-mode-field choice-field inquiry-plain-choice"><legend data-question-title>움짤프사 신청 방식</legend><div class="choice-row">'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="custom" '+(profileMode==='custom'?'checked':'')+'><span>맞춤제작</span></label>'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="preset" '+(profileMode==='preset'?'checked':'')+'><span>프리셋 구매</span></label></div></fieldset>';
  if(profileMode==='preset')html+=selectionHtml('preset',card.dataset.selectedPresetFile)
 }
 if(hasFloating){
  html+='<fieldset class="v2-mode-field choice-field inquiry-plain-choice"><legend data-question-title>플로팅 배너 신청 방식</legend><div class="choice-row">'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="floating" name="v2-floating-'+card.dataset.requestId+'" value="custom" '+(floatingMode==='custom'?'checked':'')+'><span>맞춤제작</span></label>'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="floating" name="v2-floating-'+card.dataset.requestId+'" value="fixed" '+(floatingMode==='fixed'?'checked':'')+'><span>고정틀</span></label></div></fieldset>';
  if(floatingMode==='fixed')html+=selectionHtml('fixed',card.dataset.selectedFixedFile)
 }
 if(banners.length){
  html+='<div class="v2-banner-type-fields">'+banners.map((x,i)=>{
   const key='bannerType'+i;
   let autoType='';
   if(/플로팅/.test(x.label)&&floatingMode==='fixed'&&card.dataset.selectedFixedFile){
     const fixed=state.showcase.fixed.find(v=>v.file===card.dataset.selectedFixedFile);
     autoType=fixed?smeta(fixed).bannerType:''
   }
   const val=autoType||card.dataset[key]||'B';
   if(autoType)card.dataset[key]=autoType;
   return '<fieldset class="v2-mode-field choice-field inquiry-plain-choice"><legend data-question-title>'+esc(x.label)+' TYPE</legend><div class="choice-row">'+
    ['A','B'].map(t=>'<label class="choice-pill"><input type="radio" data-v2-banner-index="'+i+'" data-v2-banner-label="'+esc(x.label)+'" name="v2-banner-'+card.dataset.requestId+'-'+i+'" value="'+t+'" '+(val===t?'checked':'')+' '+(autoType?'disabled':'')+'><span>TYPE '+t+'</span></label>').join('')+
   '</div></fieldset>'
  }).join('')+'</div>'
 }
 // Preserve selected radio nodes across MutationObserver refreshes.
 if(box.dataset.renderSignature!==html){box.innerHTML=html;box.dataset.renderSignature=html}
 const profileOnly=hasProfile&&types.length===1&&profileMode==='preset';
 fields.querySelectorAll('.concept-request-field,.frame-retention-field').forEach(el=>el.classList.toggle('v2-hidden-field',profileOnly));
 box.querySelectorAll('[data-v2-mode]').forEach(i=>i.onchange=()=>{card.dataset[i.dataset.v2Mode+'Mode']=i.value;injectInquiry(card);requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.())});
 box.querySelectorAll('[data-v2-banner-index]').forEach(i=>i.onchange=()=>{card.dataset['bannerType'+i.dataset.v2BannerIndex]=i.value});
 box.querySelectorAll('[data-v2-select]').forEach(b=>b.onclick=()=>{
  const kind=b.dataset.v2Select,file=b.dataset.file;
  if(kind==='preset')card.dataset.selectedPresetFile=file;else card.dataset.selectedFixedFile=file;
  injectInquiry(card);requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.())
 });
 requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.())
}
function selectionHtml(kind,selected){
 let arr=state.showcase[kind].filter(x=>smeta(x).enabled);
 if(kind==='preset')arr=arr.filter(x=>{const c=(state.settings?.presetCategories||[]).find(v=>v.id===x.category)||{};return layoutKey(c)==='profile'});
 if(kind==='fixed')arr=arr.filter(x=>{const c=(state.settings?.presetCategories||[]).find(v=>v.id===x.category)||{};return layoutKey(c)==='floating-banner'});
 const label=kind==='preset'?'프리셋 선택':'고정틀 선택';
 const options=arr.map(x=>{
  const m=smeta(x),disabled=m.isSold||(kind==='fixed'&&m.isReserved);
  const status=m.isSold?'판매완료':m.isReserved?'예약중':m.isNew?'NEW':'';
  return '<button type="button" data-v2-select="'+kind+'" data-file="'+esc(x.file)+'" class="'+(selected===x.file?'is-selected':'')+'" '+(disabled?'disabled':'')+'>'+
   '<img src="'+esc(media(x.demoSrc||x.file))+'" alt=""><span>'+esc(m.name||'이름 없음')+'</span>'+
   (status?'<em>'+status+'</em>':'')+'</button>'
 }).join('');
 return '<fieldset class="v2-mode-field v2-product-select choice-field inquiry-plain-choice" data-product-kind="'+kind+'"><legend data-question-title>'+label+'</legend>'+
  '<div class="v2-product-grid">'+(options||'<p class="v2-empty-products">현재 선택 가능한 상품이 없습니다.</p>')+'</div></fieldset>'
}
function initInquiryObserver(){
 const root=$('#requestsContainer');if(!root)return;
 const sync=()=>root.querySelectorAll('.request-card').forEach(injectInquiry);
 let pending=false;
 const mo=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;sync()})});
 mo.observe(root,{subtree:true,childList:true});
 root.addEventListener('change',e=>{if(e.target.matches('input[data-field="requestType"]'))setTimeout(sync,0)});
 sync()
}
function selectedProductName(card,kind){
 const file=kind==='preset'?card.dataset.selectedPresetFile:card.dataset.selectedFixedFile;
 const x=state.showcase[kind].find(v=>v.file===file);return x?smeta(x).name:''
}
function selectedProductStatus(card,kind){
 const file=kind==='preset'?card.dataset.selectedPresetFile:card.dataset.selectedFixedFile;
 const x=state.showcase[kind].find(v=>v.file===file);
 if(!x)return'';
 const m=smeta(x);
 return m.isSold?'판매완료':m.isReserved?'예약중':m.isNew?'NEW':''
}
window.__ARTMUG_V2__={
 inquiryData(card){
  const types=selectedTypeInputs(card),banners=types.filter(x=>/배너/.test(x.label));
  return {
   profileMode:card.dataset.profileMode||'custom',
   floatingMode:card.dataset.floatingMode||'custom',
   selectedPresetFile:card.dataset.selectedPresetFile||'',
   selectedPresetName:selectedProductName(card,'preset'),
   selectedPresetStatus:selectedProductStatus(card,'preset'),
   selectedFixedFile:card.dataset.selectedFixedFile||'',
   selectedFixedName:selectedProductName(card,'fixed'),
   bannerTypes:banners.map((x,i)=>({label:x.label,type:card.dataset['bannerType'+i]||'B'})),
   profileSelected:types.some(x=>/움짤\s*프사/.test(x.label)||x.id==='profile-a'),
   floatingSelected:types.some(x=>/플로팅/.test(x.label))
  }
 },
 validateCard(card){
  const d=this.inquiryData(card);
  if(d.profileSelected&&d.profileMode==='preset'&&!d.selectedPresetFile)return {ok:false,message:'구매할 프리셋을 선택해주세요.'};
  if(d.floatingSelected&&d.floatingMode==='fixed'&&!d.selectedFixedFile)return {ok:false,message:'구매할 고정틀을 선택해주세요.'};
  return {ok:true}
 },
 inquiryLines(card){
  const d=this.inquiryData(card),out=[];
  if(d.profileSelected){
   out.push('움짤프사 신청 방식: '+(d.profileMode==='preset'?'프리셋 구매':'맞춤제작'));
   if(d.profileMode==='preset'&&d.selectedPresetName){
    out.push('선택 프리셋: '+d.selectedPresetName+' ['+d.selectedPresetFile+']');
    if(d.selectedPresetStatus)out.push('프리셋 상태: '+d.selectedPresetStatus)
   }
  }
  if(d.floatingSelected){out.push('플로팅 배너 신청 방식: '+(d.floatingMode==='fixed'?'고정틀':'맞춤제작'));if(d.floatingMode==='fixed'&&d.selectedFixedName)out.push('선택 고정틀: '+d.selectedFixedName+' ['+d.selectedFixedFile+']')}
  d.bannerTypes.forEach(x=>out.push(x.label+' TYPE: '+x.type));
  return out
 }
};
async function init(){
 initNav();
 const [d,nav]=await Promise.all([
  api('/api/public/settings?fresh='+Date.now()),
  api('/api/public/nav-summary').catch(()=>null)
 ]);
 state.settings=d.settings||{};
 state.navSummary=nav||null;
 const title=$('#portfolioAllTitle');if(title)title.textContent=state.settings.portfolioTitle||'포트폴리오';
 const showcasePromise=renderShowcase(),portfolioPromise=renderPortfolio();
 await showcasePromise;
 initInquiryObserver();
 await portfolioPromise;
 document.addEventListener('contextmenu',e=>{if(e.target.closest?.('.v2-media,.v2-showcase-media,.v2-product-grid'))e.preventDefault()});
 document.addEventListener('dragstart',e=>{if(e.target.closest?.('.v2-media,.v2-showcase-media,.v2-product-grid'))e.preventDefault()});
 const mq=matchMedia('(max-width:680px)');
 mq.addEventListener?.('change',e=>{state.mobile=e.matches;renderShowcase();state.portfolio.forEach(d=>{d.page=1});renderPortfolio()});
 requestHeight()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(console.error),{once:true});else init().catch(console.error);
})();