(function(){
'use strict';
const C=window.ARTMUG_CONFIG||{};
const API=C.API_BASE||'';
const RAW='https://raw.githubusercontent.com/kizzzeee0-cmyk/artmug-design-portfolio/main/';
const rawJson=path=>fetch(RAW+path,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()});
const $=s=>document.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const MEDIA_VERSION='20261015-live-media-v1';
const media=path=>path?API+'/media/'+String(path).split('/').map(encodeURIComponent).join('/')+'?v='+MEDIA_VERSION:'';
const api=async path=>{const r=await fetch(API+path,{credentials:'include'});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()};
const state={settings:null,portfolioIndex:null,presetIndex:null,portfolio:new Map(),showcase:{preset:[],fixed:[]},presetFilter:{kind:'all',id:''},fixedFilter:{design:'all'},expanded:{preset:false,fixed:false},mobile:matchMedia('(max-width:680px)').matches};
const portfolioPageCache=new Map();
let portfolioHydrationObserver=null;
let presetSourcePromise=null;
let fixedPage=1;
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
 return {
  enabled:m.enabled!==false,
  bannerType:['A','B'].includes(m.bannerType)?m.bannerType:(bannerIds.has(layoutKey({id:x.category,label:x.category}))?'B':''),
  featured:m.featured===true
 }
}
function presetRegistered(x){
 const meta=state.settings?.presetMeta;
 return !!(x?.file&&meta&&typeof meta==='object'&&Object.prototype.hasOwnProperty.call(meta,x.file))
}
function smeta(x){
 const m=state.settings?.presetMeta?.[x.file]||{};
 return {
  name:String(m.name||''),
  enabled:presetRegistered(x)&&(m.enabled!==false),
  isNew:m.isNew===true,
  isReserved:m.isReserved===true,
  isReservable:m.isReservable===true,
  isNoEdit:m.isNoEdit===true,
  colorChangeAvailable:m.colorChangeAvailable===true,
  colorOnlyChangeAvailable:m.colorOnlyChangeAvailable===true,
  showcaseKind:['preset','fixed'].includes(m.showcaseKind)?m.showcaseKind:'preset',
  featured:m.featured===true,
  pairChild:m.pairChild===true
 }
}
function presetBadges(m){
 const out=[];
 if(m.isNew)out.push({label:'NEW',cls:'is-new'});
 if(m.isReserved)out.push({label:'예약중',cls:'is-reserved'});
 else if(m.isReservable)out.push({label:'예약가능',cls:'is-reservable'});
 if(m.isNoEdit)out.push({label:'수정불가',cls:'is-no-edit'});
 return out
}
function portfolioRankForSalesCategory(cat,ownCategories){
 const pc=state.settings?.portfolioCategories||[],key=layoutKey(cat);
 const exact=pc.findIndex(x=>x.id===cat.id);if(exact>=0)return exact;
 const logical=pc.findIndex(x=>layoutKey(x)===key);if(logical>=0)return logical;
 const own=(ownCategories||[]).findIndex(x=>x.id===cat.id);
 return 1000+(own<0?999:own)
}
function portfolioRankForPresetCategory(cat){return portfolioRankForSalesCategory(cat,state.settings?.presetCategories||[])}
function portfolioRankForFixedCategory(cat){return portfolioRankForSalesCategory(cat,state.settings?.fixedCategories||[])}
function bannerTypeEnabled(){return state.settings?.bannerTypeEnabled!==false}
function itemCard(x,c){
 const k=layoutKey(c),m=pmeta(x),type=bannerTypeEnabled()&&bannerIds.has(k)?(m.bannerType||'B'):'';
 const badge=type?'<span class="v2-type-badge"><span class="v2-badge-label">TYPE '+type+'</span></span>':'';
 return '<article class="v2-work-card '+(k==='profile'?'is-profile':'')+'"'+(x.__v2SplitSlot?' data-split-slot="'+x.__v2SplitSlot+'"':'')+'>'+
   '<div class="v2-media"><img src="'+esc(media(x.demoSrc||x.file))+'" alt="'+esc(x.alt||x.originalName||c.label)+'" loading="lazy" decoding="async" fetchpriority="low" draggable="false"></div>'+
   (badge?'<div class="v2-work-tags">'+badge+'</div>':'')+
  '</article>'
}
function presetCard(x){
 const m=smeta(x),c=(state.settings?.presetCategories||[]).find(v=>v.id===x.category)||{},profile=layoutKey(c)==='profile';
 const badges=presetBadges(m).map(b=>'<span class="v2-preset-badge '+b.cls+'"'+(b.style?' style="'+esc(b.style)+'"':'')+'><span class="v2-badge-label">'+esc(b.label)+'</span></span>').join('');
 return '<article class="v2-showcase-card '+(profile?'is-profile':'')+'" data-file="'+esc(x.file)+'">'+
   '<div class="v2-showcase-media"><img src="'+esc(media(x.demoSrc||x.file))+'" alt="'+esc(m.name||'프리셋')+'" loading="lazy" decoding="async" fetchpriority="low" draggable="false"></div>'+
   '<div class="v2-showcase-name-row"><strong>'+esc(m.name||'이름 없음')+'</strong></div>'+
   (badges?'<div class="v2-preset-badges">'+badges+'</div>':'')+
   (m.colorChangeAvailable&&!m.isNoEdit?'<span class="v2-editable-note">수정가능</span>':'')+
   (m.colorOnlyChangeAvailable&&!m.isNoEdit?'<span class="v2-editable-note">색상만 수정가능</span>':'')+
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
 const a=items.filter(x=>pmeta(x).bannerType==='A');
 const b=items.filter(x=>pmeta(x).bannerType==='B');
 if(!a.length||!b.length)return items;
 const out=[];let i=0,j=0;
 while(i<a.length||j<b.length){
  if(i<a.length)out.push(a[i++]);
  if(j<b.length)out.push(b[j++])
 }
 return out
}
function guideHtml(cat){
 if(!bannerTypeEnabled()||!bannerIds.has(layoutKey(cat)))return'';
 const g=state.settings?.bannerTypeGuide||{},A=g.A||{},B=g.B||{};
 return '<details class="v2-type-guide"><summary>TYPE A / B 차이 보기</summary><div class="v2-type-guide-grid">'+
  [['A',A,'장식과 패턴이 적은 깔끔한 구성'],['B',B,'패턴과 장식이 더 풍부한 구성']].map(([t,x,desc])=>{
   const image=x.referenceImage||'';
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
 sec.dataset.v2Hydrated='1';
 sec.classList.remove('is-pending');
 portfolioHydrationObserver?.unobserve?.(sec);
 const typeOn=bannerTypeEnabled()&&bannerIds.has(k);
 if(!typeOn&&data.filter!=='ALL'){data.filter='ALL';data.page=1}
 if(data.remote&&loadRemote){
  sec.setAttribute('aria-busy','true');
  try{await loadRemotePortfolioPage(data)}catch(e){sec.innerHTML='<p class="v2-loading">작품을 불러오지 못했습니다.</p>';sec.removeAttribute('aria-busy');return}
 }
 let items,pages,filterValues;
 if(data.remote){
  items=data.items||[];
  pages=Math.max(1,Number(data.totalPages||1));
  filterValues=typeOn?['ALL',...(data.availableFilters||[]).filter(v=>v==='A'||v==='B')]:[];
 }else{
  items=(data.items||[]).filter(x=>pmeta(x).enabled);
  if(typeOn&&(data.filter==='A'||data.filter==='B'))items=items.filter(x=>pmeta(x).bannerType===data.filter);
  else if(typeOn)items=mixAB(items);
  const presentTypes=typeOn?['A','B'].filter(t=>(data.items||[]).some(x=>pmeta(x).bannerType===t)):[];
  filterValues=typeOn?['ALL',...presentTypes]:[];
  pages=Math.max(1,Math.ceil(items.length/cfg.perPage));
  data.page=Math.min(Math.max(1,data.page||1),pages);
  items=items.slice((data.page-1)*cfg.perPage,data.page*cfg.perPage)
 }
 if(typeOn&&data.filter!=='ALL'&&!filterValues.includes(data.filter)){data.filter='ALL';data.page=1;if(data.remote)return renderPortfolioCategory(id,scroll,true)}
 data.page=Math.min(Math.max(1,data.page||1),pages);
 const controls=typeOn?'<div class="v2-type-filter">'+filterValues.map(v=>'<button type="button" data-v2-filter="'+id+':'+v+'" class="'+((data.filter||'ALL')===v?'is-active':'')+'">'+(v==='ALL'?'전체':'TYPE '+v)+'</button>').join('')+'</div>':'';
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
  await renderPortfolioCategory(id,false,true)
 });
 sec.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',requestHeight,{once:true})});
 sec.removeAttribute('aria-busy');
 sendDetailedSectionMap();requestHeight();
 if(scroll)scrollToElement(sec)
}
async function renderPortfolio(){
 const root=$('#portfolioAllSections');if(!root)return;
 state.portfolio.clear();
 portfolioHydrationObserver?.disconnect?.();
 portfolioHydrationObserver=null;

 let cats=visibleCats();
 const meta=state.settings?.portfolioMeta||{};
 const indexed=Array.isArray(state.portfolioIndex);

 if(indexed){
  const counts={};
  state.portfolioIndex.forEach(x=>{
   if(x&&x.category&&(meta[x.file]||{}).enabled!==false)counts[x.category]=(counts[x.category]||0)+1
  });
  cats=cats.filter(cat=>{
   if(layoutKey(cat)==='profile'){
    return (state.settings.portfolioCategories||[])
     .filter(c=>/^profile(?:-|$)/.test(String(c.id||'')))
     .some(c=>Number(counts[c.id]||0)>0)
   }
   return Number(counts[cat.id]||0)>0
  })
 }

 if(!cats.length){
  root.innerHTML='';
  $('#portfolioAllSectionV2').hidden=true;
  return
 }

 $('#portfolioAllSectionV2').hidden=false;
 root.innerHTML=cats.map(cat=>
  '<section class="v2-portfolio-category is-pending" data-v2-cat="'+esc(cat.id)+'" id="portfolio-'+esc(cat.id)+'">'+
   '<p class="v2-loading">작품을 불러오는 중…</p>'+
  '</section>'
 ).join('');

 const readyIds=[];
 for(const cat of cats){
  const k=layoutKey(cat),sec=document.querySelector('[data-v2-cat="'+CSS.escape(cat.id)+'"]');
  try{
   if(indexed){
    let items;
    if(k==='profile'){
     const physical=new Set((state.settings.portfolioCategories||[])
      .filter(c=>/^profile(?:-|$)/.test(String(c.id||'')))
      .map(c=>c.id));
     items=state.portfolioIndex.filter(x=>physical.has(x.category))
    }else{
     items=state.portfolioIndex.filter(x=>x.category===cat.id)
    }
    items=applyOrder(items,state.settings.portfolioOrder).filter(x=>pmeta(x).enabled);
    if(!items.length){if(sec)sec.hidden=true;continue}
    state.portfolio.set(cat.id,{cat,items,page:1,filter:'ALL',remote:false});
   }else{
    state.portfolio.set(cat.id,{cat,items:[],page:1,filter:'ALL',remote:true,availableFilters:[]})
   }
   readyIds.push(cat.id)
  }catch(e){
   if(sec)sec.innerHTML='<p class="v2-loading">작품을 불러오지 못했습니다.</p>'
  }
 }

 if(!readyIds.length){
  root.innerHTML='';
  $('#portfolioAllSectionV2').hidden=true;
  return
 }

 const hydrate=id=>{
  const sec=document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]');
  if(!sec||sec.hidden||sec.dataset.v2Hydrated==='1')return;
  renderPortfolioCategory(id,false,!indexed).catch(()=>{
   sec.innerHTML='<p class="v2-loading">작품을 불러오지 못했습니다.</p>'
  })
 };

 // Render only the first category immediately. Remaining categories hydrate near the viewport.
 hydrate(readyIds[0]);
 const pending=readyIds.slice(1);
 if('IntersectionObserver' in window&&pending.length){
  portfolioHydrationObserver=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    const id=entry.target.getAttribute('data-v2-cat');
    if(id)hydrate(id)
   })
  },{root:null,rootMargin:'650px 0px',threshold:0});
  pending.forEach(id=>{
   const sec=document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]');
   if(sec)portfolioHydrationObserver.observe(sec)
  })
 }else{
  pending.forEach((id,i)=>{
   const run=()=>hydrate(id);
   if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:1200+i*150});
   else setTimeout(run,120+i*80)
  })
 }

 sendDetailedSectionMap();
 requestHeight()
}
async function fetchSharedPresetItems(){
 if(!presetSourcePromise){
  const cats=[...(state.settings?.presetCategories||[]).filter(c=>c.enabled!==false),...(state.settings?.fixedEnabled!==false?(state.settings?.fixedCategories||[]).filter(c=>c.enabled!==false):[])];
  const ids=[...new Set(cats.map(c=>String(c.id||'')).filter(Boolean))];
  presetSourcePromise=Promise.all(ids.map(id=>fetchAll('preset',id).catch(()=>[]))).then(batches=>{
   const seen=new Set();return batches.flat().filter(x=>{
    if(!x.file||seen.has(x.file))return false;seen.add(x.file);return true
   })
  }).catch(e=>{presetSourcePromise=null;throw e})
 }
 return presetSourcePromise
}
function portfolioCategoryForFixed(cat){
 const list=state.settings?.portfolioCategories||[],key=layoutKey(cat);
 return list.find(x=>x.id===cat.id)||list.find(x=>layoutKey(x)===key)||null
}
function fixedPreviewDisplayConfig(categoryId){
 const cat=(state.settings?.fixedCategories||[]).find(c=>c.id===categoryId)||{id:categoryId,label:categoryId};
 const source=portfolioCategoryForFixed(cat),key=layoutKey(cat);
 const fallback={profile:[1,1],'top-banner':[2320,338],'floating-banner':[80,209],'bottom-banner':[720,150],'bottom-split':[1440,450],'four-cut':[1200,1600]}[key]||null;
 const width=Math.max(1,Number(source?.displayWidth||source?.uploadWidth||fallback?.[0]||1));
 const height=Math.max(1,Number(source?.displayHeight||source?.uploadHeight||fallback?.[1]||1));
 return {key,width,height,known:!!source||!!fallback}
}
function normalizePublicFixedOption(x){
 return {label:String(x?.label||''),detail:String(x?.detail||''),choices:Array.isArray(x?.choices)?x.choices.map(v=>String(v)).filter(Boolean):[]}
}
function normalizePublicFixedPreview(x){
 return {file:String(x?.file||''),category:String(x?.category||'profile'),name:String(x?.name||''),description:String(x?.description||''),enabled:x?.enabled!==false}
}
function normalizePublicFixedProduct(x){
 return {
  id:String(x?.id||''),
  name:String(x?.name||'고정틀'),
  description:String(x?.description||''),
  enabled:x?.enabled!==false,
  pcColumns:Math.max(1,Math.min(8,Number(x?.pcColumns||5))),
  mobileColumns:Math.max(1,Math.min(4,Number(x?.mobileColumns||2))),
  showPreviewNames:x?.showPreviewNames!==false,
  changeableOptions:(Array.isArray(x?.changeableOptions)?x.changeableOptions:[]).map(normalizePublicFixedOption).filter(o=>o.label),
  fixedOptions:(Array.isArray(x?.fixedOptions)?x.fixedOptions:[]).map(normalizePublicFixedOption).filter(o=>o.label),
  note:String(x?.note||''),
  price:Math.max(0,Number(x?.price||0)),
  priceVisible:x?.priceVisible!==false,
  priceNote:String(x?.priceNote||''),
  priceScope:String(x?.priceScope||''),
  previews:(Array.isArray(x?.previews)?x.previews:[]).map(normalizePublicFixedPreview).filter(v=>v.file&&v.enabled!==false)
 }
}
async function publicFixedProducts(){
 const hasProductSchema=Array.isArray(state.settings?.fixedProducts);
 const configured=(hasProductSchema?state.settings.fixedProducts:[]).map(normalizePublicFixedProduct);
 if(hasProductSchema)return configured.filter(p=>p.enabled&&p.previews.length);
 const used=new Set(configured.flatMap(p=>p.previews.map(v=>v.file)));
 let legacy=[];
 try{
  const source=await fetchSharedPresetItems();
  legacy=applyOrder(source,state.settings?.presetOrder).filter(x=>{
   const m=smeta(x);return presetRegistered(x)&&m.enabled&&m.showcaseKind==='fixed'&&!m.pairChild&&!used.has(x.file)
  }).map(x=>{
   const raw=state.settings?.presetMeta?.[x.file]||{};
   return normalizePublicFixedProduct({
    id:'legacy:'+x.file,
    name:smeta(x).name||'기존 고정틀',
    description:String(raw.fixedDescription||''),
    enabled:smeta(x).enabled,
    pcColumns:5,mobileColumns:2,showPreviewNames:true,
    price:Number(raw.fixedPrice||0),priceVisible:true,
    previews:[{file:x.file,category:String(raw.fixedPreviewCategory||x.category||'profile'),name:smeta(x).name||'디자인 01',description:String(raw.description||''),enabled:true}]
   })
  })
 }catch{}
 return [...configured,...legacy].filter(p=>p.enabled&&p.previews.length)
}
function fixedOptionPublicHtml(title,items,kind){
 const labels=(Array.isArray(items)?items:[]).map(o=>String(o?.label||'').trim()).filter(Boolean);
 if(!labels.length)return'';
 return '<section class="fixed-product-option-group '+kind+'">'+
  '<span class="fixed-product-option-heading">'+esc(title)+'</span>'+
  '<div class="fixed-product-option-summary">'+labels.map(label=>'<span>'+esc(label)+'</span>').join('<i aria-hidden="true">·</i>')+'</div>'+
 '</section>'
}
function fixedPreviewPublicHtml(v,p){
 const cfg=fixedPreviewDisplayConfig(v.category);
 const caption=(p.showPreviewNames&&v.name)||v.description
  ? '<figcaption>'+(p.showPreviewNames&&v.name?'<strong>'+esc(v.name)+'</strong>':'')+(v.description?'<p>'+esc(v.description)+'</p>':'')+'</figcaption>'
  : '';
 return '<figure class="fixed-product-preview fixed-preview-layout-'+esc(cfg.key)+'">'+
  '<div class="fixed-product-preview-media"><img src="'+esc(media(v.file))+'" alt="'+esc(v.name||p.name)+'" loading="lazy" decoding="async" fetchpriority="low" draggable="false"></div>'+
  caption+
 '</figure>'
}
function fixedProductPublicCard(p){
 const allPreviews=p.previews.filter(v=>v.enabled!==false);
 const previews=state.mobile?allPreviews.slice(0,4):allPreviews;
 const squareOnly=previews.length>0&&previews.every(v=>fixedPreviewDisplayConfig(v.category).key==='profile');
 const cols=squareOnly&&state.mobile?4:Math.max(1,Math.min(state.mobile?p.mobileColumns:p.pcColumns,previews.length||1));
 const price=p.price>0?p.price.toLocaleString('ko-KR')+'원':'가격 문의';
 const priceMeta=[p.priceScope,p.priceNote].map(v=>String(v||'').trim()).filter(Boolean);
 return '<article class="fixed-product-card">'+
  '<header class="fixed-product-card-head"><div class="fixed-product-title-row"><h3>'+esc(p.name)+'</h3>'+(p.priceVisible?'<strong class="fixed-product-title-price">'+esc(price)+'</strong>':'')+'</div>'+
   (p.description?'<p>'+esc(p.description)+'</p>':'')+
   (p.priceVisible&&priceMeta.length?'<div class="fixed-product-price-meta">'+priceMeta.map(v=>'<span>'+esc(v)+'</span>').join('')+'</div>':'')+
  '</header>'+
  '<div class="fixed-product-preview-grid '+(squareOnly?'is-square-only':'')+'" style="--fixed-product-cols:'+cols+'">'+previews.map(v=>fixedPreviewPublicHtml(v,p)).join('')+'</div>'+
  ((p.changeableOptions.length||p.fixedOptions.length)?'<div class="fixed-product-options">'+fixedOptionPublicHtml('수정 가능',p.changeableOptions,'is-changeable')+fixedOptionPublicHtml('수정 불가',p.fixedOptions,'is-fixed')+'</div>':'')+
  (p.note?'<p class="fixed-product-note">'+esc(p.note)+'</p>':'')+
 '</article>'
}
async function renderFixed(){
 const root=$('#seasonalFixedSection');if(!root)return;
 const settings=state.settings||{};
 if(settings.fixedEnabled===false){root.hidden=true;root.innerHTML='';state.showcase.fixed=[];return}
 const products=await publicFixedProducts();
 state.showcase.fixed=products;
 if(!products.length){root.hidden=true;root.innerHTML='';return}
 const cards='<div class="fixed-product-list">'+products.map(fixedProductPublicCard).join('')+'</div>';
 const notice=String(settings.fixedNotice||'').trim();
 root.hidden=false;
 root.innerHTML='<h2>'+esc(settings.fixedTitle||'고정틀')+'</h2>'+(notice?'<p class="fixed-section-copy">'+esc(notice)+'</p>':'')+cards;
 root.querySelectorAll('img').forEach(img=>{
  img.draggable=false;
  img.setAttribute('draggable','false');
  img.oncontextmenu=e=>{e.preventDefault();return false};
  img.ondragstart=e=>{e.preventDefault();return false};
  if(!img.complete)img.addEventListener('load',requestHeight,{once:true})
 });
 requestHeight()
}

