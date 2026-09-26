(function(){
  if(window.__chilgongQnaBridge)return;
  window.__chilgongQnaBridge=true;
  window.addEventListener('message',function(e){
    if(e.origin!=='https://artmug-portfolio.pages.dev')return;
    if(e.data!=='chilgong:open-inquiry')return;
    if(!window.pLightBox||typeof window.pLightBox.show!=='function')return;
    window.pLightBox.show(
      'php/qna_write.php?cate=104000000000&number=61261',
      'iframe_w',
      '1080',
      '500',
      '문의하기',
      '0'
    );
    if(typeof window.qnaAlert==='function')window.qnaAlert();
  });
})();
