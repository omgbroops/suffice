// Starter-card images: the wallpaper's own dither (4x4 Bayer, three levels, seeded grain), drawn at card size.
// Each card takes one tint sampled from the wallpaper canvas; with no usable wallpaper the horizon's own colours stand in.
const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const bell=(n,spread)=>Math.exp(-(n*n)/(2*spread*spread));
// Horizon palette (backgrounds/horizon.js): sky, rim light and cyan edge at full strength.
export const FALLBACK_TINTS=[[44,112,176],[196,122,72],[52,128,132]];
const lum=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
// One tint per card from a 24x24 downsample of the wallpaper: bluest, warmest, and the most cyan lit pixel.
export function pickTints(data){
 const px=[];for(let i=0;i<data.length;i+=4)px.push([data[i],data[i+1],data[i+2]]);
 const lit=px.filter(c=>lum(c)>34);
 if(lit.length<6)return FALLBACK_TINTS;
 const best=(score)=>lit.reduce((a,b)=>score(b)>score(a)?b:a);
 const cool=best(c=>c[2]-c[0]),warm=best(c=>c[0]-c[2]),teal=best(c=>Math.min(c[1],c[2])-c[0]);
 const lift=c=>{const m=Math.max(...c,1),k=Math.min(2.6,190/m);return c.map(v=>Math.min(255,Math.round(v*k)));};
 return [lift(cool),lift(warm),lift(teal)];
}
export function sampleWallpaper(){
 try{
  const source=document.querySelector('canvas.atmosphere');
  if(!source||!source.width||document.documentElement.dataset.theme==='light')return FALLBACK_TINTS;
  const probe=document.createElement('canvas');probe.width=probe.height=24;
  const context=probe.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0,24,24);
  return pickTints(context.getImageData(0,0,24,24).data);
 }catch{return FALLBACK_TINTS;}
}
// slope and offset move the lit band so the three cards are three different crops of the same horizon.
const BANDS=[{slope:.5,offset:.46},{slope:-.35,offset:.78},{slope:.12,offset:.62}];
export function paintStarterImage(canvas,tint,index=0){
 const context=canvas.getContext('2d',{alpha:false}),w=canvas.width,h=canvas.height,band=BANDS[index%BANDS.length];
 const light=document.documentElement.dataset.theme==='light';
 const pixels=context.createImageData(w,h);let seed=54893+index*7919;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
 const base=light?[226,229,236]:[12,14,17];
 for(let y=0;y<h;y++){const v=y/h;for(let x=0;x<w;x++){
  const u=x/w,horizon=band.offset+band.slope*(u-.5)+.05*Math.sin(u*3.8+index),d=v-horizon;
  const body=bell(d+.24,.24),core=bell(d+.07,.09),rim=bell(d,.022);
  const daylight=.72+.28*bell(u-.5,.35);
  const threshold=bayer[(y%4)*4+x%4]/16,stipple=threshold+(random()-.5)*.26;
  const dither=stipple<.25?.25:stipple<.47?.61:1;
  const grain=(random()-.5)*9,lit=(body*.5+core*.7+rim*1.15)*dither*daylight,i=(y*w+x)*4;
  for(let c=0;c<3;c++)pixels.data[i+c]=light?base[c]-(255-tint[c])*lit*.5+grain*.3:base[c]+tint[c]*lit+grain;
  pixels.data[i+3]=255;
 }}
 context.putImageData(pixels,0,0);
}
