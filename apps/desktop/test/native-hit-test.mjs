import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

// Ask Windows how it will route an actual mouse press, without moving the cursor.
export async function nativeHitTests(app,points){
 if(process.platform!=='win32')return null;
 const handle=await app.evaluate(({BrowserWindow})=>{const buffer=BrowserWindow.getAllWindows()[0].getNativeWindowHandle();return (buffer.length===8?buffer.readBigUInt64LE():BigInt(buffer.readUInt32LE())).toString();});
 const pairs=JSON.stringify(points.map(point=>({x:Math.round(point.x),y:Math.round(point.y)})));
 const script=`Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SufficeHitTest {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window,ref Point point);
 [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window,uint message,IntPtr wParam,IntPtr lParam);
 public static int Hit(long handle,int x,int y) { var point=new Point {X=x,Y=y}; ClientToScreen((IntPtr)handle,ref point); return (int)SendMessage((IntPtr)handle,0x84,IntPtr.Zero,(IntPtr)((point.Y << 16)|(point.X & 0xffff))); }
}
'@
$points=ConvertFrom-Json '${pairs}'; $values=@(foreach($point in $points){[SufficeHitTest]::Hit(${handle},$point.x,$point.y)}); ConvertTo-Json -Compress -InputObject $values`;
 const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:20000});return JSON.parse(stdout);
}
