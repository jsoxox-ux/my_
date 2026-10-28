import './style.css';
import * as pdfjs from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser.js';
import {createIndex,splitText} from './retrieval.js';
pdfjs.GlobalWorkerOptions.workerSrc=worker;
const $=id=>document.getElementById(id);
let search=null,busy=false;
$('provider').onchange=()=>{$('model').value=$('provider').value==='Claude'?'claude-sonnet-4-6':'gemini-2.5-flash';$('key').value='';};
$('clear').onclick=()=>{$('messages').replaceChildren();};
function message(text,kind='assistant',sources=[]){
  $('messages').querySelector('.empty')?.remove();
  const box=document.createElement('article');box.className=`message ${kind}`;box.textContent=text;
  if(sources.length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='검색 근거 확인';details.append(summary);sources.forEach((c,i)=>{const title=document.createElement('strong');title.textContent=`[${i+1}] ${c.source} — ${c.location}`;const pre=document.createElement('pre');pre.textContent=c.text;details.append(title,pre);});box.append(details);}
  $('messages').append(box);return box;
}
function setBusy(value){busy=value;for(const id of ['send','folder','files','clear'])$(id).disabled=value;}
async function load(event){
  if(busy)return;
  const files=[...event.target.files].filter(f=>/\.(pdf|docx|txt|md)$/i.test(f.name));
  if(!files.length){$('status').textContent='지원하는 파일을 선택하세요.';return;}
  if(files.length>200||files.reduce((n,f)=>n+f.size,0)>100*1024*1024){$('status').textContent='최대 200개, 총 100MB까지 선택할 수 있습니다.';return;}
  setBusy(true);$('warnings').replaceChildren();const chunks=[];let count=0;
  try{
    for(const file of files){
      $('status').textContent=`읽는 중: ${file.name}`;
      try{
        if(file.size>25*1024*1024)throw new Error('파일당 25MB 제한 초과');
        const source=(file.webkitRelativePath||file.name).slice(0,500);const data=await file.arrayBuffer();let parts=[];
        if(/\.pdf$/i.test(file.name)){
          const pdf=await pdfjs.getDocument({data,isEvalSupported:false}).promise;
          try{for(let page=1;page<=pdf.numPages;page++){const content=await(await pdf.getPage(page)).getTextContent();parts.push(...splitText(content.items.map(i=>i.str||'').join(' '),source,`${page}페이지`));}}finally{await pdf.destroy();}
        }else if(/\.docx$/i.test(file.name)){
          parts=splitText((await mammoth.extractRawText({arrayBuffer:data})).value,source,'문서 본문');
        }else{
          let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(data);}catch{text=new TextDecoder('euc-kr').decode(data);}parts=splitText(text,source,'문서 본문');
        }
        if(!parts.length)throw new Error('추출 가능한 텍스트 없음 · 스캔 PDF는 OCR 필요');
        if(chunks.length+parts.length>10000)throw new Error('전체 10,000개 발췌 제한 초과');
        chunks.push(...parts);count++;
      }catch(error){const line=document.createElement('div');line.textContent=`${file.name}: ${error.message}`;$('warnings').append(line);}
    }
    search=chunks.length?createIndex(chunks):null;$('messages').replaceChildren();
    $('status').textContent=`${count}개 파일 · ${chunks.length}개 발췌 준비 완료`;
  }catch{$('status').textContent='자료 처리에 실패했습니다. 파일 수를 줄여 다시 선택하세요.';search=null;}
  finally{setBusy(false);event.target.value='';}
}
$('folder').onchange=load;$('files').onchange=load;
$('question-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  if(!search){message('규정 폴더 또는 파일을 먼저 선택하세요.','error');return;}
  const key=$('key').value.trim(),question=$('question').value.trim();
  if(!key){message('API 키를 입력하세요.','error');return;}if(!question)return;
  const chunks=search(question);message(question,'user');
  if(!chunks.length){message('규정에서 관련 근거를 찾지 못했습니다. 규정에 쓰인 용어로 다시 질문하세요.');return;}
  const waiting=message('규정 근거를 확인하고 있습니다…');setBusy(true);
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:$('provider').value,model:$('model').value.trim(),key,question,chunks}),signal:AbortSignal.timeout(60000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'요청에 실패했습니다.');
    waiting.remove();message(data.answer,'assistant',chunks);$('question').value='';
  }catch(error){waiting.remove();message(error.name==='TimeoutError'?'응답 시간이 초과되었습니다. 다시 시도하세요.':error.message,'error');}
  finally{setBusy(false);}
};
