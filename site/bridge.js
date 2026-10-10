(function(){
  if(window.__chilgongQnaBridge)return;
  window.__chilgongQnaBridge=true;

  const CHILD_ORIGIN='https://artmug-portfolio.pages.dev';

  const sectionMaps=new Map();
  let activeRaf=0;
  const quickNavFrames=new WeakMap();

  function isDesktopQuickNavFrame(frame){
    try{
      const src=String(frame.getAttribute('src')||frame.src||'');
      return /artmug-portfolio\.pages\.dev\/sidebar(?:\/|\.html|$)/.test(src)
    }catch(e){return false}
  }

  function restoreQuickNavFrame(frame){
    const saved=quickNavFrames.get(frame);
    if(!saved)return;
    ['position','top','right','left','z-index','width','max-width','margin'].forEach(function(prop){
      const value=saved[prop];
      if(value)frame.style.setProperty(prop,value.value,value.priority||'');
      else frame.style.removeProperty(prop)
    });
    if(saved.parentMinHeight!==undefined&&frame.parentElement){
      if(saved.parentMinHeight)frame.parentElement.style.setProperty('min-height',saved.parentMinHeight);
      else frame.parentElement.style.removeProperty('min-height')
    }
    quickNavFrames.delete(frame)
  }

  function applyQuickNavFollower(frame){
    if(!frame||!isDesktopQuickNavFrame(frame))return;
    if(window.innerWidth<=900){
      restoreQuickNavFrame(frame);
      return
    }

    let saved=quickNavFrames.get(frame);
    if(!saved){
      const rect=frame.getBoundingClientRect();
      const style=frame.style;
      saved={};
      ['position','top','right','left','z-index','width','max-width','margin'].forEach(function(prop){
        const value=style.getPropertyValue(prop),priority=style.getPropertyPriority(prop);
        saved[prop]=value?{value,priority}:null
      });
      saved.rightGap=Math.max(8,Math.round(window.innerWidth-rect.right));
      saved.width=Math.max(1,Math.round(rect.width||frame.offsetWidth||194));
      saved.height=Math.max(1,Math.round(rect.height||frame.offsetHeight||1));
      saved.parentMinHeight=frame.parentElement?frame.parentElement.style.getPropertyValue('min-height'):'';
      quickNavFrames.set(frame,saved)
    }

    frame.style.setProperty('position','fixed','important');
    frame.style.setProperty('top','16px','important');
    frame.style.setProperty('right',saved.rightGap+'px','important');
    frame.style.setProperty('left','auto','important');
    frame.style.setProperty('z-index','50','important');
    frame.style.setProperty('width',saved.width+'px','important');
    frame.style.setProperty('max-width','calc(100vw - 16px)','important');
    frame.style.setProperty('margin','0','important');

    // Keep the original sidebar column from collapsing after the iframe
    // leaves normal document flow.
    if(frame.parentElement&&saved.height>0){
      frame.parentElement.style.setProperty('min-height',saved.height+'px')
    }
  }

  function syncQuickNavFollower(){
    document.querySelectorAll('iframe').forEach(function(frame){
      if(isDesktopQuickNavFrame(frame))applyQuickNavFollower(frame)
    })
  }

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
  window.addEventListener('resize',function(){
    updateActiveSection();
    syncQuickNavFollower()
  },{passive:true});

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
    syncQuickNavFollower();
    document.querySelectorAll('iframe').forEach(function(frame){
      try{
        const src=String(frame.getAttribute('src')||frame.src||'');
        if(src.includes('artmug-portfolio.pages.dev')){
          frame.contentWindow.postMessage({type:'artmug-request-section-map'},CHILD_ORIGIN)
        }
      }catch(e){}
    })
  },0);

  if('MutationObserver' in window){
    new MutationObserver(function(){
      syncQuickNavFollower()
    }).observe(document.documentElement,{childList:true,subtree:true})
  }
})();
