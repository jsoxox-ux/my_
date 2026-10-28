export function splitText(text, source, location) {
  const chunks=[];
  for(let start=0; start<text.length; start+=1000){
    const part=text.slice(start,start+1200).trim();
    if(part) chunks.push({source,location:`${location} · 조각 ${chunks.length+1}`,text:part});
    if(start+1200>=text.length) break;
  }
  return chunks;
}
function grams(text){
  text=text.toLowerCase().replace(/\s+/g,' ');
  const result=new Map();
  for(let n=2;n<=4;n++) for(let i=0;i<=text.length-n;i++){
    const g=text.slice(i,i+n);result.set(g,(result.get(g)||0)+1);
  }
  return result;
}
export function createIndex(chunks){
  const vectors=chunks.map(c=>grams(c.text));const df=new Map();
  for(const vector of vectors) for(const g of vector.keys()) df.set(g,(df.get(g)||0)+1);
  const idf=new Map([...df].map(([g,n])=>[g,Math.log((1+chunks.length)/(1+n))+1]));
  function weighted(raw){let norm=0;const v=new Map();for(const [g,f] of raw){if(!idf.has(g))continue;const w=(1+Math.log(f))*idf.get(g);v.set(g,w);norm+=w*w;}return {v,norm:Math.sqrt(norm)};}
  const weightedDocs=vectors.map(weighted);
  return query=>{
    const q=weighted(grams(query));
    if(!q.norm)return [];
    return weightedDocs.map((d,i)=>{let dot=0;for(const [g,w] of q.v)dot+=w*(d.v.get(g)||0);return {...chunks[i],score:d.norm?dot/(d.norm*q.norm):0};}).filter(c=>c.score>=.04).sort((a,b)=>b.score-a.score).slice(0,5);
  };
}
