import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const todayStr = new Date().toISOString().slice(0, 10);
const baseUrl = process.env.ANTHROPIC_BASE_URL, authToken = process.env.ANTHROPIC_AUTH_TOKEN;

/* ---- geo helper (mirrors src/lib/events.ts deriveGeo) ---- */
const CITY_TABLE = [
  { m:["san francisco","sf bay","bay area"], city:"San Francisco", macro:"North America" },{ m:["santa clara"],city:"Santa Clara",macro:"North America"},{ m:["san jose"],city:"San Jose",macro:"North America"},{ m:["oakland"],city:"Oakland",macro:"North America"},{ m:["palo alto"],city:"Palo Alto",macro:"North America"},{ m:["mountain view"],city:"Mountain View",macro:"North America"},{ m:["sunnyvale"],city:"Sunnyvale",macro:"North America"},{ m:["silicon valley"],city:"Silicon Valley",macro:"North America"},{ m:["berkeley"],city:"Berkeley",macro:"North America"},{ m:["menlo park"],city:"Menlo Park",macro:"North America"},{ m:["cupertino"],city:"Cupertino",macro:"North America"},
  { m:["austin","sxsw"],city:"Austin",macro:"North America"},{ m:["dallas"],city:"Dallas",macro:"North America"},{ m:["houston"],city:"Houston",macro:"North America"},{ m:["denver"],city:"Denver",macro:"North America"},{ m:["nashville"],city:"Nashville",macro:"North America"},{ m:["atlanta"],city:"Atlanta",macro:"North America"},{ m:["charlotte"],city:"Charlotte",macro:"North America"},{ m:["raleigh"],city:"Raleigh",macro:"North America"},{ m:["las vegas"],city:"Las Vegas",macro:"North America"},{ m:["orlando"],city:"Orlando",macro:"North America"},{ m:["salt lake"],city:"Salt Lake City",macro:"North America"},{ m:["new york","nyc"],city:"New York",macro:"North America"},{ m:["boston"],city:"Boston",macro:"North America"},{ m:["seattle"],city:"Seattle",macro:"North America"},{ m:["chicago"],city:"Chicago",macro:"North America"},{ m:["san diego"],city:"San Diego",macro:"North America"},{ m:["phoenix"],city:"Phoenix",macro:"North America"},{ m:["toronto"],city:"Toronto",macro:"North America"},
  { m:["london"],city:"London",macro:"UK"},{ m:["edinburgh"],city:"Edinburgh",macro:"UK"},{ m:["manchester"],city:"Manchester",macro:"UK"},{ m:["birmingham"],city:"Birmingham",macro:"UK"},{ m:["bristol"],city:"Bristol",macro:"UK"},{ m:["glasgow"],city:"Glasgow",macro:"UK"},{ m:["cambridge, uk","oxford"],city:"Cambridge",macro:"UK"},
  { m:["amsterdam"],city:"Amsterdam",macro:"Europe"},{ m:["the hague","den haag"],city:"The Hague",macro:"Europe"},{ m:["rotterdam"],city:"Rotterdam",macro:"Europe"},{ m:["utrecht"],city:"Utrecht",macro:"Europe"},{ m:["eindhoven"],city:"Eindhoven",macro:"Europe"},{ m:["brussels"],city:"Brussels",macro:"Europe"},{ m:["berlin"],city:"Berlin",macro:"Europe"},{ m:["munich"],city:"Munich",macro:"Europe"},{ m:["cologne"],city:"Cologne",macro:"Europe"},{ m:["frankfurt"],city:"Frankfurt",macro:"Europe"},{ m:["hamburg"],city:"Hamburg",macro:"Europe"},{ m:["luxembourg"],city:"Luxembourg",macro:"Europe"},{ m:["paris"],city:"Paris",macro:"Europe"},{ m:["stockholm"],city:"Stockholm",macro:"Europe"},{ m:["copenhagen"],city:"Copenhagen",macro:"Europe"},{ m:["helsinki"],city:"Helsinki",macro:"Europe"},{ m:["oslo"],city:"Oslo",macro:"Europe"},{ m:["zurich"],city:"Zurich",macro:"Europe"},{ m:["geneva"],city:"Geneva",macro:"Europe"},{ m:["vienna"],city:"Vienna",macro:"Europe"},{ m:["milan"],city:"Milan",macro:"Europe"},{ m:["madrid"],city:"Madrid",macro:"Europe"},{ m:["barcelona"],city:"Barcelona",macro:"Europe"},{ m:["lisbon"],city:"Lisbon",macro:"Europe"},{ m:["dublin"],city:"Dublin",macro:"Europe"},{ m:["prague"],city:"Prague",macro:"Europe"},
  { m:["dubai"],city:"Dubai",macro:"Middle East"},{ m:["singapore"],city:"Singapore",macro:"Asia Pacific"},
];
function deriveGeo({ location, region, title, isOnline, type }) {
  const hay=` ${location??""} ${region??""} ${title??""} `.toLowerCase();
  for(const r of CITY_TABLE) if(r.m.some(w=>hay.includes(w))) return {city:r.city,macroRegion:r.macro};
  const has=(...ws)=>ws.some(w=>hay.includes(w));
  if(has("netherlands"))return{city:null,macroRegion:"Europe"};
  if(has("united kingdom","england","scotland","wales")||/\buk\b/.test(hay))return{city:null,macroRegion:"UK"};
  if(has("united states"," usa","u.s.a"))return{city:null,macroRegion:"North America"};
  if(has("canada"))return{city:null,macroRegion:"North America"};
  if(has("uae","united arab","qatar","saudi"))return{city:null,macroRegion:"Middle East"};
  if(has("south africa","morocco","kenya","nigeria","egypt"))return{city:null,macroRegion:"Africa"};
  if(has("singapore","australia","japan"," india","china","hong kong","korea","asia"))return{city:null,macroRegion:"Asia Pacific"};
  if(has("belgium","germany","france","spain","italy","portugal","ireland","sweden","denmark","norway","finland","switzerland","austria","poland","czech","luxembourg","greece","malta","lithuania","nordic","europe"))return{city:null,macroRegion:"Europe"};
  if(isOnline||type==="PODCAST"||type==="WEBINAR")return{city:null,macroRegion:"Online"};
  return{city:null,macroRegion:"Other"};
}

