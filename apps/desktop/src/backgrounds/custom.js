import {readWallpaper} from '../wallpaper-store.js';
import {observeBackgroundResize} from './resize.js';
export const wallpaperEffects=['None','Dither','ASCII','Halftone','Scanlines'];
export function wallpaperBounds(image,width,height,frame={}){const scale=Math.max(width/image.width,height/image.height)*Math.max(1,Math.min(3,Number(frame.zoom)||1)),w=image.width*scale,h=image.height*scale;return {x:(width-w)*Math.max(0,Math.min(1,frame.x??.5)),y:(height-h)*Math.max(0,Math.min(1,frame.y??.5)),width:w,height:h};}
export function drawWallpaper(context,image,width,height,config={},light=false){
 const base=light?'#f5f6f8':'#0d0e10';context.fillStyle=base;context.fillRect(0,0,width,height);if(!image)return;const box=wallpaperBounds(image,width,height,config.frame);context.imageSmoothingEnabled=true;context.drawImage(image,box.x,box.y,box.width,box.height);const effect=config.effect;
 if(effect==='Scanlines'){context.fillStyle='#00000026';for(let y=0;y<height;y+=4)context.fillRect(0,y,width,1);return;}
 if(!['Dither','ASCII','Halftone'].includes(effect))return;
 const pitch=effect==='Dither'?3:effect==='ASCII'?9:8,sample=document.createElement('canvas');sample.width=Math.ceil(width/pitch);sample.height=Math.ceil(height/pitch);const sampled=sample.getContext('2d',{willReadFrequently:true});sampled.drawImage(context.canvas,0,0,sample.width,sample.height);const pixels=sampled.getImageData(0,0,sample.width,sample.height),data=pixels.data;
 if(effect==='Dither'){const matrix=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x++){const i=(y*sample.width+x)*4,n=(matrix[y%4*4+x%4]/16-.5)*42;for(let c=0;c<3;c++)data[i+c]=Math.round((data[i+c]+n)/51)*51;}sampled.putImageData(pixels,0,0);context.imageSmoothingEnabled=false;context.drawImage(sample,0,0,width,height);return;}
 context.fillStyle=base;context.fillRect(0,0,width,height);context.textBaseline='top';context.font=`${pitch+1}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono')||'monospace'}`;const glyphs=' .:-=+*#%@';
 for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x++){const i=(y*sample.width+x)*4,r=data[i],g=data[i+1],b=data[i+2],luma=(r*.2126+g*.7152+b*.0722)/255;context.fillStyle=`rgb(${r},${g},${b})`;if(effect==='ASCII')context.fillText(glyphs[Math.round((light?1-luma:luma)*9)],x*pitch,y*pitch);else{context.beginPath();context.arc(x*pitch+pitch/2,y*pitch+pitch/2,Math.sqrt(light?1-luma:luma)*pitch*.48,0,Math.PI*2);context.fill();}}
}
export function mountCustomBackground(canvas){
 const host=canvas.parentElement,context=canvas.getContext('2d',{alpha:false});let image,config={},frame,revision=0,disposed=false;canvas.style.imageRendering='auto';
 function draw(){canvas.width=Math.max(1,Math.ceil(host.clientWidth));canvas.height=Math.max(1,Math.ceil(host.clientHeight));drawWallpaper(context,image,canvas.width,canvas.height,config,document.documentElement.dataset.theme==='light');}
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);};
 async function load(){const version=++revision;try{const next=await readWallpaper(),bitmap=next.image?await createImageBitmap(next.image):null;if(disposed||version!==revision){bitmap?.close();return;}image?.close();image=bitmap;config=next;schedule();}catch{if(!disposed)schedule();}}
 const size=observeBackgroundResize(host,schedule),theme=new MutationObserver(schedule);theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});document.addEventListener('suffice-wallpaper',load);draw();void load();
 return ()=>{disposed=true;revision++;size.disconnect();theme.disconnect();document.removeEventListener('suffice-wallpaper',load);cancelAnimationFrame(frame);image?.close();canvas.style.removeProperty('image-rendering');};
}
