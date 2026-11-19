import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {pageToMarkdown,crawlToMarkdown,assertPublic,crawlTool} from '../src/web-crawl.mjs';

const PAGE=`<!doctype html><html><head><title>Guide &amp; Notes</title><script>var secret=1;${"x=1;".repeat(1500)}</script><style>.x{}</style></head><body>
<nav><a href="/a">Home</a><a href="/b">Pricing</a></nav><div class="cookie-banner">Accept cookies</div>
<main><h1>Guide</h1><p>Intro with <strong>bold</strong>, <em>soft</em> and <a href="/two">a link</a>. ${'Readable sentence. '.repeat(40)}</p>
<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul><pre>let a = 1;\nlet b = 2;</pre>
<table><tr><th>k</th><th>v</th></tr><tr><td>x</td><td>1</td></tr></table><img src="/i.png" alt="pic"></main><footer>Copyright junk</footer></body></html>`;
test('pageToMarkdown keeps the article and drops chrome',()=>{
 const {title,markdown,links}=pageToMarkdown(PAGE,'https://e.test/doc');
 assert.equal(title,'Guide & Notes');
 for(const want of ['# Guide','**bold**','*soft*','[a link](https://e.test/two)','- one','  - nested','```\nlet a = 1;','| k | v |','| x | 1 |','![pic](https://e.test/i.png)'])assert.ok(markdown.includes(want),want+'\n'+markdown);
 for(const bad of ['secret','Accept cookies','Copyright junk','Pricing'])assert.ok(!markdown.includes(bad),bad);
 assert.ok(links.includes('https://e.test/two')&&links.includes('https://e.test/b'));
});
test('crawl follows same-site links, caps size, reports tokens saved, blocks private hosts',async()=>{
 const hits=[];const server=createServer((req,res)=>{hits.push(req.url);if(req.url==='/gone'){res.writeHead(302,{location:'http://127.0.0.1:1/'});return res.end();}res.writeHead(200,{'content-type':'text/html'});res.end(req.url==='/two'?'<title>Two</title><p>'+'second page '.repeat(40)+'</p>':PAGE.replace('/two','/two'));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const one=await crawlToMarkdown(base+'/doc',{allowPrivate:true});
  assert.equal(one.details.pages,1);assert.ok(one.details.savedTokens>0&&one.details.tokens<one.details.bytes/4);assert.ok(one.details.bytes>1000);
  const two=await crawlToMarkdown(base+'/doc',{allowPrivate:true,maxPages:4});
  assert.equal(two.details.pages,4);assert.match(two.text,/# Two/);assert.deepEqual(hits.filter(h=>h==='/two').length,1);
  const capped=await crawlToMarkdown(base+'/doc',{allowPrivate:true,maxChars:500});
  assert.equal(capped.details.truncated,true);assert.match(capped.text,/\[truncated\]/);
  const tool=crawlTool({allowPrivate:true});assert.equal(tool.exposure,'deferred');
  const out=await tool.execute('1',{url:base+'/doc'});assert.equal(out.details.title,'Guide & Notes');assert.ok(out.content[0].text.startsWith('# Guide & Notes'));
  await assert.rejects(()=>crawlToMarkdown(base+'/doc'),/private or local/);
  await assert.rejects(()=>crawlToMarkdown(base+'/gone',{allowPrivate:false}),/private or local/);
 }finally{server.close();}
 for(const bad of ['http://localhost/x','http://[::1]/','http://169.254.169.254/','http://10.1.2.3/','file:///etc/passwd'])await assert.rejects(()=>assertPublic(bad));
});
