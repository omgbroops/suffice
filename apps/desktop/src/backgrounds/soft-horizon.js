import {observeBackgroundResize} from './resize.js';
// Theme-specific atmospheres share a soft horizon and stable grain without shimmer.
export function mountSoftHorizon(canvas){
 const host=canvas.parentElement,context=canvas.getContext('2d',{alpha:false});let frame,drawnTheme;
 const bell=(distance,spread)=>Math.exp(-distance*distance/(2*spread*spread));
 function draw(){
  const width=Math.max(1,Math.ceil(host.clientWidth/1.25)),height=Math.max(1,Math.ceil(host.clientHeight/1.25));
  const light=document.documentElement.dataset.theme==='light';
  if(canvas.width===width&&canvas.height===height&&drawnTheme===light)return;
  canvas.width=width;canvas.height=height;canvas.style.imageRendering='auto';
  const image=context.createImageData(width,height);let seed=48123;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296-.5;};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const u=x/width,v=y/height,horizon=.435-.04*u+.012*Math.sin(u*4.4);
   const sky=bell(v-horizon+.035,.058),warm=bell(v-horizon-.045,.062)*(.18+.82*bell(u-.76,.42)),rim=bell(v-horizon-.004,.024)*bell(u-.76,.32);
   const dusk=bell(v-horizon-.15,.095)*bell(u-.56,.38),grain=noise()*7,shade=1-.18*Math.pow(Math.abs(u-.5)*2,2),i=(y*width+x)*4;
   image.data[i]=(7+sky*91+warm*143+rim*33+dusk*15+grain)*shade;
   image.data[i+1]=(12+sky*106+warm*85+rim*27+dusk*4+grain)*shade;
   image.data[i+2]=(23+sky*119+warm*39+rim*19+dusk*5+grain)*shade;
   if(light){
    image.data[i]=230+v*12-sky*45+warm*18+rim*7+grain*.38;
    image.data[i+1]=238-sky*22-warm*26+rim*6+grain*.38;
    image.data[i+2]=250-v*5-warm*50+rim*5+grain*.38;
   }
   image.data[i+3]=255;
  }
  context.putImageData(image,0,0);drawnTheme=light;
 }
 const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);};
 const observer=observeBackgroundResize(host,schedule),themeObserver=new MutationObserver(schedule);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});draw();
 return ()=>{observer.disconnect();themeObserver.disconnect();cancelAnimationFrame(frame);canvas.style.removeProperty('image-rendering');};
}
