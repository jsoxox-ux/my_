import test from 'node:test';
import assert from 'node:assert/strict';
import {createIndex,splitText} from '../web/retrieval.js';
import handler from '../api/chat.js';
test('Korean retrieval returns source and rejects unknown terms',()=>{
 const search=createIndex([...splitText('휴학 신청서는 교무처에 제출합니다.','학칙.txt','본문'),...splitText('장학금은 성적 우수자에게 지급합니다.','장학.txt','본문')]);
 assert.equal(search('휴학 신청')[0].source,'학칙.txt');assert.deepEqual(search('zzzzzz'),[]);
});
function res(){return {code:0,data:null,setHeader(){},status(n){this.code=n;return this;},json(v){this.data=v;return this;}};}
const valid={provider:'Claude',model:'claude-sonnet-4-6',key:'private-test-key',question:'휴학?',chunks:[{source:'학칙',location:'1페이지',text:'휴학 규정'}]};
test('API validates input before requesting provider',async()=>{const r=res();await handler({method:'POST',body:{...valid,chunks:[]}},r);assert.equal(r.code,400);});
for(const provider of ['Claude','Gemini'])test(`${provider} request and answer`,async(t)=>{
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.ok(url.startsWith('https://'));assert.ok(!options.body.includes(valid.key));assert.ok(options.body.includes('학칙'));return {ok:true,json:async()=>provider==='Claude'?{content:[{type:'text',text:'답변 [1]'}]}:{candidates:[{content:{parts:[{text:'답변 [1]'}]}}]}};});
 const r=res();await handler({method:'POST',body:{...valid,provider}},r);assert.equal(r.code,200);assert.equal(r.data.answer,'답변 [1]');
});
test('upstream errors never expose key or raw response',async(t)=>{t.mock.method(globalThis,'fetch',async()=>({ok:false,status:401}));const r=res();await handler({method:'POST',body:valid},r);assert.equal(r.code,401);assert.ok(!JSON.stringify(r.data).includes(valid.key));});
