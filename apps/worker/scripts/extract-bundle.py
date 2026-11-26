#!/usr/bin/env python3
"""Extract one dependency-aware OBJ/glTF bundle; never extract arbitrary archives."""
import json, os, pathlib, re, shutil, stat, sys, zipfile
from urllib.parse import unquote
ALLOWED={".mtl",".bin",".png",".jpg",".jpeg",".webp",".tga",".bmp",".tif",".tiff",".exr",".hdr",".ktx2",".dds"}
LIMIT=int(os.environ.get("WORKER_MAX_ARCHIVE_MB","1024"))*1024**2
def safe(name):
    return isinstance(name,str) and 0<len(name)<=512 and not re.search(r'[\\:\x00-\x1f\x7f]',name) and all(p and p not in (".","..") and len(p)<=255 and not p.endswith(("."," ")) for p in name.split("/"))
def resolve(root,parent,reference,uri=False):
    if uri: reference=unquote(reference)
    if not reference or reference.startswith(("/", "\\")) or re.search(r'[\\:\x00-\x1f\x7f?#]',reference): raise ValueError("unsafe dependency reference")
    target=(parent/reference).resolve()
    if not target.is_relative_to(root) or not target.is_file(): raise ValueError("missing or unsafe dependency")
    return target
def lines(path):
    with path.open("r",encoding="utf-8",errors="strict") as f:
        while True:
            line=f.readline(65537)
            if not line:break
            if len(line)>65536:raise ValueError("dependency line too long")
            if line.rstrip().endswith("\\"):raise ValueError("continued lines unsupported")
            yield line.split("#",1)[0].strip()
def obj_refs(root,model):
    for line in lines(model):
        fields=line.split(None,1)
        if len(fields)!=2 or fields[0].lower()!="mtllib":continue
        reference=fields[1].strip()
        try: mtls=[resolve(root,model.parent,reference)]
        except ValueError:mtls=[resolve(root,model.parent,x) for x in reference.split()]
        for mtl in mtls:
            if mtl.suffix.lower()!=".mtl":raise ValueError("invalid material")
            for line in lines(mtl):
                fields=line.split(None,1)
                if len(fields)!=2 or not (fields[0].lower().startswith("map_") or fields[0].lower() in ("bump","disp","decal","refl","norm")):continue
                # Only common unambiguous path references. Reject options rather than
                # risk a different interpretation by Blender.
                ref=fields[1].strip()
                if ref.startswith("-"):raise ValueError("MTL map options unsupported in dependency bundle")
                target=resolve(root,mtl.parent,ref)
                if target.suffix.lower() not in ALLOWED-{".mtl",".bin"}:raise ValueError("invalid texture")
def gltf_refs(root,model):
    with model.open("rb") as f:doc=json.load(f)
    stack=[doc]
    while stack:
        item=stack.pop()
        if isinstance(item,dict):
            for k,v in item.items():
                if k=="uri":
                    if not isinstance(v,str):raise ValueError("invalid URI")
                    if not v.startswith("data:"):
                        if resolve(root,model.parent,v,True).suffix.lower() not in ALLOWED-{".mtl"}:raise ValueError("unsupported asset")
                elif isinstance(v,(dict,list)):stack.append(v)
        elif isinstance(item,list):stack.extend(v for v in item if isinstance(v,(dict,list)))
def extract(source,dest,entry):
    root=pathlib.Path(dest).resolve()
    if not safe(entry) or pathlib.Path(entry).suffix.lower() not in (".obj",".gltf"):raise ValueError("invalid model path")
    root.mkdir()
    with zipfile.ZipFile(source) as archive:
        items=archive.infolist()
        if not 1<=len(items)<=5000:raise ValueError("entry limit")
        seen=set();total=0
        for info in items:
            name=info.filename
            if not safe(name) or name.casefold() in seen or info.is_dir() or info.flag_bits&1 or stat.S_ISLNK(info.external_attr>>16):raise ValueError("unsafe bundle entry")
            seen.add(name.casefold())
            if name!=entry and pathlib.Path(name).suffix.lower() not in ALLOWED:raise ValueError("unexpected bundle entry")
            total+=info.file_size
            if total>LIMIT or (info.file_size>8*1024**2 and info.file_size>200*max(1,info.compress_size)):raise ValueError("expanded archive limit")
            target=root/name
            target.parent.mkdir(parents=True,exist_ok=True)
            with archive.open(info) as a,target.open("xb") as b:shutil.copyfileobj(a,b,1024**2)
        model=root/entry
        if not model.is_file():raise ValueError("model missing")
        if model.suffix.lower()==".obj":obj_refs(root,model)
        else:gltf_refs(root,model)
if __name__=="__main__":
    try:extract(*sys.argv[1:])
    except (OSError,ValueError,RuntimeError,TypeError,zipfile.BadZipFile,MemoryError):sys.exit(2)
