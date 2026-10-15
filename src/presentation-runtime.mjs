import {createRuntime} from './runtime.mjs';

// Use the existing canonical Suffice credential store with the SDK's atomic
// locking/refresh persistence. An in-memory snapshot can lose rotated tokens.
// No credentials are copied into experiment artifacts or event logs.
export async function createPresentationRuntime(){
 const runtime=await createRuntime();
 if(!runtime.getModel('openai','gpt-6.1-sol')||!runtime.isUsingSubscription('openai'))throw new Error('Sol subscription login required; no billing/model fallback');
 // Resolve/refresh authentication before allocating any scored attempt. The
 // returned secret stays local and is never logged or returned to actor tools.
 const auth=await runtime.getAuth('openai');
 if(!auth||!runtime.isUsingSubscription('openai'))throw new Error('Subscription authentication preflight failed');
 return runtime;
}
