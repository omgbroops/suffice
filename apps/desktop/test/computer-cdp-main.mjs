// Electron main for computer-cdp.test.mjs: hidden window, prints one JSON line, quits.
import {app, BrowserWindow} from 'electron';
import {cdpBrowser} from '../../../src/ref-browser.mjs';
app.whenReady().then(async () => {
const url = process.env.CDP_TEST_URL;
const win = new BrowserWindow({show: false, webPreferences: {sandbox: true}});
const b = cdpBrowser(win.webContents);
await b.open('x', url);
const s = await b.snapshot('x');
const ref = re => '@' + new RegExp(`${re}.*\\[ref=(e\\d+)\\]`).exec(s.text)[1];
const click = await b.click('x', ref('button "Save"')), fill = await b.fill('x', ref('textbox'), 'Bob');
const title = win.webContents.getTitle();
await win.webContents.loadURL(url + '?2');
const stale = await b.click('x', ref('button "Save"'));
console.log('RESULT ' + JSON.stringify({s: s.text, click, fill, title, stale}));
app.exit(0);
}).catch(e => { console.error(e); app.exit(1); });
