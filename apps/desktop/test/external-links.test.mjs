import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {externalLink}=createRequire(import.meta.url)('../electron/external-links.cjs');
test('default-browser links permit web and mail links and reject executable schemes',()=>{
 for(const url of ['https://example.com/a','http://localhost:3000/','mailto:hello@example.com'])assert.equal(externalLink(url),url);
 for(const url of ['javascript:alert(1)','file:///C:/Windows/test','data:text/html,test','https://user:pass@example.com','not a url'])assert.equal(externalLink(url),null);
});
