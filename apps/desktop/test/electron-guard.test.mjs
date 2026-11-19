import test from 'node:test';
import assert from 'node:assert/strict';
import {hardenLaunch,guard,SHOW} from './electron-guard.mjs';
test('launch helper hides the window, preloads the no-dialog guard first, and isolates tmux + history',()=>{
 if(SHOW)return;
 const a=hardenLaunch({args:['app','--x'],env:{PATH:'/bin'}},3);
 assert.equal(a.env.SUFFICE_TEST_HIDE_WINDOW,'1');
 assert.deepEqual(a.args.slice(0,2),guard);
 assert.deepEqual(a.args.slice(2),['app','--x']);
 assert.match(a.env.SUFFICE_SESSIONS_SOCKET,/^sfx-t-\d+-3$/);
 assert.ok(a.env.SUFFICE_HISTORY_HOME);
 const b=hardenLaunch({args:[...guard,'app'],env:{SUFFICE_SESSIONS_SOCKET:'suffice',SUFFICE_HISTORY_HOME:'/h'}});
 assert.deepEqual(b.args,[...guard,'app']);
 assert.notEqual(b.env.SUFFICE_SESSIONS_SOCKET,'suffice');
 assert.equal(b.env.SUFFICE_HISTORY_HOME,'/h');
 assert.equal(hardenLaunch({args:['a'],env:{SUFFICE_SESSIONS_SOCKET:'mine'}}).env.SUFFICE_SESSIONS_SOCKET,'mine');
});
