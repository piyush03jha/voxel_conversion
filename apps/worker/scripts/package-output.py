#!/usr/bin/env python3
"""Stream package files; no geometry or texture rewriting in lossless mode."""
import pathlib, shutil, stat, sys, zipfile, runpy
def pack(root,output,entry,limit):
    root=pathlib.Path(root).resolve();limit=int(limit)
    paths=sorted(root.rglob("*"))
    if not (root/entry).is_file() or len(paths)>5000:raise ValueError("missing output or entry limit")
    helpers=runpy.run_path(str(pathlib.Path(__file__).with_name('extract-bundle.py')))
    model=root/entry
    if model.suffix.lower()=='.obj':helpers['obj_refs'](root,model)
    elif model.suffix.lower() in ('.usd','.usda','.usdc'):helpers['usd_refs'](root,model)
    total=0
    with zipfile.ZipFile(output,"w",compression=zipfile.ZIP_STORED,allowZip64=True) as z:
        for path in paths:
            if path.is_symlink():raise ValueError("unsafe export symlink")
            if path.is_dir():continue
            if not path.is_file() or not path.resolve().is_relative_to(root) or not helpers['safe'](path.relative_to(root).as_posix()):raise ValueError("unsafe output")
            total+=path.stat().st_size
            if total>limit:raise ValueError("output capacity")
            z.write(path,path.relative_to(root).as_posix())
def repack(source,output,entry,level):
    with zipfile.ZipFile(source) as src,zipfile.ZipFile(output,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=int(level),allowZip64=True) as dst:
        if entry not in src.namelist():raise ValueError("missing root")
        for info in src.infolist():
            if info.is_dir() or stat.S_ISLNK(info.external_attr>>16):raise ValueError("unsafe entry")
            copy=zipfile.ZipInfo(info.filename,info.date_time);copy.compress_type=zipfile.ZIP_DEFLATED;copy._compresslevel=int(level)
            with src.open(info) as a,dst.open(copy,"w",force_zip64=True) as b:shutil.copyfileobj(a,b,1024**2)
    # Do not return a package that our own safety checks would reject.
    with zipfile.ZipFile(output) as z:
        if any(i.file_size>8*1024**2 and i.file_size>200*max(1,i.compress_size) for i in z.infolist()):
            pathlib.Path(output).unlink()
            shutil.copyfile(source,output)
if __name__=="__main__":
    try:
        (pack if sys.argv[1]=="pack" else repack)(*sys.argv[2:])
    except (OSError,ValueError,RuntimeError,zipfile.BadZipFile):sys.exit(2)
