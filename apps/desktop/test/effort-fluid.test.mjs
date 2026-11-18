import test from 'node:test';
import assert from 'node:assert/strict';

// Fake canvas: records the pixels the fluid paints. matchMedia/requestAnimationFrame are stubbed per test.
const makeCanvas=()=>{const c={clientWidth:120,clientHeight:16,dataset:{},isConnected:true,image:null,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:i=>{c.image=i;}})};return c;};
const load=async({reduced})=>{let raf=0;globalThis.matchMedia=()=>({matches:reduced});globalThis.requestAnimationFrame=()=>{raf++;return 0;};const m=await import('../src/effort-fluid.js');return {...m,raf:()=>raf};};
const mean=canvas=>{const d=canvas.image.data;let r=0,g=0,b=0,n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]){r+=d[i];g+=d[i+1];b+=d[i+2];n++;}assert.ok(n>100,'fluid painted pixels');return [r/n,g/n,b/n];};
const paint=async(provider)=>{const {createFluid}=await load({reduced:true});const canvas=makeCanvas();createFluid(canvas,{provider}).set(100);return {canvas,rgb:mean(canvas)};};

test('slider colour follows the provider; unknown is milky white',async()=>{
 const {providerTint}=await load({reduced:true});
 assert.equal(providerTint('mystery'),null);
 const ds=(await paint('deepseek')).rgb,an=(await paint('anthropic')).rgb,oa=(await paint('openai')).rgb,go=(await paint('google')).rgb,un=await paint('mystery');
 assert.ok(ds[1]>ds[0]*1.5&&ds[2]>ds[0]*1.5,'deepseek teal: green and blue above red');
 assert.ok(an[0]>an[1]&&an[1]>an[2]*1.3,'anthropic orange-tan: red > green > blue');
 assert.ok(oa[1]>oa[0]*1.2&&oa[1]>oa[2]*1.2,'openai green: green dominant');
 assert.ok(go[2]>go[0]*1.5&&go[2]>go[1]*1.3,'google blue: blue dominant');
 assert.equal(un.canvas.dataset.tint,'milky');
 assert.ok(Math.min(...un.rgb)>140&&Math.max(...un.rgb)-Math.min(...un.rgb)<30,'unknown: near-neutral light, milky white');
});

test('reduced motion: no animation loop, fill is set directly',async()=>{
 const reduced=await load({reduced:true});reduced.createFluid(makeCanvas(),{provider:'openai'}).set(80,{isTop:true,push:200});
 assert.equal(reduced.raf(),0,'no requestAnimationFrame under reduced motion');
});

test('full motion starts the animation loop',async()=>{
 const m=await load({reduced:false});m.createFluid(makeCanvas(),{provider:'openai'}).set(80);
 assert.ok(m.raf()>0);
});
