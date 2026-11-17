'use strict';
// Mints a short-lived OpenAI Realtime client secret so the renderer never sees the API key.
const ENDPOINT='https://api.openai.com/v1/realtime/client_secrets';
const NO_KEY='Add an OpenAI API key in Settings, Providers, to use voice.';
const {INSTRUCTIONS}=require('./voice-prompts.cjs');
// background_agent and remain_silent follow codex-rs/codex-api/.../methods_v2.rs (Apache-2.0, modified; see docs/voice-attribution.md).
const TOOLS=[
  {type:'function',name:'background_agent',description:'Send a user request to the background agent. Use this as the default action. Do not rephrase the user\'s ask; pass along the user\'s own words. If the agent is idle, this starts a new task and returns the final result to the user. If the agent is already working, this sends the request as guidance to steer that task. If the user asks to do something next, later, or after this, call this tool so the work is queued instead of merely promised.',parameters:{type:'object',properties:{prompt:{type:'string',description:'The user request to delegate to the background agent.'}},required:['prompt'],additionalProperties:false}},
  {type:'function',name:'remain_silent',description:'Call this when the best response is to say nothing, for example after a hidden control message or when speaking would be distracting. It has no user-visible effect.',parameters:{type:'object',properties:{},additionalProperties:false}}
];

// assumed (not in the docs pages read): audio.input.noise_reduction {type:'near_field'} and turn_detection silence_duration_ms/interrupt_response/create_response; values from Codex methods_v2.rs.
function createVoiceSessions({getApiKey,fetchImpl=fetch,model='gpt-realtime-2.1',voice='marin'}){
  async function mint(){
    const key=await getApiKey();
    if(!key)throw new Error(NO_KEY);
    const body={expires_after:{anchor:'created_at',seconds:600},session:{type:'realtime',model,instructions:INSTRUCTIONS,tools:TOOLS,tool_choice:'auto',
      audio:{input:{transcription:{model:'gpt-4o-mini-transcribe'},noise_reduction:{type:'near_field'},turn_detection:{type:'server_vad',silence_duration_ms:500,interrupt_response:true,create_response:true}},output:{voice}}}};
    let res;
    try{res=await fetchImpl(ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});}
    catch{throw new Error('Could not reach OpenAI. Check your connection and try again.');}
    if(!res.ok)throw new Error(res.status===401||res.status===403?'OpenAI rejected the API key. Check it in Settings, Providers.':'OpenAI could not start a voice session. Try again in a moment.');
    let data;
    try{data=await res.json();}catch{data=null;}
    if(!data||typeof data.value!=='string'||!data.value)throw new Error('OpenAI could not start a voice session. Try again in a moment.');
    return {clientSecret:data.value,expiresAt:data.expires_at,model,voice};
  }
  return {mint};
}
module.exports={createVoiceSessions};
