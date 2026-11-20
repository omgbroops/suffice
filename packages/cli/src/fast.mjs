// Fast-mode primitives for the product session. Each piece is opt-in via
// options.speed==='fast'; none change default behavior.
export const FAST_TIER='ultrafast';
export const VALID_TIERS=['ultrafast','priority','default','auto','flex','scale'];

// Rewrites each provider request payload to set service_tier. pi-ai already
// forwards options.serviceTier on the OpenAI Responses/Codex-Responses paths
// and applies tier cost multipliers; the coding-agent layer just never sets
// it, so we inject it at the payload level here.
export function serviceTierExtension({tier=FAST_TIER,log=()=>{}}={}) {
  if(!VALID_TIERS.includes(tier)) throw new Error(`Unknown service tier: ${tier}`);
  return pi=>{
    pi.on('before_provider_request',event=>{
      if(!event?.payload||typeof event.payload!=='object'||Array.isArray(event.payload))return;
      if('service_tier' in event.payload)return;
      log({type:'service_tier',tier,model:event.payload.model});
      return {...event.payload,service_tier:tier};
    });
  };
}

// Per-turn wall-clock breakdown: provider wait (request -> first stream event),
// provider total (request -> response), and per-tool duration. Emits
// `latency` log events so fast-mode effects are measurable.
export function latencyTracker(log=()=>{}) {
  const now=()=>performance.now();
  return pi=>{
    const requests=[];
    const toolStarts=new Map();
    pi.on('before_provider_request',()=>{requests.push({at:now(),ttft:null});});
    pi.on('provider_stream_event',()=>{const r=requests.at(-1);if(r&&r.ttft===null)r.ttft=now();});
    pi.on('after_provider_response',()=>{
      const r=requests.shift();if(!r)return;
      log({type:'latency',phase:'provider',ttftMs:r.ttft===null?null:Math.round(r.ttft-r.at),totalMs:Math.round(now()-r.at)});
    });
    pi.on('tool_call',event=>{if(event.toolCallId)toolStarts.set(event.toolCallId,now());});
    pi.on('tool_result',event=>{
      const id=event.callId,start=id&&toolStarts.get(id);if(start===undefined)return;
      toolStarts.delete(id);
      log({type:'latency',phase:'tool',name:event.toolName,callId:id,ms:Math.round(now()-start)});
    });
  };
}

// Settings deltas for speed mode: websocket-cached transport reuses a
// persistent connection and sends only new input items per turn
// (previousResponseId/delta requests), and a shorter retry base delay.
export const fastModeSettings=enabled=>enabled?{
  transport:'websocket-cached',
  cacheWarming:'on',
  retry:{enabled:true,maxRetries:1,baseDelayMs:1000,maxAgentDelayMs:15000,provider:{maxRetries:0}},
}:{};
