const API_ORIGIN='https://artmug-portfolio-api.kizzzeee0.workers.dev';

export async function onRequest(context){
  const incoming=new URL(context.request.url);
  const upstream=new URL(API_ORIGIN);
  upstream.pathname=incoming.pathname.replace(/^\/admin-api(?=\/|$)/,'')||'/';
  upstream.search=incoming.search;

  const headers=new Headers(context.request.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');

  const init={
    method:context.request.method,
    headers,
    redirect:'manual'
  };
  if(!['GET','HEAD'].includes(context.request.method)){
    init.body=context.request.body;
  }

  const response=await fetch(upstream.toString(),init);
  const outHeaders=new Headers(response.headers);

  const setCookie=outHeaders.get('Set-Cookie');
  if(setCookie){
    outHeaders.set('Set-Cookie',setCookie.replace(/SameSite=None/gi,'SameSite=Lax'));
  }

  if(/^\/(?:auth|api\/admin)(?:\/|$)/.test(upstream.pathname)){
    outHeaders.set('Cache-Control','no-store');
  }

  return new Response(response.body,{
    status:response.status,
    statusText:response.statusText,
    headers:outHeaders
  });
}