const PROFILE = `Irmak Eyiceoglu — EMEA Partner Manager at Coder (AI devtools / self-hosted cloud development environments). First-time speaker building a track record. Topics: Sovereign AI, practical AI for non-technical founders/entrepreneurs, AI literacy, developer productivity, platform engineering. She SPEAKS at meetups/podcasts/workshops/small summits/founder & Women-in-AI communities; PARTICIPATES in Coder-relevant developer/enterprise/partner events; ATTENDS analyst events (Gartner/IDC/Forrester).`;

const GEOS = [
  { name:"Amsterdam / Netherlands", hint:"Amsterdam, Rotterdam, Utrecht, The Hague, Eindhoven and the wider Netherlands" },
  { name:"London / UK", hint:"London and the wider UK — Manchester, Edinburgh, Bristol, Cambridge" },
  { name:"Rest of Europe", hint:"Belgium (Brussels), Germany (Berlin, Munich, Cologne), France (Paris), Luxembourg, and the Nordics (Stockholm, Copenhagen, Helsinki, Oslo)" },
  { name:"Austin, Texas", hint:"Austin and central Texas" },
  { name:"San Francisco Bay Area", hint:"San Francisco, Silicon Valley, San Jose, Santa Clara, Oakland, Palo Alto" },
  { name:"Online / Global", hint:"virtual / online events, webinars and podcasts accessible from European and US timezones" },
];
const SLICES = [
  { key:"AI & developer conferences/summits", focus:"major AI and developer CONFERENCES and summits (2026-2027) with open CFPs or community/lightning tracks where possible" },
  { key:"AI founder/entrepreneur meetups & communities", focus:"recurring AI and founder/entrepreneur MEETUPS and communities on meetup.com, Luma (lu.ma), Loop and Eventbrite — include named communities, hackathons and demo nights" },
  { key:"AI podcasts, webinars & AI-literacy workshops", focus:"PODCASTS seeking AI founder/practitioner guests, online WEBINARS (including BrightTALK sessions relevant to Coder or hosted by partners), and practical AI / AI-literacy WORKSHOPS for non-technical founders" },
  { key:"Women in Tech / Women in AI", focus:"Women-in-Tech and Women-in-AI communities, meetups, podcasts (guest slots), summits and awards — prefer open speaker/guest tracks" },
  { key:"Devtools, platform-eng, enterprise/analyst & startup/VC", focus:"developer-productivity / platform-engineering / DevOps / Kubernetes / internal-developer-platform events (Coder-relevant, PARTICIPATE); analyst events (Gartner, IDC, Forrester); and startup / VC / accelerator / demo-day events" },
];

function extract(text){ const ms=text.match(/\[[\s\S]*\]/g)||[]; for(const m of ms.sort((a,b)=>b.length-a.length)){try{const p=JSON.parse(m);if(Array.isArray(p))return p;}catch{}} return []; }