async function renderShowcase(){
 const root=$('#showcaseSectionV2');if(!root)return;
 if(state.settings?.presetEnabled===false||state.settings?.showcasePresetEnabled===false){
  root.hidden=true;root.innerHTML='';state.showcase.preset=[];return
 }
 const cats=(state.settings.presetCategories||[]).filter(c=>c.enabled!==false);
 const allowed=new Set(cats.map(c=>c.id));
 let source;
 if(Array.isArray(state.presetIndex)){
  source=state.presetIndex.filter(x=>allowed.has(x.category))
 }else{
  const batches=await Promise.all(cats.map(cat=>fetchAll('preset',cat.id).catch(()=>[])));
  source=batches.flat()
 }
 const all=applyOrder(source,state.settings.presetOrder).filter(x=>{
  if(!presetRegistered(x))return false;
  const m=smeta(x);
  return m.enabled&&m.showcaseKind!=='fixed'&&!m.pairChild
 });
 state.showcase.preset=all;
 if(!all.length){root.hidden=true;root.innerHTML='';return}

 const designWithItems=cats.filter(cat=>all.some(x=>x.category===cat.id));
 if(!designWithItems.length){root.hidden=true;root.innerHTML='';return}
 let activeId=state.presetFilter?.kind==='design'&&designWithItems.some(x=>x.id===state.presetFilter.id)?state.presetFilter.id:designWithItems[0].id;
 state.presetFilter={kind:'design',id:activeId};
 const activeCat=designWithItems.find(x=>x.id===activeId)||designWithItems[0];
 const filtered=all.filter(x=>x.category===activeCat.id);
 const filterButton=cat=>'<button type="button" class="v2-preset-filter-button '+(activeCat.id===cat.id?'is-active':'')+'" data-preset-filter-id="'+esc(cat.id)+'">'+esc(cat.label||cat.id)+'</button>';
 const filters=designWithItems.length>1?'<div class="v2-preset-filters"><div class="v2-preset-filter-group is-design-only"><div class="v2-preset-filter-buttons">'+designWithItems.map(filterButton).join('')+'</div></div></div>':'';

 const description=String(state.settings.showcasePresetDescription??state.settings.presetNotice??'아직 판매되지 않은 작업물입니다. 그대로 제작을 원하시면 문의 시 말씀해 주세요.');
 const featured=filtered.filter(x=>smeta(x).featured),rest=filtered.filter(x=>!smeta(x).featured),ordered=[...featured,...rest];
 const key='preset-cat:design:'+activeCat.id,expanded=state.expanded[key]===true;
 const limit=state.mobile?Math.min(4,Math.max(1,Number(state.settings.showcaseInitialMobile||4))):Math.min(5,Math.max(1,Number(state.settings.showcaseInitialDesktop||5)));
 const shown=expanded?ordered:ordered.slice(0,limit);
 const profile=layoutKey(activeCat)==='profile',layoutClass=profile?'is-profile-category':'is-media-category';
 const cols=Math.min(5,Math.max(1,shown.length));
 const categoryHtml='<section class="v2-preset-category '+layoutClass+' v2-preset-layout-'+esc(layoutKey(activeCat))+'" data-preset-category="'+esc(activeCat.id)+'">'+
   '<div class="v2-preset-category-grid" style="--preset-cols:'+cols+'">'+shown.map(presetCard).join('')+'</div>'+
   (state.settings.showcasePresetExpandEnabled!==false&&ordered.length>limit?'<button type="button" class="v2-show-all" data-show-preset-category="'+esc(activeCat.id)+'" data-show-preset-key="'+esc(key)+'">'+(expanded?'접기':'전체보기')+'</button>':'')+
  '</section>';

 root.hidden=false;
 root.innerHTML='<h2>'+esc(state.settings.presetTitle||'프리셋')+'</h2><p class="v2-showcase-main-description">'+esc(description)+'</p>'+filters+
  '<div class="v2-preset-category-layout is-single">'+categoryHtml+'</div>';

 root.querySelectorAll('[data-preset-filter-id]').forEach(b=>b.onclick=()=>{
  state.presetFilter={kind:'design',id:b.dataset.presetFilterId||''};
  renderShowcase();requestHeight()
 });
 root.querySelectorAll('[data-show-preset-category]').forEach(b=>b.onclick=()=>{
  const key=b.dataset.showPresetKey||('preset-cat:'+b.dataset.showPresetCategory);
  state.expanded[key]=!state.expanded[key];
  renderShowcase();requestHeight()
 });
 root.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',requestHeight,{once:true})});
 requestHeight()
}

