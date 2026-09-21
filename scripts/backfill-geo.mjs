import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const CITY_TABLE = [
  { m: ["san francisco","sf bay","bay area"], city:"San Francisco", macro:"North America" },
  { m:["santa clara"], city:"Santa Clara", macro:"North America" },
  { m:["san jose"], city:"San Jose", macro:"North America" },
  { m:["oakland"], city:"Oakland", macro:"North America" },
  { m:["palo alto"], city:"Palo Alto", macro:"North America" },
  { m:["mountain view"], city:"Mountain View", macro:"North America" },
  { m:["sunnyvale"], city:"Sunnyvale", macro:"North America" },
  { m:["silicon valley"], city:"Silicon Valley", macro:"North America" },
  { m:["berkeley"], city:"Berkeley", macro:"North America" },
  { m:["menlo park"], city:"Menlo Park", macro:"North America" },
  { m:["cupertino"], city:"Cupertino", macro:"North America" },
  { m:["austin","sxsw"], city:"Austin", macro:"North America" },
  { m:["dallas"], city:"Dallas", macro:"North America" },
  { m:["houston"], city:"Houston", macro:"North America" },
  { m:["denver"], city:"Denver", macro:"North America" },
  { m:["nashville"], city:"Nashville", macro:"North America" },
  { m:["atlanta"], city:"Atlanta", macro:"North America" },
  { m:["charlotte"], city:"Charlotte", macro:"North America" },
  { m:["raleigh"], city:"Raleigh", macro:"North America" },
  { m:["las vegas"], city:"Las Vegas", macro:"North America" },
  { m:["orlando"], city:"Orlando", macro:"North America" },
  { m:["salt lake"], city:"Salt Lake City", macro:"North America" },
  { m:["st. charles","saint charles"], city:"St. Charles", macro:"North America" },
  { m:["new york","nyc"], city:"New York", macro:"North America" },
  { m:["boston"], city:"Boston", macro:"North America" },
  { m:["seattle"], city:"Seattle", macro:"North America" },
  { m:["chicago"], city:"Chicago", macro:"North America" },
  { m:["san diego"], city:"San Diego", macro:"North America" },
  { m:["phoenix"], city:"Phoenix", macro:"North America" },
  { m:["anaheim"], city:"Anaheim", macro:"North America" },
  { m:["los angeles"], city:"Los Angeles", macro:"North America" },
  { m:["toronto"], city:"Toronto", macro:"North America" },
  { m:["vancouver"], city:"Vancouver", macro:"North America" },
  { m:["montreal"], city:"Montreal", macro:"North America" },
  { m:["london"], city:"London", macro:"UK" },
  { m:["edinburgh"], city:"Edinburgh", macro:"UK" },
  { m:["manchester"], city:"Manchester", macro:"UK" },
  { m:["birmingham"], city:"Birmingham", macro:"UK" },
  { m:["bristol"], city:"Bristol", macro:"UK" },
  { m:["glasgow"], city:"Glasgow", macro:"UK" },
  { m:["leeds"], city:"Leeds", macro:"UK" },
  { m:["amsterdam"], city:"Amsterdam", macro:"Europe" },
  { m:["the hague","den haag"], city:"The Hague", macro:"Europe" },
  { m:["rotterdam"], city:"Rotterdam", macro:"Europe" },
  { m:["utrecht"], city:"Utrecht", macro:"Europe" },
  { m:["eindhoven"], city:"Eindhoven", macro:"Europe" },
  { m:["brussels"], city:"Brussels", macro:"Europe" },
  { m:["berlin"], city:"Berlin", macro:"Europe" },
  { m:["munich"], city:"Munich", macro:"Europe" },
  { m:["cologne"], city:"Cologne", macro:"Europe" },
  { m:["frankfurt"], city:"Frankfurt", macro:"Europe" },
  { m:["hamburg"], city:"Hamburg", macro:"Europe" },
  { m:["luxembourg"], city:"Luxembourg", macro:"Europe" },
  { m:["paris"], city:"Paris", macro:"Europe" },
  { m:["stockholm"], city:"Stockholm", macro:"Europe" },
  { m:["copenhagen"], city:"Copenhagen", macro:"Europe" },
  { m:["helsinki"], city:"Helsinki", macro:"Europe" },
  { m:["oslo"], city:"Oslo", macro:"Europe" },
  { m:["zurich"], city:"Zurich", macro:"Europe" },
  { m:["geneva"], city:"Geneva", macro:"Europe" },
  { m:["vienna"], city:"Vienna", macro:"Europe" },
  { m:["milan"], city:"Milan", macro:"Europe" },
  { m:["rome"], city:"Rome", macro:"Europe" },
  { m:["madrid"], city:"Madrid", macro:"Europe" },
  { m:["barcelona"], city:"Barcelona", macro:"Europe" },
  { m:["lisbon"], city:"Lisbon", macro:"Europe" },
  { m:["dublin"], city:"Dublin", macro:"Europe" },
  { m:["prague"], city:"Prague", macro:"Europe" },
  { m:["krakow","kraków"], city:"Krakow", macro:"Europe" },
  { m:["warsaw"], city:"Warsaw", macro:"Europe" },
  { m:["vilnius"], city:"Vilnius", macro:"Europe" },
  { m:["valletta","st. julian","malta"], city:"Valletta", macro:"Europe" },
  { m:["athens"], city:"Athens", macro:"Europe" },
  { m:["dubai"], city:"Dubai", macro:"Middle East" },
  { m:["abu dhabi"], city:"Abu Dhabi", macro:"Middle East" },
  { m:["cape town"], city:"Cape Town", macro:"Africa" },
  { m:["marrakesh","marrakech"], city:"Marrakesh", macro:"Africa" },
  { m:["johannesburg"], city:"Johannesburg", macro:"Africa" },
  { m:["singapore"], city:"Singapore", macro:"Asia Pacific" },
  { m:["sydney"], city:"Sydney", macro:"Asia Pacific" },
  { m:["tokyo"], city:"Tokyo", macro:"Asia Pacific" },
  { m:["bangalore","bengaluru"], city:"Bangalore", macro:"Asia Pacific" },
];