async function call(geo, slice){
  const prompt=`Today is ${todayStr}.

${PROFILE}

GEOGRAPHY: ${geo.name} — ${geo.hint}.
FOCUS: ${slice.focus}

Do 9-10 DISTINCT web searches for the FOCUS within the GEOGRAPHY. Only real events with findable URLs. Only include events dated AFTER ${todayStr} (or null date for genuinely recurring meetups/podcasts). Return a STRICT JSON array — nothing else. Each object:
{ "title","type":"CONFERENCE|MEETUP|EVENT|PODCAST|WEBINAR","startDate":"YYYY-MM-DD or null","location":"City, Country or null","isOnline":true/false,"url":"direct URL or null","cfpDeadline":"YYYY-MM-DD or null","description":"1-2 sentences","coderRelevant":true/false,"audienceDescription":"or null","ticketCost":"e.g. Free, ~€1,995, From €99, Invite only, or null","howToApply":"CFP/registration URL or brief","industry":"short label","relevancyScore":0-100,"relevancyRationale":"1 sentence","suggestedAction":"ATTEND|APPLY_TO_SPEAK|BOTH","category":"ATTEND|PARTICIPATE|SPEAK","audienceSignals":["DEVELOPERS"|"ENGINEERS"|"CUSTOMERS"|"ENTREPRENEURS"|"SMBS"|"PROFESSIONALS"|"WOMEN_IN_TECH"|"PARTNERS"],"applyUrl":"or null" }
Exclude industry-vertical events (healthcare, banking/fintech, insurance, legal, retail, manufacturing, energy, telecom, government/defense, edtech, automotive, real estate, agriculture, hospitality, logistics) unless Coder-relevant or partner-hosted. Aim for 18+ distinct real events.`;
  const res=await fetch(`${baseUrl}/v1/messages`,{method:"POST",headers:{"Content-Type":"application/json","anthropic-version":"2023-06-01","anthropic-beta":"web-search-2025-03-05",Authorization:`Bearer ${authToken}`,"x-api-key":authToken},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:20000,tools:[{type:"web_search_20250305",name:"web_search",max_uses:10}],messages:[{role:"user",content:prompt}]})});
  if(!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0,120)}`);
  const data=await res.json();
  return extract(data.content.filter(b=>b.type==="text").map(b=>b.text??"").join("\n"));
}

const existing=await db.event.findMany({select:{title:true,url:true}});
const titles=new Set(existing.map(e=>e.title.toLowerCase()));
const urls=new Set(existing.filter(e=>e.url).map(e=>e.url.toLowerCase()));
const todayMid=new Date(); todayMid.setHours(0,0,0,0);
const vType=["CONFERENCE","MEETUP","EVENT","PODCAST","WEBINAR"],vAct=["ATTEND","APPLY_TO_SPEAK","BOTH"],vCat=["ATTEND","PARTICIPATE","SPEAK"],vSig=["DEVELOPERS","ENGINEERS","CUSTOMERS","ENTREPRENEURS","SMBS","PROFESSIONALS","WOMEN_IN_TECH","PARTNERS"];

let grand=0, pass=0; const total=GEOS.length*SLICES.length;
for(const geo of GEOS){ for(const slice of SLICES){
  pass++;
  let arr=[]; let err="";
  for(let a=0;a<2 && arr.length===0;a++){ try{ arr=await call(geo,slice);}catch(e){ err=String(e).slice(0,80); await new Promise(r=>setTimeout(r,3000)); } }
  let ins=0;
  for(const ev of arr){
    if(!ev.title||!vType.includes(ev.type))continue;
    if(titles.has(ev.title.toLowerCase()))continue;
    if(ev.url&&urls.has(ev.url.toLowerCase()))continue;
    if(ev.startDate&&new Date(ev.startDate)<todayMid)continue;
    const g=deriveGeo({location:ev.location,region:ev.region,title:ev.title,isOnline:ev.isOnline,type:ev.type});
    const category=vCat.includes(ev.category)?ev.category:null;
    const action=vAct.includes(ev.suggestedAction)?ev.suggestedAction:null;
    const score=ev.relevancyScore!=null?Math.min(100,Math.max(0,Number(ev.relevancyScore))):null;
    const sig=Array.isArray(ev.audienceSignals)?[...new Set(ev.audienceSignals.map(s=>String(s).toUpperCase().replace(/[\s-]+/g,"_")).filter(s=>vSig.includes(s)))]:[];
    await db.event.create({data:{title:ev.title,type:ev.type,startDate:ev.startDate?new Date(ev.startDate):null,location:ev.location??null,isOnline:ev.isOnline??false,region:g.macroRegion,city:g.city,url:ev.url??null,cfpDeadline:ev.cfpDeadline?new Date(ev.cfpDeadline):null,description:ev.description??null,coderRelevant:!!ev.coderRelevant,status:"DISCOVERED",sourceNote:`Deep research: ${geo.name} — ${slice.key} — ${new Date().toDateString()}`,audienceDescription:ev.audienceDescription??null,ticketCost:ev.ticketCost??null,howToApply:ev.howToApply??null,suggestedAction:action,category,audienceSignals:sig.length?JSON.stringify(sig):null,industry:ev.industry??null,relevancyScore:score,relevancyRationale:ev.relevancyRationale??null,applyUrl:ev.applyUrl??ev.url??null}});
    titles.add(ev.title.toLowerCase()); if(ev.url)urls.add(ev.url.toLowerCase()); ins++; grand++;
  }
  console.log(`[${pass}/${total}] ${geo.name} | ${slice.key}: candidates=${arr.length} inserted=${ins}${err?" (err:"+err+")":""} | grand=${grand}`);
}}
console.log("DEEP RESEARCH DONE. total inserted:", grand);
await db.$disconnect();
