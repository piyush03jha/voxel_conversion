import {useEffect} from 'react'
import guides from './guides.json'
export type Guide=typeof guides[number]
export function findGuide(path:string){return guides.find(guide=>guide.path===path)}
export function useGuideMetadata(path:string){
  useEffect(()=>{
    const guide=findGuide(path)
    document.title=guide?guide.title+' | Formshift':(path.startsWith('/compress')?'3D File Compression':'3D File Workshop')+' | Formshift'
    document.querySelector('meta[name="description"]')?.setAttribute('content',guide?.description??'Convert or compress 3D models, folders and ZIP packages. Local processing when supported.')
    // Canonical URLs are emitted at build time only when the deployment origin is configured.
    const canonical=document.querySelector('link[rel="canonical"]')
    if(canonical)canonical.setAttribute('href',new URL(path||'/',window.location.origin).href)
  },[path])
}
export function GuideNotes({guide,locked}:{guide:Guide;locked:boolean}){
  return <section className="workshop-guide" aria-label="Format guide">
    <h2>{guide.heading}</h2><p>{guide.body}</p>
    <h3>Before using the result</h3><p>{guide.check}</p>
    {!guide.path.startsWith('/compress')&&guide.source==='OBJ'&&<p><a className="tool-link" href="/package" aria-disabled={locked} onClick={e=>{if(locked)e.preventDefault()}}>Open a model folder with its materials</a>.</p>}
  </section>
}
export function GuideLinks({locked=false}:{locked?:boolean}){
  return <nav className="guide-links" aria-label="Format guides"><span>Format guides</span><div>{guides.map(g=><a key={g.path} href={g.path} aria-disabled={locked} onClick={e=>{if(locked)e.preventDefault()}}>{g.title}</a>)}</div></nav>
}
