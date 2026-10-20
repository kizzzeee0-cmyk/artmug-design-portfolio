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
const state={settings:null,portfolioIndex:null,presetIndex:null,portfolio:new Map(),showcase:{preset:[],fixed:[]},presetFilter:{kind:'all',id:''},fixedFilter:{design:'all'},expanded:{preset:false,fixed:false},presetVariantSelection:{},fixedVariantSelection:{},showcasePage:{fixed:1,preset:1},mobile:matchMedia('(max-width:680px)').matches};
const portfolioPageCache=new Map();
let portfolioHydrationObserver=null;
let animatedMediaObserver=null;
const animatedMediaTimers=new WeakMap();
const animatedMediaQueue=[];
let animatedMediaActiveLoads=0;
const connectionInfo=navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;
const ANIMATED_MEDIA_LOAD_LIMIT=(connectionInfo?.saveData||/^(?:slow-)?2g$|^3g$/i.test(String(connectionInfo?.effectiveType||'')))?1:2;
const PAUSED_MEDIA_SRC='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
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
  description:String(m.description||''),
  price:Math.max(0,Number(m.price||0)),
  priceVisible:m.priceVisible===true,
  priceNote:String(m.priceNote||''),
  showcaseKind:['preset','fixed'].includes(m.showcaseKind)?m.showcaseKind:'preset',
  featured:m.featured===true,
  pairChild:m.pairChild===true
 }
}
function presetColorGroups(){
 const raw=Array.isArray(state.settings?.presetColorGroups)?state.settings.presetColorGroups:[];
 return raw.map((g,gi)=>{
  const variants=(Array.isArray(g?.variants)?g.variants:[]).map((v,vi)=>({
   file:String(v?.file||''),
   name:String(v?.name||('색상 '+String(vi+1).padStart(2,'0')))
  })).filter(v=>v.file);
  const primaryFile=String(g?.primaryFile||variants[0]?.file||'');
  return {id:String(g?.id||('preset-color-group-'+gi)),category:String(g?.category||''),primaryFile,variants}
 }).filter(g=>g.primaryFile&&g.variants.length)
}
function presetColorGroupForFile(file){
 const f=String(file||'');
 return presetColorGroups().find(g=>g.primaryFile===f||g.variants.some(v=>v.file===f))||null
}
function presetColorGroupForPrimary(file){
 const f=String(file||'');
 return presetColorGroups().find(g=>g.primaryFile===f)||null
}
function presetIndexItem(file){
 return (Array.isArray(state.presetIndex)?state.presetIndex:[]).find(x=>x.file===file)||null
}
function presetVisibleVariants(primaryFile){
 const group=presetColorGroupForPrimary(primaryFile);
 if(!group)return [{file:String(primaryFile||''),name:'기본 색상'}];
 const existing=new Set((Array.isArray(state.presetIndex)?state.presetIndex:[]).map(x=>x.file));
 return group.variants.filter(v=>!existing.size||existing.has(v.file))
}
function collapsePresetProducts(items){
 const groups=presetColorGroups(),childToPrimary=new Map();
 groups.forEach(g=>g.variants.forEach(v=>{if(v.file!==g.primaryFile)childToPrimary.set(v.file,g.primaryFile)}));
 const seen=new Set();
 return (Array.isArray(items)?items:[]).filter(x=>{
  if(childToPrimary.has(x.file))return false;
  if(seen.has(x.file))return false;
  seen.add(x.file);return true
 })
}
function presetVariantSource(file){
 const x=presetIndexItem(file);
 return media(x?.demoSrc||x?.file||file)
}
function presetSelectedVariant(primaryFile){
 const variants=presetVisibleVariants(primaryFile);
 if(!variants.length)return {file:primaryFile,name:'기본 색상'};
 const selected=state.presetVariantSelection[primaryFile];
 return variants.find(v=>v.file===selected)||variants.find(v=>v.file===primaryFile)||variants[0]
}
let presetColorPopover=null;
function closePresetColorPopover(){
 if(presetColorPopover){presetColorPopover.remove();presetColorPopover=null}
 document.querySelectorAll('[data-preset-color-menu].is-open,[data-fixed-variant-menu].is-open').forEach(b=>b.classList.remove('is-open'))
}
function positionPresetColorPopover(button,pop){
 const r=button.getBoundingClientRect(),gap=7;
 pop.style.visibility='hidden';pop.style.display='block';
 const w=Math.min(220,Math.max(154,pop.offsetWidth||174)),h=Math.min(260,pop.offsetHeight||180);
 let left=r.right-w,top=r.bottom+gap;
 if(left<8)left=Math.min(innerWidth-w-8,r.left);
 if(left+w>innerWidth-8)left=Math.max(8,innerWidth-w-8);
 if(top+h>innerHeight-8)top=Math.max(8,r.top-h-gap);
 pop.style.left=Math.round(left)+'px';
 pop.style.top=Math.round(top)+'px';
 pop.style.maxWidth=Math.max(140,innerWidth-16)+'px';
 pop.style.maxHeight=Math.max(120,innerHeight-16)+'px';
 pop.style.visibility='visible'
}
function setPresetCardVariant(primaryFile,file){
 const variants=presetVisibleVariants(primaryFile);
 const variant=variants.find(v=>v.file===file);if(!variant)return;
 state.presetVariantSelection[primaryFile]=file;
 const card=document.querySelector('.v2-showcase-card[data-preset-product-file="'+CSS.escape(primaryFile)+'"]');
 const img=card?.querySelector('.v2-showcase-media>img');if(!img)return;
 const source=presetVariantSource(file);
 if(isAnimatedMediaUrl(source)){
  img.dataset.v2AnimatedSrc=source;
  img.dataset.v2GifActive='0';
  img.classList.add('is-gif-paused');
  img.setAttribute('src',PAUSED_MEDIA_SRC);
  manageAnimatedMedia(card);
  const r=img.getBoundingClientRect();
  if(r.bottom>=-280&&r.top<=innerHeight+280)restoreAnimatedMedia(img)
 }else{
  animatedMediaObserver?.unobserve?.(img);
  delete img.dataset.v2AnimatedSrc;delete img.dataset.v2GifManaged;delete img.dataset.v2GifActive;delete img.dataset.v2GifNear;
  img.classList.remove('is-gif-paused');
  img.setAttribute('src',source)
 }
 closePresetColorPopover()
}
function openPresetColorPopover(button){
 const primary=String(button.dataset.presetColorMenu||''),variants=presetVisibleVariants(primary);
 const wasOpen=button.classList.contains('is-open')&&!!presetColorPopover;
 closePresetColorPopover();
 if(wasOpen||variants.length<2)return;
 button.classList.add('is-open');
 const selected=presetSelectedVariant(primary);
 const pop=document.createElement('div');
 pop.className='v2-preset-color-popover';
 pop.setAttribute('role','menu');
 pop.innerHTML='<div class="v2-preset-color-popover-title">색상 선택</div><div class="v2-preset-color-options">'+variants.map(v=>{
  const source=presetVariantSource(v.file),active=v.file===selected.file;
  const thumb='<span class="v2-preset-color-thumb"><img src="'+esc(source)+'" alt="" loading="lazy" decoding="async" fetchpriority="low"></span>';
  return '<button type="button" class="v2-preset-color-option '+(active?'is-selected':'')+'" data-preset-color-choice="'+esc(v.file)+'" role="menuitemradio" aria-checked="'+(active?'true':'false')+'">'+
   thumb+
   '<span class="v2-preset-color-name">'+esc(v.name||'색상')+'</span>'+
   '<span class="v2-preset-color-check" aria-hidden="true">✓</span></button>'
 }).join('')+'</div>';
 document.body.appendChild(pop);presetColorPopover=pop;positionPresetColorPopover(button,pop);
 pop.querySelectorAll('[data-preset-color-choice]').forEach(b=>b.onclick=e=>{e.stopPropagation();setPresetCardVariant(primary,b.dataset.presetColorChoice)});
 requestAnimationFrame(()=>positionPresetColorPopover(button,pop))
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
function isAnimatedMediaUrl(url){
 return /\.gif(?:$|[?#])/i.test(String(url||''))
}
function rememberAnimatedMediaRatio(img){
 if(!img||!img.naturalWidth||!img.naturalHeight)return;
 const holder=img.closest('.fixed-product-preview-media');
 if(holder&&!holder.style.aspectRatio)holder.style.aspectRatio=img.naturalWidth+'/'+img.naturalHeight
}
function pumpAnimatedMediaQueue(){
 while(animatedMediaActiveLoads<ANIMATED_MEDIA_LOAD_LIMIT&&animatedMediaQueue.length){
  const img=animatedMediaQueue.shift();
  if(!img||!img.isConnected||img.dataset.v2GifQueued!=='1'||img.dataset.v2GifNear==='0'){
   if(img)img.dataset.v2GifQueued='0';
   continue
  }
  const src=img.dataset.v2AnimatedSrc;
  if(!src){img.dataset.v2GifQueued='0';continue}
  img.dataset.v2GifQueued='0';
  img.dataset.v2GifLoading='1';
  img.dataset.v2GifActive='1';
  img.classList.remove('is-gif-paused');
  animatedMediaActiveLoads++;
  let done=false;
  const settle=()=>{
   if(done)return;
   done=true;
   animatedMediaActiveLoads=Math.max(0,animatedMediaActiveLoads-1);
   delete img.dataset.v2GifLoading;
   img.removeEventListener('load',settle);
   img.removeEventListener('error',settle);
   if(img.dataset.v2GifActive==='1')rememberAnimatedMediaRatio(img);
   pumpAnimatedMediaQueue()
  };
  img.addEventListener('load',settle);
  img.addEventListener('error',settle);
  if(img.getAttribute('src')!==src)img.setAttribute('src',src);
  else if(img.complete)settle()
 }
}
function restoreAnimatedMedia(img){
 const src=img?.dataset?.v2AnimatedSrc;
 if(!src||img.dataset.v2GifActive==='1'||img.dataset.v2GifLoading==='1'||img.dataset.v2GifQueued==='1')return;
 const timer=animatedMediaTimers.get(img);
 if(timer){clearTimeout(timer);animatedMediaTimers.delete(img)}
 img.dataset.v2GifQueued='1';
 animatedMediaQueue.push(img);
 pumpAnimatedMediaQueue()
}
function pauseAnimatedMedia(img){
 const src=img?.dataset?.v2AnimatedSrc;
 if(!src)return;
 if(img.dataset.v2GifQueued==='1')img.dataset.v2GifQueued='0';
 if(img.dataset.v2GifActive!=='1'&&img.dataset.v2GifLoading!=='1')return;
 rememberAnimatedMediaRatio(img);
 img.dataset.v2GifActive='0';
 img.classList.add('is-gif-paused');
 img.setAttribute('src',PAUSED_MEDIA_SRC)
}
function ensureAnimatedMediaObserver(){
 if(animatedMediaObserver||!('IntersectionObserver' in window))return animatedMediaObserver;
 animatedMediaObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
   const img=entry.target;
   if(entry.isIntersecting){
    img.dataset.v2GifNear='1';
    restoreAnimatedMedia(img);
    return
   }
   img.dataset.v2GifNear='0';
   const old=animatedMediaTimers.get(img);
   if(old)clearTimeout(old);
   const timer=setTimeout(()=>{
    animatedMediaTimers.delete(img);
    if(img.isConnected&&img.dataset.v2GifNear!=='1')pauseAnimatedMedia(img)
   },700);
   animatedMediaTimers.set(img,timer)
  })
 },{root:null,rootMargin:'280px 0px 280px 0px',threshold:0});
 return animatedMediaObserver
}
function manageAnimatedMedia(root=document){
 const imgs=Array.from(root.querySelectorAll('img')).filter(img=>{
  const src=img.dataset.v2AnimatedSrc||img.getAttribute('src')||'';
  return isAnimatedMediaUrl(src)
 });
 if(!imgs.length)return;
 const observer=ensureAnimatedMediaObserver();
 imgs.forEach(img=>{
  if(!img.dataset.v2AnimatedSrc)img.dataset.v2AnimatedSrc=img.getAttribute('src')||'';
  if(img.dataset.v2GifManaged==='1')return;
  img.dataset.v2GifManaged='1';
  if(!img.dataset.v2GifActive){
   img.dataset.v2GifActive=img.getAttribute('src')===img.dataset.v2AnimatedSrc?'1':'0'
  }
  img.addEventListener('load',()=>{
   if(img.dataset.v2GifActive==='1')rememberAnimatedMediaRatio(img)
  });
  if(observer)observer.observe(img);
  else restoreAnimatedMedia(img)
 })
}
function itemCard(x,c){
 const k=layoutKey(c),m=pmeta(x),type=bannerTypeEnabled()&&bannerIds.has(k)?(m.bannerType||'B'):'';
 const badge=type?'<span class="v2-type-badge"><span class="v2-badge-label">TYPE '+type+'</span></span>':'';
 const source=media(x.demoSrc||x.file),deferGif=k==='profile'&&isAnimatedMediaUrl(source);
 const imgSrc=deferGif?PAUSED_MEDIA_SRC:source;
 const gifAttrs=deferGif?' data-v2-animated-src="'+esc(source)+'" data-v2-gif-active="0" class="is-gif-paused"':'';
 return '<article class="v2-work-card '+(k==='profile'?'is-profile':'')+'"'+(x.__v2SplitSlot?' data-split-slot="'+x.__v2SplitSlot+'"':'')+'>'+
   '<div class="v2-media"><img src="'+esc(imgSrc)+'"'+gifAttrs+' alt="'+esc(x.alt||x.originalName||c.label)+'" loading="lazy" decoding="async" fetchpriority="low" draggable="false"></div>'+
   (badge?'<div class="v2-work-tags">'+badge+'</div>':'')+
  '</article>'
}
function presetCard(x){
 const m=smeta(x),c=(state.settings?.presetCategories||[]).find(v=>v.id===x.category)||{},profile=layoutKey(c)==='profile';
 const badges=[{label:'1인 한정',cls:'is-limited-sale'},...presetBadges(m)].map(b=>'<span class="v2-preset-badge '+b.cls+'"'+(b.style?' style="'+esc(b.style)+'"':'')+'><span class="v2-badge-label">'+esc(b.label)+'</span></span>').join('');
 const variants=presetVisibleVariants(x.file),selected=presetSelectedVariant(x.file),source=presetVariantSource(selected.file||x.file),deferGif=profile&&isAnimatedMediaUrl(source);
 const imgSrc=deferGif?PAUSED_MEDIA_SRC:source;
 const gifAttrs=deferGif?' data-v2-animated-src="'+esc(source)+'" data-v2-gif-active="0" class="is-gif-paused"':'';
 const colorButton=variants.length>1?'<button type="button" class="v2-preset-color-button" data-preset-color-menu="'+esc(x.file)+'" aria-label="색상 선택" aria-haspopup="menu"><svg viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="M2 2.25 6 5.75l4-3.5"/></svg></button>':'';
 const price=m.price>0?m.price.toLocaleString('ko-KR')+'원':'가격 문의';
 return '<article class="v2-showcase-card '+(profile?'is-profile':'')+'" data-file="'+esc(x.file)+'" data-preset-product-file="'+esc(x.file)+'">'+
   '<div class="v2-showcase-media-wrap"><button type="button" class="v2-fixed-media-button" data-preset-detail-open="'+esc(x.file)+'" aria-label="'+esc(m.name||'프리셋')+' 상세보기"><span class="v2-showcase-media"><img src="'+esc(imgSrc)+'"'+gifAttrs+' alt="'+esc(m.name||'프리셋')+'" loading="lazy" decoding="async" fetchpriority="low" draggable="false"></span></button>'+colorButton+'</div>'+
   '<div class="v2-showcase-name-row"><button type="button" class="v2-showcase-name-button" data-preset-detail-open="'+esc(x.file)+'">'+esc(m.name||'이름 없음')+'</button></div>'+
   '<div class="v2-preset-badges">'+badges+'</div>'+
   (m.priceVisible?'<span class="v2-unified-price">'+esc(price)+'</span>':'')+
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
 manageAnimatedMedia(sec);
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
  note:String(x?.note||x?.changeableOptions?.[0]?.label||x?.fixedOptions?.[0]?.label||''),
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
 const rows=(Array.isArray(items)?items:[]).map(o=>({
  label:String(o?.label||'').trim(),
  detail:String(o?.detail||'').trim()
 })).filter(o=>o.label);
 if(!rows.length)return'';
 return '<section class="fixed-product-option-group '+kind+'">'+
  '<span class="fixed-product-option-heading">'+esc(title)+'</span>'+
  '<div class="fixed-product-option-summary">'+rows.map(o=>
   '<span class="fixed-product-option-summary-item"><span class="fixed-product-option-label">'+esc(o.label)+'</span>'+
   (o.detail?'<span class="fixed-product-option-detail"><i aria-hidden="true">│</i>'+esc(o.detail)+'</span>':'')+
   '</span>'
  ).join('<i class="fixed-product-option-separator" aria-hidden="true">·</i>')+'</div>'+
 '</section>'
}
function fixedPreviewPublicHtml(v,p){
 const cfg=fixedPreviewDisplayConfig(v.category),source=media(v.file),deferGif=cfg.key==='profile'&&isAnimatedMediaUrl(source);
 const imgSrc=deferGif?PAUSED_MEDIA_SRC:source;
 const gifAttrs=deferGif?' data-v2-animated-src="'+esc(source)+'" data-v2-gif-active="0" class="is-gif-paused"':'';
 const caption=(p.showPreviewNames&&v.name)||v.description
  ? '<figcaption>'+(p.showPreviewNames&&v.name?'<strong>'+esc(v.name)+'</strong>':'')+(v.description?'<p>'+esc(v.description)+'</p>':'')+'</figcaption>'
  : '';
 return '<figure class="fixed-product-preview fixed-preview-layout-'+esc(cfg.key)+'">'+
  '<div class="fixed-product-preview-media"><img src="'+esc(imgSrc)+'"'+gifAttrs+' alt="'+esc(v.name||p.name)+'" loading="lazy" decoding="async" fetchpriority="low" draggable="false"></div>'+
  caption+
 '</figure>'
}
function fixedSelectedPreview(productId){
 const p=(state.showcase.fixed||[]).find(x=>String(x.id)===String(productId));
 const previews=(p?.previews||[]).filter(v=>v.enabled!==false);
 if(!previews.length)return null;
 const selected=state.fixedVariantSelection[String(productId)];
 return previews.find(v=>v.file===selected)||previews[0]
}
function applyManagedShowcaseImage(card,img,source){
 if(!img||!card)return;
 if(isAnimatedMediaUrl(source)){
  animatedMediaObserver?.unobserve?.(img);
  delete img.dataset.v2GifManaged;delete img.dataset.v2GifNear;delete img.dataset.v2GifQueued;delete img.dataset.v2GifLoading;
  img.dataset.v2AnimatedSrc=source;
  img.dataset.v2GifActive='0';
  img.classList.add('is-gif-paused');
  img.setAttribute('src',PAUSED_MEDIA_SRC);
  manageAnimatedMedia(card);
  const r=img.getBoundingClientRect();
  if(r.bottom>=-280&&r.top<=innerHeight+280)restoreAnimatedMedia(img)
 }else{
  animatedMediaObserver?.unobserve?.(img);
  delete img.dataset.v2AnimatedSrc;delete img.dataset.v2GifManaged;delete img.dataset.v2GifActive;delete img.dataset.v2GifNear;delete img.dataset.v2GifQueued;delete img.dataset.v2GifLoading;
  img.classList.remove('is-gif-paused');
  img.setAttribute('src',source)
 }
}
function setFixedCardVariant(productId,file){
 const p=(state.showcase.fixed||[]).find(x=>String(x.id)===String(productId));if(!p)return;
 const preview=(p.previews||[]).find(v=>v.enabled!==false&&v.file===file);if(!preview)return;
 state.fixedVariantSelection[String(productId)]=file;
 const card=document.querySelector('.v2-fixed-showcase-card[data-fixed-product-id="'+CSS.escape(String(productId))+'"]');
 const img=card?.querySelector('.v2-showcase-media>img');if(!img)return;
 applyManagedShowcaseImage(card,img,media(preview.file));
 closePresetColorPopover()
}
function openFixedVariantPopover(button){
 const productId=String(button.dataset.fixedVariantMenu||'');
 const p=(state.showcase.fixed||[]).find(x=>String(x.id)===productId);
 const variants=(p?.previews||[]).filter(v=>v.enabled!==false);
 const wasOpen=button.classList.contains('is-open')&&!!presetColorPopover;
 closePresetColorPopover();
 if(wasOpen||variants.length<2)return;
 button.classList.add('is-open');
 const selected=fixedSelectedPreview(productId);
 const pop=document.createElement('div');
 pop.className='v2-preset-color-popover';
 pop.setAttribute('role','menu');
 pop.innerHTML='<div class="v2-preset-color-popover-title">디자인 선택</div><div class="v2-preset-color-options">'+variants.map(v=>{
  const source=media(v.file),active=v.file===selected?.file;
  const thumb='<span class="v2-preset-color-thumb"><img src="'+esc(source)+'" alt="" loading="lazy" decoding="async" fetchpriority="low"></span>';
  return '<button type="button" class="v2-preset-color-option '+(active?'is-selected':'')+'" data-fixed-variant-choice="'+esc(v.file)+'" role="menuitemradio" aria-checked="'+(active?'true':'false')+'">'+
   thumb+
   '<span class="v2-preset-color-name">'+esc(v.name||'디자인')+'</span>'+
   '<span class="v2-preset-color-check" aria-hidden="true">✓</span></button>'
 }).join('')+'</div>';
 document.body.appendChild(pop);presetColorPopover=pop;positionPresetColorPopover(button,pop);
 pop.querySelectorAll('[data-fixed-variant-choice]').forEach(b=>b.onclick=e=>{e.stopPropagation();setFixedCardVariant(productId,b.dataset.fixedVariantChoice)});
 requestAnimationFrame(()=>positionPresetColorPopover(button,pop))
}
function detailPopupAnchor(trigger){
 const target=trigger?.closest?.('.v2-showcase-card')||trigger;
 const r=target?.getBoundingClientRect?.();
 const scrollY=window.scrollY||document.documentElement.scrollTop||0;
 return {
  centerY:r?scrollY+r.top+(r.height/2):scrollY+(innerHeight/2),
  documentHeight:Math.max(document.documentElement.scrollHeight||0,document.body?.scrollHeight||0,innerHeight||0)
 }
}
function positionDetailPopup(modal,anchorData){
 const dialog=modal?.querySelector?.('.v2-fixed-detail-dialog');if(!modal||!dialog)return;
 const data=anchorData||detailPopupAnchor(null);
 modal.classList.add('is-anchored');
 modal.style.top='0px';modal.style.left='0px';modal.style.right='0px';
 dialog.style.left='50%';dialog.style.transform='translateX(-50%)';
 requestAnimationFrame(()=>{
  if(!modal.isConnected||!dialog.isConnected)return;
  const h=Math.max(1,dialog.offsetHeight||dialog.getBoundingClientRect().height||1);
  const offset=Math.min(96,Math.max(52,h*.12));
  const top=Math.max(16,data.centerY-offset);
  const overlayHeight=Math.max(data.documentHeight,top+h+24);
  modal.style.height=Math.ceil(overlayHeight)+'px';
  modal.style.minHeight=Math.ceil(overlayHeight)+'px';
  dialog.style.top=Math.round(top)+'px';
  requestHeight()
 })
}
let presetDetailModal=null;
function closePresetDetailModal(){
 if(presetDetailModal){presetDetailModal.remove();presetDetailModal=null}
 if(!fixedDetailModal)document.body.classList.remove('v2-fixed-detail-open');
 requestHeight()
}
function presetPreviewPublicHtml(v,x){
 const cat=(state.settings?.presetCategories||[]).find(c=>c.id===x.category)||{id:x.category,label:x.category};
 const key=layoutKey(cat),source=presetVariantSource(v.file),deferGif=key==='profile'&&isAnimatedMediaUrl(source);
 const imgSrc=deferGif?PAUSED_MEDIA_SRC:source;
 const gifAttrs=deferGif?' data-v2-animated-src="'+esc(source)+'" data-v2-gif-active="0" class="is-gif-paused"':'';
 return '<figure class="fixed-product-preview fixed-preview-layout-'+esc(key)+'">'+
  '<div class="fixed-product-preview-media"><img src="'+esc(imgSrc)+'"'+gifAttrs+' alt="'+esc(v.name||smeta(x).name||'프리셋')+'" loading="lazy" decoding="async" fetchpriority="low" draggable="false"></div>'+
  '<figcaption><strong>'+esc(v.name||'기본 색상')+'</strong></figcaption>'+
 '</figure>'
}
function presetPolicyHtml(m){
 if(m.isNoEdit)return fixedOptionPublicHtml('변경 불가',[{label:'수정 불가',detail:'디자인 변경이 불가능한 프리셋입니다.'}],'is-fixed');
 const rows=[];
 if(m.colorChangeAvailable)rows.push({label:'수정 가능',detail:'디자인 요소를 자유롭게 수정할 수 있습니다.'});
 if(m.colorOnlyChangeAvailable)rows.push({label:'색상 변경 가능',detail:'색상 위주로 변경할 수 있습니다.'});
 return rows.length?fixedOptionPublicHtml('변경 가능',rows,'is-changeable'):''
}
function openPresetDetailModal(primaryFile,trigger){
 const anchorData=detailPopupAnchor(trigger);
 closePresetColorPopover();closeFixedDetailModal();closePresetDetailModal();
 const x=(state.showcase.preset||[]).find(v=>String(v.file)===String(primaryFile));if(!x)return;
 const m=smeta(x),variants=presetVisibleVariants(x.file),price=m.price>0?m.price.toLocaleString('ko-KR')+'원':'가격 문의';
 const badges=[{label:'1인 한정',cls:'is-limited-sale'},...presetBadges(m)].map(b=>'<span class="v2-preset-badge '+b.cls+'"><span class="v2-badge-label">'+esc(b.label)+'</span></span>').join('');
 const modal=document.createElement('div');
 modal.className='v2-fixed-detail-backdrop v2-preset-detail-backdrop';
 modal.innerHTML='<section class="v2-fixed-detail-dialog v2-preset-detail-dialog" role="dialog" aria-modal="true" aria-label="'+esc(m.name||'프리셋 상세')+'">'+
  '<button type="button" class="v2-fixed-detail-close" data-preset-detail-close aria-label="닫기">×</button>'+
  '<header class="v2-fixed-detail-head"><h3>'+esc(m.name||'프리셋')+'</h3>'+
   '<div class="v2-preset-badges v2-detail-badges">'+badges+'</div>'+
   (m.priceVisible?'<strong class="v2-fixed-detail-price">'+esc(price)+'</strong>':'')+
   (m.priceVisible&&m.priceNote?'<div class="v2-fixed-detail-price-meta"><span>'+esc(m.priceNote)+'</span></div>':'')+
   (m.description?'<p>'+esc(m.description)+'</p>':'')+
  '</header>'+
  '<div class="v2-fixed-detail-previews">'+variants.map(v=>presetPreviewPublicHtml(v,x)).join('')+'</div>'+
  '<div class="v2-fixed-detail-options">'+presetPolicyHtml(m)+'</div>'+
 '</section>';
 document.body.appendChild(modal);presetDetailModal=modal;document.body.classList.add('v2-fixed-detail-open');
 positionDetailPopup(modal,anchorData);
 modal.querySelector('[data-preset-detail-close]')?.addEventListener('click',closePresetDetailModal);
 modal.addEventListener('click',e=>{if(e.target===modal)closePresetDetailModal()});
 modal.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',()=>{positionDetailPopup(modal,anchorData);requestHeight()},{once:true})});
 manageAnimatedMedia(modal)
}
let fixedDetailModal=null;
function closeFixedDetailModal(){
 if(fixedDetailModal){fixedDetailModal.remove();fixedDetailModal=null}
 document.body.classList.remove('v2-fixed-detail-open');
 requestHeight()
}
function openFixedDetailModal(productId,trigger){
 const anchorData=detailPopupAnchor(trigger);
 closePresetColorPopover();closePresetDetailModal();closeFixedDetailModal();
 const p=(state.showcase.fixed||[]).find(x=>String(x.id)===String(productId));if(!p)return;
 const previews=(p.previews||[]).filter(v=>v.enabled!==false);
 const price=p.price>0?p.price.toLocaleString('ko-KR')+'원':'가격 문의';
 const meta=[p.priceScope,p.priceNote].map(v=>String(v||'').trim()).filter(Boolean);
 const note=String(p.note||'').trim();
 const modal=document.createElement('div');
 modal.className='v2-fixed-detail-backdrop';
 modal.innerHTML='<section class="v2-fixed-detail-dialog" role="dialog" aria-modal="true" aria-label="'+esc(p.name||'고정틀 상세')+'">'+
  '<button type="button" class="v2-fixed-detail-close" data-fixed-detail-close aria-label="닫기">×</button>'+
  '<header class="v2-fixed-detail-head"><h3>'+esc(p.name||'고정틀')+'</h3>'+
   (p.priceVisible?'<strong class="v2-fixed-detail-price">'+esc(price)+'</strong>':'')+
   (meta.length?'<div class="v2-fixed-detail-price-meta">'+meta.map(v=>'<span>'+esc(v)+'</span>').join('')+'</div>':'')+
   (p.description?'<p>'+esc(p.description)+'</p>':'')+
  '</header>'+
  '<div class="v2-fixed-detail-previews">'+previews.map(v=>fixedPreviewPublicHtml(v,p)).join('')+'</div>'+
  '<div class="v2-fixed-detail-options">'+
   fixedOptionPublicHtml('변경 가능',p.changeableOptions,'is-changeable')+
   fixedOptionPublicHtml('변경 불가',p.fixedOptions,'is-fixed')+
  '</div>'+
  (note?'<p class="v2-fixed-detail-note">'+esc(note)+'</p>':'')+
 '</section>';
 document.body.appendChild(modal);fixedDetailModal=modal;document.body.classList.add('v2-fixed-detail-open');
 positionDetailPopup(modal,anchorData);
 modal.querySelector('[data-fixed-detail-close]')?.addEventListener('click',closeFixedDetailModal);
 modal.addEventListener('click',e=>{if(e.target===modal)closeFixedDetailModal()});
 modal.querySelectorAll('img').forEach(img=>{if(!img.complete)img.addEventListener('load',()=>{positionDetailPopup(modal,anchorData);requestHeight()},{once:true})});
 manageAnimatedMedia(modal)
}
function fixedProductPublicCard(p){
 const selected=fixedSelectedPreview(p.id);if(!selected)return'';
 const previews=(p.previews||[]).filter(v=>v.enabled!==false);
 const cfg=fixedPreviewDisplayConfig(selected.category),profile=cfg.key==='profile';
 const source=media(selected.file),deferGif=profile&&isAnimatedMediaUrl(source);
 const imgSrc=deferGif?PAUSED_MEDIA_SRC:source;
 const gifAttrs=deferGif?' data-v2-animated-src="'+esc(source)+'" data-v2-gif-active="0" class="is-gif-paused"':'';
 const variantButton=previews.length>1?'<button type="button" class="v2-preset-color-button" data-fixed-variant-menu="'+esc(p.id)+'" aria-label="디자인 선택" aria-haspopup="menu"><svg viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="M2 2.25 6 5.75l4-3.5"/></svg></button>':'';
 const price=p.price>0?p.price.toLocaleString('ko-KR')+'원':'가격 문의';
 return '<article class="v2-showcase-card v2-fixed-showcase-card '+(profile?'is-profile':'')+'" data-fixed-product-id="'+esc(p.id)+'">'+
  '<div class="v2-showcase-media-wrap"><button type="button" class="v2-fixed-media-button" data-fixed-detail-open="'+esc(p.id)+'" aria-label="'+esc(p.name||'고정틀')+' 상세보기"><span class="v2-showcase-media"><img src="'+esc(imgSrc)+'"'+gifAttrs+' alt="'+esc(p.name||'고정틀')+'" loading="lazy" decoding="async" fetchpriority="low" draggable="false"></span></button>'+variantButton+'</div>'+
  '<div class="v2-showcase-name-row"><button type="button" class="v2-showcase-name-button" data-fixed-detail-open="'+esc(p.id)+'">'+esc(p.name||'이름 없음')+'</button></div>'+
  '<div class="v2-preset-badges"><span class="v2-preset-badge is-fixed-sale"><span class="v2-badge-label">고정틀</span></span></div>'+
  (p.priceVisible?'<span class="v2-unified-price">'+esc(price)+'</span>':'')+
 '</article>'
}
function combinedShowcaseLimits(fixedCount,presetCount){
 if(state.mobile){
  const perGroup=innerWidth>=520?3:2;
  return {fixed:fixedCount?Math.min(perGroup,fixedCount):0,preset:presetCount?Math.min(perGroup,presetCount):0}
 }
 const total=innerWidth>=1180?6:5;
 if(!fixedCount)return {fixed:0,preset:Math.min(total,presetCount)};
 if(!presetCount)return {fixed:Math.min(total,fixedCount),preset:0};
 const fixed=Math.min(fixedCount,Math.max(1,total-1));
 const preset=Math.min(presetCount,Math.max(1,total-fixed));
 return {fixed,preset}
}
function showcasePageData(items,perPage,key){
 const safe=Math.max(1,Number(perPage||1)),pages=Math.max(1,Math.ceil(items.length/safe));
 const page=Math.min(Math.max(1,Number(state.showcasePage?.[key]||1)),pages);
 if(!state.showcasePage)state.showcasePage={fixed:1,preset:1};
 state.showcasePage[key]=page;
 return {page,pages,shown:items.slice((page-1)*safe,page*safe)}
}
async function renderFixed(){
 const old=$('#seasonalFixedSection');
 if(old){old.hidden=true;old.innerHTML=''}
 if(state.settings?.fixedEnabled===false){state.showcase.fixed=[];return[]}
 const products=await publicFixedProducts();
 state.showcase.fixed=products;
 return products
}
async function renderShowcase(){
 const root=$('#showcaseSectionV2');if(!root)return;
 const fixed=state.settings?.fixedEnabled===false?[]:(state.showcase.fixed||[]);
 const presetOn=state.settings?.presetEnabled!==false&&state.settings?.showcasePresetEnabled!==false;
 const cats=presetOn?(state.settings.presetCategories||[]).filter(c=>c.enabled!==false):[];
 const allowed=new Set(cats.map(c=>c.id));
 let source=[];
 if(presetOn){
  if(Array.isArray(state.presetIndex))source=state.presetIndex.filter(x=>allowed.has(x.category));
  else{
   const batches=await Promise.all(cats.map(cat=>fetchAll('preset',cat.id).catch(()=>[])));
   source=batches.flat()
  }
 }
 const orderedPresets=applyOrder(source,state.settings?.presetOrder).filter(x=>{
  if(!presetRegistered(x))return false;
  const m=smeta(x);return m.showcaseKind!=='fixed'&&!m.pairChild
 });
 const all=collapsePresetProducts(orderedPresets).filter(x=>smeta(x).enabled);
 state.showcase.preset=all;
 const designWithItems=cats.filter(cat=>all.some(x=>x.category===cat.id));
 let activeCat=null,ordered=[];
 if(designWithItems.length){
  const activeId=state.presetFilter?.kind==='design'&&designWithItems.some(x=>x.id===state.presetFilter.id)?state.presetFilter.id:designWithItems[0].id;
  state.presetFilter={kind:'design',id:activeId};
  activeCat=designWithItems.find(x=>x.id===activeId)||designWithItems[0];
  const filtered=all.filter(x=>x.category===activeCat.id);
  ordered=[...filtered.filter(x=>smeta(x).featured),...filtered.filter(x=>!smeta(x).featured)]
 }
 if(!fixed.length&&!ordered.length){root.hidden=true;root.innerHTML='';return}
 const limits=combinedShowcaseLimits(fixed.length,ordered.length);
 const fixedData=fixed.length?showcasePageData(fixed,limits.fixed||1,'fixed'):{page:1,pages:1,shown:[]};
 const presetData=ordered.length?showcasePageData(ordered,limits.preset||1,'preset'):{page:1,pages:1,shown:[]};
 const filters=designWithItems.length>1?'<div class="v2-preset-filters v2-unified-preset-filters"><div class="v2-preset-filter-group is-design-only"><div class="v2-preset-filter-buttons">'+designWithItems.map(cat=>'<button type="button" class="v2-preset-filter-button '+(activeCat?.id===cat.id?'is-active':'')+'" data-preset-filter-id="'+esc(cat.id)+'">'+esc(cat.label||cat.id)+'</button>').join('')+'</div></div></div>':'';
 const fixedNotice=String(state.settings?.fixedNotice??'배경 디자인 외 모든 요소는 자유롭게 변경 가능합니다.').trim();
 const presetNotice=String(state.settings?.presetNotice??'아직 판매되지 않은 작업물입니다.\n그대로 제작을 원하시면 문의 시 말씀해주세요').trim();
 const fixedGroup=fixed.length?'<section class="v2-unified-group is-fixed" style="--group-weight:'+Math.max(1,fixedData.shown.length)+';--group-cols:'+Math.max(1,fixedData.shown.length)+'">'+
  '<header class="v2-unified-group-head"><h3>고정틀</h3>'+(fixedNotice?'<p>'+esc(fixedNotice)+'</p>':'')+'</header>'+
  '<div class="v2-unified-grid">'+fixedData.shown.map(fixedProductPublicCard).join('')+'</div>'+
  pagination('showcase-fixed',fixedData.pages,fixedData.page)+
 '</section>':'';
 const presetGroup=ordered.length?'<section class="v2-unified-group is-preset" style="--group-weight:'+Math.max(1,presetData.shown.length)+';--group-cols:'+Math.max(1,presetData.shown.length)+'">'+
  '<header class="v2-unified-group-head"><h3>프리셋</h3>'+(presetNotice?'<p>'+esc(presetNotice)+'</p>':'')+'</header>'+
  filters+
  '<div class="v2-unified-grid '+(activeCat&&layoutKey(activeCat)==='profile'?'is-profile-category':'is-media-category')+'">'+presetData.shown.map(presetCard).join('')+'</div>'+
  pagination('showcase-preset',presetData.pages,presetData.page)+
 '</section>':'';
 root.hidden=false;
 root.innerHTML='<h2>고정틀 · 프리셋</h2><div class="v2-unified-showcase '+((fixed.length&&ordered.length)?'is-dual':'is-single')+'">'+fixedGroup+presetGroup+'</div>';
 root.querySelectorAll('[data-preset-filter-id]').forEach(b=>b.onclick=()=>{state.presetFilter={kind:'design',id:b.dataset.presetFilterId||''};state.showcasePage.preset=1;renderShowcase();requestHeight()});
 root.querySelectorAll('[data-preset-color-menu]').forEach(b=>b.onclick=e=>{e.stopPropagation();openPresetColorPopover(b)});
 root.querySelectorAll('[data-preset-detail-open]').forEach(b=>b.onclick=e=>{e.stopPropagation();openPresetDetailModal(b.dataset.presetDetailOpen,b)});
 root.querySelectorAll('[data-fixed-variant-menu]').forEach(b=>b.onclick=e=>{e.stopPropagation();openFixedVariantPopover(b)});
 root.querySelectorAll('[data-fixed-detail-open]').forEach(b=>b.onclick=e=>{e.stopPropagation();openFixedDetailModal(b.dataset.fixedDetailOpen,b)});
 root.querySelectorAll('[data-v2-page^="showcase-fixed:"]').forEach(b=>b.onclick=()=>{const token=b.dataset.v2Page.split(':').pop(),cur=state.showcasePage.fixed||1;state.showcasePage.fixed=token==='prev'?cur-1:token==='next'?cur+1:Number(token);renderShowcase();requestHeight()});
 root.querySelectorAll('[data-v2-page^="showcase-preset:"]').forEach(b=>b.onclick=()=>{const token=b.dataset.v2Page.split(':').pop(),cur=state.showcasePage.preset||1;state.showcasePage.preset=token==='prev'?cur-1:token==='next'?cur+1:Number(token);renderShowcase();requestHeight()});
 root.querySelectorAll('img').forEach(img=>{img.draggable=false;img.setAttribute('draggable','false');if(!img.complete)img.addEventListener('load',requestHeight,{once:true})});
 manageAnimatedMedia(root);
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
 if(target==='fixed'||target==='seasonal-fixed')return scrollToElement($('#showcaseSectionV2'))
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
 add('fixed',$('#showcaseSectionV2'));
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
function v2Pricing(){
 return state.settings?.quoteConfig?.pricingV2||{}
}
function v2ProfileMode(key,fallback){
 const x=v2Pricing()?.profileModes?.[key]||{};
 return {id:String(x.id||key),label:String(x.label||fallback||key),price:Math.max(0,Number(x.price||0))}
}
function selectedPresetProduct(card){
 const file=String(card.dataset.selectedPresetFile||'');
 return (state.showcase.preset||[]).find(v=>String(v.file)===file)||null
}
function selectedPresetPrice(card){
 const x=selectedPresetProduct(card);return x?Math.max(0,Number(smeta(x).price||0)):0
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
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="custom" '+(profileMode==='custom'?'checked':'')+'><span>'+esc(v2ProfileMode('custom','맞춤제작').label)+'</span></label>'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="fixed" '+(profileMode==='fixed'?'checked':'')+'><span>'+esc(v2ProfileMode('fixed','고정틀 구매').label)+'</span></label>'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="preset" '+(profileMode==='preset'?'checked':'')+'><span>'+esc(v2ProfileMode('preset','프리셋 구매').label)+'</span></label>'+
   '<label class="choice-pill"><input type="radio" data-v2-mode="profile" name="v2-profile-'+card.dataset.requestId+'" value="change" '+(profileMode==='change'?'checked':'')+'><span>'+esc(v2ProfileMode('change','이름/움짤 변경').label)+'</span></label></div></fieldset>';
  if(profileMode==='fixed')html+=fixedSelectionHtml(card);
  if(profileMode==='preset'){
   html+=selectionHtml(card.dataset.selectedPresetFile);
   html+=presetInquiryColorHtml(card)
  }
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
  requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.());window.refreshInquiryEstimate?.()
 });
 box.querySelectorAll('[data-v2-banner-index]').forEach(i=>i.onchange=()=>{card.dataset['bannerType'+i.dataset.v2BannerIndex]=i.value});
 box.querySelectorAll('[data-v2-select="preset"]').forEach(b=>b.onclick=()=>{
  if(card.dataset.selectedPresetFile!==b.dataset.file)delete card.dataset.selectedPresetColorFile;
  card.dataset.selectedPresetFile=b.dataset.file;
  injectInquiry(card);requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.())
 });
 box.querySelectorAll('[data-v2-select="preset-color"]').forEach(i=>i.onchange=()=>{
  card.dataset.selectedPresetColorFile=i.value;
  requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.());window.refreshInquiryEstimate?.()
 });
 box.querySelectorAll('[data-v2-select="fixed"]').forEach(i=>i.onchange=()=>{
  card.dataset.selectedFixedProductId=String(i.dataset.productId||i.value||'');
  delete card.dataset.fixedPattern;
  delete card.dataset.fixedPatternOther;
  injectInquiry(card);
  requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.());window.refreshInquiryEstimate?.()
 });
 manageAnimatedMedia(box);
 requestAnimationFrame(()=>window.updateInquiryQuestionNumbers?.())
}
function presetInquiryColorHtml(card){
 const primary=String(card.dataset.selectedPresetFile||'');if(!primary)return'';
 const variants=presetVisibleVariants(primary);
 if(variants.length<2)return'';
 const selected=String(card.dataset.selectedPresetColorFile||'');
 return '<fieldset class="v2-mode-field choice-field inquiry-plain-choice v2-preset-color-inquiry"><legend data-question-title>색상 선택</legend><div class="choice-row">'+variants.map(v=>
  '<label class="choice-pill v2-preset-color-choice"><input type="radio" data-v2-select="preset-color" name="v2-preset-color-'+esc(card.dataset.requestId||'0')+'" value="'+esc(v.file)+'" '+(selected===v.file?'checked':'')+'><span>'+esc(v.name||'색상')+'</span></label>'
 ).join('')+'</div></fieldset>'
}
function selectionHtml(selected){
 const arr=state.showcase.preset.filter(x=>{
  const c=(state.settings?.presetCategories||[]).find(v=>v.id===x.category)||{},m=smeta(x);
  return layoutKey(c)==='profile'&&m.enabled
 });
 const options=arr.map(x=>{
  const m=smeta(x),disabled=false,status=m.isReserved?'예약중':m.isReservable?'예약가능':m.isNew?'NEW':'';
  const representative=presetSelectedVariant(x.file),source=presetVariantSource(representative.file||x.file),gif=isAnimatedMediaUrl(source);
  const imgSrc=gif?PAUSED_MEDIA_SRC:source,gifAttrs=gif?' data-v2-animated-src="'+esc(source)+'" data-v2-gif-active="0" class="is-gif-paused"':'';
  return '<button type="button" data-v2-select="preset" data-file="'+esc(x.file)+'" class="'+(selected===x.file?'is-selected':'')+'" '+(disabled?'disabled':'')+'>'+
   '<img src="'+esc(imgSrc)+'"'+gifAttrs+' alt="" loading="lazy" decoding="async" fetchpriority="low"><span>'+esc(m.name||'이름 없음')+'</span>'+
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
function selectedPresetColor(card){
 const primary=String(card.dataset.selectedPresetFile||''),variants=presetVisibleVariants(primary);
 if(variants.length<2)return variants[0]||null;
 const file=String(card.dataset.selectedPresetColorFile||'');
 return variants.find(v=>v.file===file)||null
}
function selectedPresetNeedsColor(card){
 const primary=String(card.dataset.selectedPresetFile||'');
 return presetVisibleVariants(primary).length>1
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
   selectedPresetColorName:selectedPresetColor(card)?.name||'',
   selectedPresetColorFile:selectedPresetColor(card)?.file||'',
   selectedPresetNeedsColor:selectedPresetNeedsColor(card),
   selectedFixedProductId:card.dataset.selectedFixedProductId||'',
   selectedFixedProductName:fixedProduct?.name||'',
   selectedFixedPrice:Math.max(0,Number(fixedProduct?.price||0)),
   selectedPresetPrice:selectedPresetPrice(card),
   bannerTypes:bannerTypeEnabled()?banners.map((x,i)=>({label:x.label,type:card.dataset['bannerType'+i]||'B'})):[],
   profileSelected:types.some(x=>/움짤\s*프사/.test(x.label)||/움짤\s*프로필/.test(x.label)||x.id==='profile-a')
  }
 },
 validateCard(card){
  const d=this.inquiryData(card);
  if(d.profileSelected&&d.profileMode==='fixed'&&!d.selectedFixedProductName)return {ok:false,message:'구매할 고정틀을 선택해주세요.'};
  if(d.profileSelected&&d.profileMode==='preset'&&!d.selectedPresetFile)return {ok:false,message:'구매할 프리셋을 선택해주세요.'};
  if(d.profileSelected&&d.profileMode==='preset'&&d.selectedPresetNeedsColor&&!d.selectedPresetColorFile)return {ok:false,message:'구매할 프리셋의 색상을 선택해주세요.'};
  return {ok:true}
 },
 inquiryLines(card){
  const d=this.inquiryData(card),out=[];
  if(d.profileSelected){
   const modeLabel=v2ProfileMode(d.profileMode,d.profileMode==='fixed'?'고정틀 구매':d.profileMode==='preset'?'프리셋 구매':d.profileMode==='change'?'이름/움짤 변경':'맞춤제작').label;
   out.push('움짤프사 신청 방식: '+modeLabel);
   if(d.profileMode==='fixed'&&d.selectedFixedProductName){
    out.push('선택 고정틀: '+d.selectedFixedProductName)
   }
   if(d.profileMode==='preset'&&d.selectedPresetName){
    out.push('선택 프리셋: '+d.selectedPresetName);
    if(d.selectedPresetNeedsColor&&d.selectedPresetColorName)out.push('선택 색상: '+d.selectedPresetColorName)
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
 const fixedPromise=renderFixed();
 const portfolioPromise=inquiryPart?Promise.resolve():renderPortfolio();
 await fixedPromise;
 await renderShowcase();
 if(!portfolioPart)initInquiryObserver();
 await portfolioPromise;
 // Only the complete all-in-one page may announce a menu snapshot.
 // Split inquiry/portfolio frames are intentionally excluded because each holds partial state.
 if(!inquiryPart&&!portfolioPart)announceNavData();
 document.addEventListener('contextmenu',e=>{if(e.target.closest?.('.v2-media,.v2-showcase-media,.v2-product-grid,.fixed-product-preview-media'))e.preventDefault()});
 document.addEventListener('dragstart',e=>{if(e.target.closest?.('.v2-media,.v2-showcase-media,.v2-product-grid,.fixed-product-preview-media'))e.preventDefault()});
 document.addEventListener('click',e=>{if(presetColorPopover&&!e.target.closest('.v2-preset-color-popover')&&!e.target.closest('[data-preset-color-menu]')&&!e.target.closest('[data-fixed-variant-menu]'))closePresetColorPopover()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePresetColorPopover();closePresetDetailModal();closeFixedDetailModal()}});
 let showcaseResizeTimer=0;window.addEventListener('resize',()=>{closePresetColorPopover();clearTimeout(showcaseResizeTimer);showcaseResizeTimer=setTimeout(()=>{state.showcasePage.fixed=1;state.showcasePage.preset=1;renderShowcase();requestHeight()},120)},{passive:true});
 window.addEventListener('scroll',closePresetColorPopover,{passive:true});
 document.addEventListener('visibilitychange',()=>{
  document.querySelectorAll('img[data-v2-animated-src]').forEach(img=>{
   if(document.hidden)pauseAnimatedMedia(img);
   else{
    const r=img.getBoundingClientRect();
    if(r.bottom>=-280&&r.top<=innerHeight+280)restoreAnimatedMedia(img)
   }
  })
 });
 const mq=matchMedia('(max-width:680px)');
 mq.addEventListener?.('change',e=>{state.mobile=e.matches;state.showcasePage.fixed=1;state.showcasePage.preset=1;renderShowcase();state.portfolio.forEach(d=>{d.page=1});renderPortfolio()});
 requestHeight()
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(console.error),{once:true});else init().catch(console.error);
})();