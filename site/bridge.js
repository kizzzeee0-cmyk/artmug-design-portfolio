(function(){
  if(window.__chilgongQnaBridge)return;
  window.__chilgongQnaBridge=true;

  const CHILD_ORIGIN='https://artmug-portfolio.pages.dev';

  const sectionMaps=new Map();
  let activeRaf=0;

  function broadcastToArtmugFrames(message){
    document.querySelectorAll('iframe').forEach(function(frame){
      try{
        const src=String(frame.getAttribute('src')||frame.src||'');
        if(src.includes('artmug-portfolio.pages.dev'))frame.contentWindow.postMessage(message,CHILD_ORIGIN)
      }catch(e){}
    })
  }

  function updateActiveSection(){
    cancelAnimationFrame(activeRaf);
    activeRaf=requestAnimationFrame(function(){
      const y=window.scrollY+Math.min(180,Math.max(70,window.innerHeight*.18));
      const candidates=[];
      sectionMaps.forEach(function(sections,frame){
        if(!frame||!frame.isConnected)return;
        const base=Math.round(frame.getBoundingClientRect().top+window.scrollY);
        (sections||[]).forEach(function(x){
          const top=base+Math.max(0,Number(x.offset)||0);
          candidates.push({target:String(x.target||''),top:top})
        })
      });
      if(!candidates.length)return;
      candidates.sort((a,b)=>a.top-b.top);
      let active=candidates[0];
      for(const x of candidates){if(x.top<=y)active=x;else break}
      if(active&&active.target)broadcastToArtmugFrames({type:'artmug-active-section',target:active.target})
    })
  }
  window.addEventListener('scroll',updateActiveSection,{passive:true});
  window.addEventListener('resize',updateActiveSection,{passive:true});

  function iframeForSource(source,role){
    const frames=Array.from(document.querySelectorAll('iframe'));

    // Best case: the message came from a direct child iframe.
    const direct=frames.find(frame=>{
      try{return frame.contentWindow===source}catch(e){return false}
    });
    if(direct)return direct;

    // Fallback for Artmug wrappers/nested frame structures where event.source
    // is not equal to a direct iframe.contentWindow.
    const roleNeedle=role==='inquiry'?'inquiry':role==='portfolio'?'portfolio':'';
    const candidates=frames.filter(frame=>{
      const src=String(frame.getAttribute('src')||frame.src||'');
      return src.includes('artmug-portfolio.pages.dev')
    });
    if(roleNeedle){
      const matched=candidates.find(frame=>{
        const src=String(frame.getAttribute('src')||frame.src||'');
        return src.includes('/'+roleNeedle)
      });
      if(matched)return matched
    }
    return candidates.length===1?candidates[0]:null
  }

  function applyIframeHeight(frame,height){
    if(!frame)return false;
    const h=Math.max(1,Math.ceil(Number(height)||0));
    if(!h)return false;

    frame.setAttribute('height',String(h));
    frame.setAttribute('scrolling','no');
    frame.style.setProperty('height',h+'px','important');
    frame.style.setProperty('min-height',h+'px','important');
    frame.style.setProperty('max-height','none','important');
    frame.style.setProperty('overflow','hidden','important');
    frame.style.setProperty('display','block');

    // Common Artmug/embed wrappers sometimes retain a fixed/min height.
    // Only relax wrappers whose visible height would otherwise clip the iframe.
    let parent=frame.parentElement;
    for(let i=0;i<2&&parent;i++,parent=parent.parentElement){
      const cs=window.getComputedStyle(parent);
      const overflowY=cs.overflowY;
      const fixedHeight=parseFloat(cs.height)||0;
      if((overflowY==='auto'||overflowY==='scroll'||overflowY==='hidden')&&fixedHeight>0&&fixedHeight<h){
        parent.style.setProperty('height','auto','important');
        parent.style.setProperty('max-height','none','important');
        parent.style.setProperty('overflow-y','visible','important')
      }
    }
    return true
  }

  window.addEventListener('message',function(e){
    if(e.origin!==CHILD_ORIGIN)return;
    const data=e.data;

    if(data&&typeof data==='object'&&data.type==='artmug-portfolio-height'){
      const frame=iframeForSource(e.source,String(data.role||''));
      applyIframeHeight(frame,data.height);
      return
    }

    if(data&&typeof data==='object'&&data.type==='artmug-v2-section-map'){
      const frame=iframeForSource(e.source,String(data.role||''));
      if(frame){
        sectionMaps.set(frame,Array.isArray(data.sections)?data.sections:[]);
        updateActiveSection()
      }
      return
    }

    if(data&&typeof data==='object'&&data.type==='artmug-mobile-nav-height'){
      const frame=iframeForSource(e.source,'');
      applyIframeHeight(frame,data.height);
      return
    }

    if(data&&typeof data==='object'&&data.type==='artmug-scroll-request'){
      if(data.top){
        window.scrollTo({top:0,behavior:'smooth'});
        return
      }
      const frame=iframeForSource(e.source,String(data.role||''));
      if(!frame)return;
      const offset=Math.max(0,Number(data.offset)||0);
      const top=Math.max(0,Math.round(frame.getBoundingClientRect().top+window.scrollY+offset));
      window.scrollTo({top:top,behavior:'smooth'});
      return
    }

    if(data==='chilgong:open-inquiry'){
      if(!window.pLightBox||typeof window.pLightBox.show!=='function')return;
      window.pLightBox.show(
        'php/qna_write.php?cate=104000000000&number=61261',
        'iframe_w',
        '1080',
        '500',
        '문의하기',
        '0'
      );
      if(typeof window.qnaAlert==='function')window.qnaAlert()
    }
  });

  // Ask already-loaded child frames to report once when the bridge starts.
  window.setTimeout(function(){
    document.querySelectorAll('iframe').forEach(function(frame){
      try{
        const src=String(frame.getAttribute('src')||frame.src||'');
        if(src.includes('artmug-portfolio.pages.dev')){
          frame.contentWindow.postMessage({type:'artmug-request-section-map'},CHILD_ORIGIN)
        }
      }catch(e){}
    })
  },0)
})();
