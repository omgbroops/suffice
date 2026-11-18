// Fluid fill for the effort slider: one canvas, ordered-dither shading in the wallpaper's style. Colour follows the provider.
const TINTS={deepseek:[38,166,154],anthropic:[217,138,82],openai:[64,168,112],google:[66,133,244],gemini:[66,133,244]};
const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
export const providerTint=p=>TINTS[String(p).toLowerCase()]||null; // null = unknown provider: milky white with a slow shine
export function createFluid(canvas,{provider}){
 const tint=providerTint(provider)||[236,238,244],milky=!providerTint(provider);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,context=canvas.getContext('2d');
 canvas.dataset.tint=milky?'milky':String(provider).toLowerCase();
 let W=0,H=0,image,level=0,velocity=0,target=0,wake=0,flow=0,flash=0,burst=0,time=0,last=0,top=false,sparks=[];
 const resize=()=>{const w=Math.round(canvas.clientWidth),h=Math.round(canvas.clientHeight);if(!w||!h||(w===W&&h===H))return;W=canvas.width=w;H=canvas.height=h;image=context.createImageData(W,H);};
 // px: thumb centre in canvas px; isTop: highest tier (streams right fast, impact flash on arrival); push: signed drag speed.
 function set(px,{isTop=false,push=0}={}){resize();const rising=px>target;target=px;wake=Math.min(1,wake+Math.abs(push)/40);if(reduced){level=px;draw();return;}if(isTop&&rising){top=true;burst=1;}else if(!isTop)top=false;if(!last)loop();}
 function frame(now){
  const dt=Math.min(.05,(now-last)/1000||.016);last=now;time+=dt;
  const stiff=top?900:180,damp=top?38:19;velocity+=((target-level)*stiff-velocity*damp)*dt;level+=velocity*dt;
  wake*=Math.pow(.02,dt);burst=Math.max(0,burst-dt*1.6);flow+=dt*(milky?10:30)*(1+burst*7);
  if(top&&Math.abs(target-level)<1.5&&Math.abs(velocity)<60&&!flash){flash=1;top=false;} flash=Math.max(0,flash-dt*4);
  if(level>12&&Math.random()<.07&&!milky||level>12&&milky&&Math.random()<.03)sparks.push({x:Math.random()*level,y:Math.floor(Math.random()*H),age:0});
  draw();
 }
 function draw(){
  resize();if(!image)return;const d=image.data,amp=1.5+wake*5+Math.min(4,Math.abs(velocity)/160);
  for(let y=0;y<H;y++){const edge=level+Math.sin(y*.5+time*5)*amp*(.4+wake)+Math.sin(y*.21-time*3)*amp*.5;
   for(let x=0;x<W;x++){const i=(y*W+x)*4;if(x>edge){d[i+3]=0;continue;}
    const w=Math.sin(x*.09-flow*.35+y*.3)*.5+.5,w2=Math.sin(x*.035+time*.7+y*.1)*.5+.5,front=Math.max(0,1-(edge-x)/18);
    let lum=.5+.22*w+.14*w2+front*.3;
    if(milky){const sweep=((time*.12)%1.6-.3)*W,s=Math.max(0,1-Math.abs(x+y*2-sweep)/46);lum=.62+.1*w+s*.35;}
    lum+=flash*Math.max(0,1-(W-x)/40)*.9;
    const q=Math.max(0,Math.min(1,lum+(bayer[(y&3)*4+(x&3)]/16-.5)*.3)),m=q<.36?.55:q<.62?.78:1;
    d[i]=Math.min(255,tint[0]*m+flash*80);d[i+1]=Math.min(255,tint[1]*m+flash*80);d[i+2]=Math.min(255,tint[2]*m+flash*80);d[i+3]=255;}}
  for(const s of sparks){s.age+=.05;const a=Math.sin(Math.min(1,s.age)*Math.PI);if(a<=0||s.x>level)continue;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const x=Math.floor(s.x)+dx,y=s.y+dy;if(x<W&&y<H){const i=(y*W+x)*4;d[i]=d[i+1]=d[i+2]=Math.min(255,150+a*105);d[i+3]=255;}}}
  sparks=sparks.filter(s=>s.age<1);context.putImageData(image,0,0);
 }
 function loop(){last=performance.now();const tick=now=>{if(!canvas.isConnected){last=0;return;}frame(now);requestAnimationFrame(tick);};requestAnimationFrame(tick);}
 return {set};
}
