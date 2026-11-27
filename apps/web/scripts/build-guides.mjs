import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
const dist=resolve('dist')
const guides=JSON.parse(await readFile(new URL('../src/features/guides/guides.json',import.meta.url),'utf8'))
const shell=await readFile(resolve(dist,'index.html'),'utf8')
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
const raw=process.env.VITE_SITE_ORIGIN||''
let origin=''
if(raw){
  const u=new URL(raw)
  if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('VITE_SITE_ORIGIN must be an HTTPS origin without a path')
  origin=u.origin
}
const links=guides.map(g=>'<li><a href="'+escape(g.path)+'">'+escape(g.title)+'</a></li>').join('')
for(const guide of guides){
  const title=escape(guide.title+' | Formshift')
  const description=escape(guide.description)
  const fallback='<main class="app-shell"><h1>'+escape(guide.title)+'</h1><p>'+description+'</p><p>Enable JavaScript to use the interactive converter.</p><h2>'+escape(guide.heading)+'</h2><p>'+escape(guide.body)+'</p><h2>Before using the result</h2><p>'+escape(guide.check)+'</p><p><a href="/">Open the converter</a> · <a href="/compress">Open compression</a></p><nav aria-label="Related format guides"><ul>'+links+'</ul></nav><footer>A tool by <a href="https://voxel3d.org/?utm_source=formshift&amp;utm_medium=referral&amp;utm_campaign=model_workflow&amp;utm_content=footer">Voxel3D</a></footer></main>'
  let page=shell.replace(/<title>[^<]*<\/title>/,'<title>'+title+'</title>').replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/,'<meta name="description" content="'+description+'" />').replace('<div id="root"></div>','<div id="root">'+fallback+'</div>')
  if(origin)page=page.replace('</head>','<link rel="canonical" href="'+escape(origin+guide.path)+'" />\n</head>')
  const folder=resolve(dist,guide.path.slice(1))
  await mkdir(folder,{recursive:true});await writeFile(resolve(folder,'index.html'),page)
}
if(origin){
  await writeFile(resolve(dist,'index.html'),shell.replace('</head>','<link rel="canonical" href="'+escape(origin+'/')+'" />\n</head>'))
  const paths=['/','/compress','/package','/compress/package','/batch','/compress/batch',...guides.map(g=>g.path)]
  await writeFile(resolve(dist,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>'<url><loc>'+escape(origin+p)+'</loc></url>').join('')+'</urlset>\n')
}
console.log('Generated '+guides.length+' format guides'+(origin?' and sitemap':' (set VITE_SITE_ORIGIN for canonical URLs and sitemap)'))