function deriveGeo({ location, region, title, isOnline, type }) {
  const hay = ` ${location??""} ${region??""} ${title??""} `.toLowerCase();
  for (const r of CITY_TABLE) if (r.m.some(w=>hay.includes(w))) return { city:r.city, macroRegion:r.macro };
  const has=(...ws)=>ws.some(w=>hay.includes(w));
  if (has("netherlands")) return {city:null,macroRegion:"Europe"};
  if (has("united kingdom","england","scotland","wales")||/\buk\b/.test(hay)) return {city:null,macroRegion:"UK"};
  if (has("united states"," usa","u.s.a")) return {city:null,macroRegion:"North America"};
  if (has("canada")) return {city:null,macroRegion:"North America"};
  if (has("uae","united arab","qatar","saudi","riyadh","doha","bahrain","kuwait")) return {city:null,macroRegion:"Middle East"};
  if (has("south africa","morocco","kenya","nigeria","egypt")) return {city:null,macroRegion:"Africa"};
  if (has("singapore","australia","japan"," india","china","hong kong","korea","asia")) return {city:null,macroRegion:"Asia Pacific"};
  if (has("belgium","germany","france","spain","italy","portugal","ireland","sweden","denmark","norway","finland","switzerland","austria","poland","czech","luxembourg","greece","malta","lithuania","nordic","europe")) return {city:null,macroRegion:"Europe"};
  if (isOnline||type==="PODCAST"||type==="WEBINAR") return {city:null,macroRegion:"Online"};
  return {city:null,macroRegion:"Other"};
}

const evs = await db.event.findMany({ select:{id:true,title:true,location:true,region:true,isOnline:true,type:true} });
let changed=0;
for (const e of evs) {
  const g = deriveGeo(e);
  await db.event.update({ where:{id:e.id}, data:{ region:g.macroRegion, city:g.city } });
  changed++;
}
console.log("updated events:", changed);
const macro = await db.$queryRawUnsafe('SELECT region, count(*) c FROM "Event" GROUP BY region ORDER BY c DESC');
console.log("--- macro regions ---"); for (const r of macro) console.log("  ", r.region, ":", Number(r.c));
const cities = await db.$queryRawUnsafe('SELECT city, count(*) c FROM "Event" WHERE city IS NOT NULL GROUP BY city ORDER BY c DESC');
console.log("--- top cities ---"); for (const r of cities.slice(0,20)) console.log("  ", r.city, ":", Number(r.c));
const nocity = await db.event.count({ where:{ city:null } });
console.log("events with no city:", nocity);
await db.$disconnect();