let heightRaf=0,heightTimer=0;
function requestHeight(){
 if(!heightRaf){
  heightRaf=requestAnimationFrame(()=>{
   heightRaf=0;
   window.dispatchEvent(new Event('artmug-sections-changed'));
   sendDetailedSectionMap()
  })
 }
 clearTimeout(heightTimer);
 heightTimer=setTimeout(()=>{
  window.dispatchEvent(new Event('artmug-sections-changed'));
  sendDetailedSectionMap()
 },100)
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
 if(target==='showcase'||target==='preset'||target==='showcase-preset')return scrollToElement($('#showcaseSectionV2'));
 if(target==='fixed'||target==='seasonal-fixed')return scrollToElement($('#seasonalFixedSection'))
 if(target==='portfolio')return scrollToElement($('#portfolioAllSectionV2'));
 if(target==='banner:all'||(!bannerTypeEnabled()&&(target==='banner:A'||target==='banner:B'))){
  const entry=[...state.portfolio.entries()].find(([id,d])=>bannerIds.has(layoutKey(d.cat)));
  if(!entry)return;
  const [id,d]=entry;d.filter='ALL';d.page=1;
  renderPortfolioCategory(id,false,true).then(()=>{scrollToElement(document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]'));announceActive('banner:all')});
  return
 }
 if(target==='banner:A'||target==='banner:B'){
  const type=target.slice(-1);
  const entry=[...state.portfolio.entries()].find(([id,d])=>bannerIds.has(layoutKey(d.cat))&&(d.remote?(d.availableFilters||[]).includes(type):(d.items||[]).some(x=>pmeta(x).bannerType===type)));
  if(!entry)return;
  const [id,d]=entry;d.filter=type;d.page=1;
  renderPortfolioCategory(id,false,true).then(()=>scrollToElement(document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]')));
  return
 }
 if(target.startsWith('portfolio:')){
  const [,id,type]=target.split(':');const d=state.portfolio.get(id);
  if(d&&type&&['A','B','ALL'].includes(type)){
   d.filter=bannerTypeEnabled()?type:'ALL';d.page=1;
   renderPortfolioCategory(id,false,true).then(()=>scrollToElement(document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]')));return
  }
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
 add('fixed',$('#seasonalFixedSection'));
 add('showcase',$('#showcaseSectionV2'));
 state.portfolio.forEach((d,id)=>{
  const target='portfolio:'+id+(bannerTypeEnabled()&&['A','B'].includes(d.filter)?':'+d.filter:'');
  add(target,document.querySelector('[data-v2-cat="'+CSS.escape(id)+'"]'))
 });
 add('inquiry',$('#inquirySection'));
 const role=document.body.classList.contains('artmug-part-inquiry')?'inquiry':document.body.classList.contains('artmug-part-portfolio')?'portfolio':'full';
 try{if(window.parent!==window)window.parent.postMessage({type:'artmug-v2-section-map',role,sections},'*')}catch{}
}
function announceNavData(){
 const cats=[...state.portfolio.entries()].map(([id,d])=>{
  const filters=d.remote?(d.availableFilters||[]):null;
  return {id,label:d.cat.label,kind:layoutKey(d.cat),banner:bannerIds.has(layoutKey(d.cat)),
   hasA:filters?filters.includes('A'):(d.items||[]).some(x=>pmeta(x).bannerType==='A'),
   hasB:filters?filters.includes('B'):(d.items||[]).some(x=>pmeta(x).bannerType==='B')}
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
function fixedInquiryProducts(){
 return (state.showcase.fixed||[]).filter(p=>
  p&&p.enabled!==false&&Array.isArray(p.previews)&&p.previews.some(v=>{
   const c=(state.settings?.fixedCategories||[]).find(x=>x.id===v.category)||{id:v.category,label:v.category};
   return layoutKey(c)==='profile'
  })
 )
}
function selectedFixedProduct(card){
 const id=String(card.dataset.selectedFixedProductId||'');
 return fixedInquiryProducts().find(p=>String(p.id)===id)||null
}
function selectedFixedProductName(card){
 return selectedFixedProduct(card)?.name||''
}
function fixedSelectionHtml(card){
 const selectedId=String(card.dataset.selectedFixedProductId||'');
 const arr=fixedInquiryProducts();
 const options=arr.map(p=>
  '<label class="choice-pill v2-fixed-product-choice">'+
   '<input type="radio" data-v2-select="fixed" data-product-id="'+esc(p.id)+'" name="v2-fixed-product-'+esc(card.dataset.requestId||'0')+'" value="'+esc(p.id)+'" '+(selectedId===String(p.id)?'checked':'')+'>'+
   '<span>'+esc(p.name||'이름 없음')+'</span>'+
  '</label>'
 ).join('');
 return '<fieldset class="v2-mode-field v2-product-select v2-fixed-product-select choice-field inquiry-plain-choice" data-product-kind="fixed"><legend data-question-title>고정틀 선택</legend>'+
  '<div class="choice-row v2-fixed-product-grid">'+(options||'<p class="v2-empty-products">현재 선택 가능한 움짤프사 고정틀이 없습니다.</p>')+'</div></fieldset>'
}
function injectInquiry(card){
 const fields=card.querySelector('.request-fields');if(!fields)return;
 const types=selectedTypeInputs(card),hasProfile=types.some(x=>/움짤\s*프사/.test(x.label)||x.id==='profile-a');
 const banners=types.filter(x=>/배너/.test(x.label));
 let box=fields.querySelector('.v2-inquiry-enhancements');
 if(!box){box=document.createElement('div');box.className='v2-inquiry-enhancements';fields.prepend(box)}
 const profileMode=card.dataset.profileMode||'custom';
 let html='';
 if(hasProfile){
  html+='<fieldset class="v2-mode-field choice-field inquiry-plain-choice"><legend data-question-title>움짤프사 신청 방식</legend><div class="choice-row">'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="custom" '+(profileMode==='custom'?'checked':'')+'><span>맞춤제작</span></label>'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="fixed" '+(profileMode==='fixed'?'checked':'')+'><span>고정틀 구매</span></label>'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="preset" '+(profileMode==='preset'?'checked':'')+'><span>프리셋 구매</span></label>'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="change" '+(profileMode==='change'?'checked':'')+'><span>이름/움짤 변경</span></label></div></fieldset>';
  if(profileMode==='fixed')html+=fixedSelectionHtml(card);
  if(profileMode==='preset')html+=selectionHtml(card.dataset.selectedPresetFile)
 }
 if(bannerTypeEnabled()&&banners.length){
  html+='<div class="v2-banner-type-fields">'+banners.map((x,i)=>{
   const val=card.dataset['bannerType'+i]||'B';
   return '<fieldset class="v2-mode-field choice-field inquiry-plain-choice"><legend data-question-title>'+esc(x.label)+' TYPE</legend><div class="choice-row">'+
    ['A','B'].map(t=>'<label class="choice-pill"><input type="radio" data-v2-banner-index="'+i+'" data-v2-banner-label="'+esc(x.label)+'" name="v2-banner-'+card.dataset.requestId+'-'+i+'" value="'+t+'" '+(val===t?'checked':'')+'><span>TYPE '+t+'</span></label>').join('')+
   '</div></fieldset>'
  }).join('')+'</div>'
 }
 if(box.dataset.renderSignature!==html){box.innerHTML=html;box.dataset.renderSignature=html}
 box.hidden=!String(html||'').trim();
 const profilePresetOnly=hasProfile&&types.length===1&&profileMode==='preset';
 const profileFixedOnly=hasProfile&&types.length===1&&profileMode==='fixed';
 const profileChangeOnly=hasProfile&&types.length===1&&profileMode==='change';
 fields.querySelectorAll('.concept-request-field').forEach(el=>el.classList.toggle('v2-hidden-field',profilePresetOnly||profileFixedOnly||profileChangeOnly));
 fields.querySelectorAll('.content-input-field').forEach(el=>el.classList.toggle('v2-hidden-field',profileChangeOnly));
 box.querySelectorAll('[data-v2-mode]').forEach(i=>i.onchange=()=>{
  card.dataset.profileMode=i.value;
  if(typeof window.refreshInquiryRequestFields==='function')window.refreshInquiryRequestFields(card);
  injectInquiry(card);
  requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.())
 });
 box.querySelectorAll('[data-v2-banner-index]').forEach(i=>i.onchange=()=>{card.dataset['bannerType'+i.dataset.v2BannerIndex]=i.value});
 box.querySelectorAll('[data-v2-select="preset"]').forEach(b=>b.onclick=()=>{
  card.dataset.selectedPresetFile=b.dataset.file;
  injectInquiry(card);requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.())
 });
 box.querySelectorAll('[data-v2-select="fixed"]').forEach(i=>i.onchange=()=>{
  card.dataset.selectedFixedProductId=String(i.dataset.productId||i.value||'');
  delete card.dataset.fixedPattern;
  delete card.dataset.fixedPatternOther;
  injectInquiry(card);
  requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.())
 });
 requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.())
}
function selectionHtml(selected){
 const arr=state.showcase.preset.filter(x=>{
  const c=(state.settings?.presetCategories||[]).find(v=>v.id===x.category)||{},m=smeta(x);
  return layoutKey(c)==='profile'&&m.enabled
 });
 const options=arr.map(x=>{
  const m=smeta(x),disabled=false,status=m.isReserved?'예약중':m.isReservable?'예약가능':m.isNew?'NEW':'';
  return '<button type="button" data-v2-select="preset" data-file="'+esc(x.file)+'" class="'+(selected===x.file?'is-selected':'')+'" '+(disabled?'disabled':'')+'>'+
   '<img src="'+esc(media(x.demoSrc||x.file))+'" alt=""><span>'+esc(m.name||'이름 없음')+'</span>'+
   (status?'<em>'+status+'</em>':'')+'</button>'
 }).join('');
 return '<fieldset class="v2-mode-field v2-product-select choice-field inquiry-plain-choice" data-product-kind="preset"><legend data-question-title>프리셋 선택</legend>'+
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
function selectedProductName(card){
 const file=card.dataset.selectedPresetFile;
 const x=state.showcase.preset.find(v=>v.file===file);return x?smeta(x).name:''
}
function selectedProductStatus(card){
 const file=card.dataset.selectedPresetFile;
 const x=state.showcase.preset.find(v=>v.file===file);
 if(!x)return'';
 const m=smeta(x);
 return m.isReserved?'예약중':m.isReservable?'예약가능':m.isNew?'NEW':''
}
window.__ARTMUG_V2__={
 inquiryData(card){
  const types=selectedTypeInputs(card),banners=types.filter(x=>/배너/.test(x.label));
  const fixedProduct=selectedFixedProduct(card);
  return {
   profileMode:card.dataset.profileMode||'custom',
   selectedPresetFile:card.dataset.selectedPresetFile||'',
   selectedPresetName:selectedProductName(card),
   selectedPresetStatus:selectedProductStatus(card),
   selectedFixedProductId:card.dataset.selectedFixedProductId||'',
   selectedFixedProductName:fixedProduct?.name||'',
   bannerTypes:bannerTypeEnabled()?banners.map((x,i)=>({label:x.label,type:card.dataset['bannerType'+i]||'B'})):[],
   profileSelected:types.some(x=>/움짤\s*프사/.test(x.label)||/움짤\s*프로필/.test(x.label)||x.id==='profile-a')
  }
 },
 validateCard(card){
  const d=this.inquiryData(card);
  if(d.profileSelected&&d.profileMode==='fixed'&&!d.selectedFixedProductName)return {ok:false,message:'구매할 고정틀을 선택해주세요.'};
  if(d.profileSelected&&d.profileMode==='preset'&&!d.selectedPresetFile)return {ok:false,message:'구매할 프리셋을 선택해주세요.'};
  return {ok:true}
 },
 inquiryLines(card){
  const d=this.inquiryData(card),out=[];
  if(d.profileSelected){
   const modeLabel=d.profileMode==='fixed'?'고정틀 구매':d.profileMode==='preset'?'프리셋 구매':d.profileMode==='change'?'이름/움짤 변경':'맞춤제작';
   out.push('움짤프사 신청 방식: '+modeLabel);
   if(d.profileMode==='fixed'&&d.selectedFixedProductName){
    out.push('선택 고정틀: '+d.selectedFixedProductName)
   }
   if(d.profileMode==='preset'&&d.selectedPresetName){
    out.push('선택 프리셋: '+d.selectedPresetName)
   }
  }
  d.bannerTypes.forEach(x=>out.push(x.label+' TYPE: '+x.type));
  return out
 }
};
async function init(){
 initNav();
 const settingsPromise=window.__ARTMUG_PUBLIC_SETTINGS_PROMISE__||(window.__ARTMUG_PUBLIC_SETTINGS_PROMISE__=api('/api/public/catalog?fresh='+Date.now()));
 const d=await settingsPromise;
 state.settings=d.settings||{};
 // One catalog request carries the live settings and lightweight media indexes.
 // This avoids fetching every category separately as the library grows.
 state.portfolioIndex=Array.isArray(d.portfolioIndex)?d.portfolioIndex:null;
 state.presetIndex=Array.isArray(d.presetIndex)?d.presetIndex:null;
 const title=$('#portfolioAllTitle');if(title)title.textContent=state.settings.portfolioTitle||'포트폴리오';
 const inquiryPart=document.body.classList.contains('artmug-part-inquiry');
 const portfolioPart=document.body.classList.contains('artmug-part-portfolio');
 const showcasePromise=renderShowcase();
 const fixedPromise=renderFixed();
 const portfolioPromise=inquiryPart?Promise.resolve():renderPortfolio();
 await Promise.all([showcasePromise,fixedPromise]);
 if(!portfolioPart)initInquiryObserver();
 await portfolioPromise;
 // Only the complete all-in-one page may announce a menu snapshot.
 // Split inquiry/portfolio frames are intentionally excluded because each holds partial state.
 if(!inquiryPart&&!portfolioPart)announceNavData();
 document.addEventListener('contextmenu',e=>{if(e.target.closest?.('.v2-media,.v2-showcase-media,.v2-product-grid,.fixed-product-preview-media'))e.preventDefault()});
 document.addEventListener('dragstart',e=>{if(e.target.closest?.('.v2-media,.v2-showcase-media,.v2-product-grid,.fixed-product-preview-media'))e.preventDefault()});
 const mq=matchMedia('(max-width:680px)');
 mq.addEventListener?.('change',e=>{state.mobile=e.matches;renderShowcase();renderFixed();state.portfolio.forEach(d=>{d.page=1});renderPortfolio()});
 requestHeight()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(console.error),{once:true});else init().catch(console.error);
})();