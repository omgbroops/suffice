// The trusted Electron-compatible main process forwards only this narrow
// command. Wry owns the isolated WebView and publishes browser-state events.
export const createBrowserSurface=native=>()=>({
  command:payload=>native('browser.command',payload),
  dispose:()=>{} // The host drops its child when the parent window exits.
});
