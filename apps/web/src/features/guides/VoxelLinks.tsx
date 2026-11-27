// No tracking scripts, uploads, filenames, model IDs, or session tokens leave Formshift.
type Placement='footer'|'navigation'|'conversion_result'|'compression_result'|'package_result'|'batch_result'
function voxelUrl(placement:Placement,custom=false){
  const url=new URL(custom?'https://voxel3d.org/custom':'https://voxel3d.org/')
  url.searchParams.set('utm_source','formshift')
  url.searchParams.set('utm_medium','referral')
  url.searchParams.set('utm_campaign','model_workflow')
  url.searchParams.set('utm_content',placement)
  return url.href
}
export function VoxelNav(){return <a className="voxel-nav" href={voxelUrl('navigation',true)} target="_blank" rel="noopener noreferrer">3D printing <span aria-hidden="true">↗</span></a>}
export function VoxelCredit(){return <span className="voxel-credit">A tool by <a href={voxelUrl('footer')} target="_blank" rel="noopener noreferrer">Voxel3D <span aria-hidden="true">↗</span></a></span>}
export function printableFormat(format:string){return format==='STL'||format==='3MF'}
export function PrintNextStep({placement}:{placement:Exclude<Placement,'footer'|'navigation'>}){
  return <aside className="print-next-step" aria-label="Optional next step: 3D printing">
    <h3>Planning a physical print?</h3>
    <p>Check your model's dimensions and printability before printing. If you need help making it physical, Voxel3D's custom studio accepts 3D model references.</p>
    <a href={voxelUrl(placement,true)} target="_blank" rel="noopener noreferrer">Explore custom 3D printing <span aria-hidden="true">↗</span></a>
    <small>Your file is not shared automatically.</small>
  </aside>
}
