#!/usr/bin/env python3
"""Lossless package recompression, preserving each entry's contents and name.
The existing archive preflight must run before this script.
"""
import shutil
import sys
import zipfile

def repack(source,target,level):
    with zipfile.ZipFile(source) as src, zipfile.ZipFile(target,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=level,allowZip64=False) as dst:
        for info in src.infolist():
            clone=zipfile.ZipInfo(info.filename,info.date_time)
            clone.external_attr=info.external_attr
            clone.create_system=info.create_system
            clone.compress_type=zipfile.ZIP_DEFLATED
            clone._compresslevel=level
            with src.open(info) as a,dst.open(clone,"w") as b:
                shutil.copyfileobj(a,b,1024*1024)
        dst.comment=src.comment
if __name__=="__main__":
    repack(sys.argv[1],sys.argv[2],int(sys.argv[3]))
