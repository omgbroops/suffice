import test from 'node:test';
import assert from 'node:assert/strict';
import {nextTranscriptFollowing} from '../src/transcript-scroll.js';

const next=overrides=>nextTranscriptFollowing({following:true,lastScrollTop:500,scrollTop:500,scrollHeight:1000,clientHeight:500,...overrides});
test('scrolling up releases following even within the bottom threshold',()=>{
 assert.equal(next({scrollTop:497}),false);
 assert.equal(next({scrollTop:499.5}),false);
});
test('a queued stationary scroll event cannot undo upward wheel intent',()=>{
 assert.equal(next({following:false}),false);
});
test('a layout clamp preserves following without overriding upward intent',()=>{
 assert.equal(next({scrollTop:300,scrollHeight:800}),true);
 assert.equal(next({scrollTop:300,clientHeight:700}),true);
 assert.equal(next({scrollTop:0,scrollHeight:400}),true);
 assert.equal(next({following:false,scrollTop:300,scrollHeight:800}),false);
 assert.equal(next({scrollTop:299.5,scrollHeight:800}),false);
});
test('following resumes only when scrolling down to the end',()=>{
 assert.equal(next({following:false,lastScrollTop:490,scrollTop:497}),true);
 assert.equal(next({following:false,lastScrollTop:400,scrollTop:450}),false);
 assert.equal(next({following:true,lastScrollTop:490,scrollTop:497}),true);
});
