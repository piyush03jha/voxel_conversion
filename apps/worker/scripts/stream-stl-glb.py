#!/usr/bin/env python3
"""Exact triangle geometry, no weld dictionary. Binary STL streams twice.
Z-up STL to Y-up GLB; no nonstandard STL attributes or original normals retained.
"""
import json
import math
import os
import struct
import sys

LIMIT=4200000
BLOCK=4096

def blocks(src,count):
    src.seek(84)
    while count:
        n=min(count,BLOCK)
        data=src.read(n*50)
        if len(data)!=n*50: raise ValueError("truncated STL")
        yield data,n
        count-=n

def convert(source,target):
    with open(source,"rb") as src:
        head=src.read(84)
        if len(head)!=84: raise ValueError("bad STL header")
        count=struct.unpack_from("<I",head,80)[0]
        if not 0<count<=LIMIT or os.fstat(src.fileno()).st_size!=84+count*50: raise ValueError("binary STL required")
        lo=[math.inf]*3
        hi=[-math.inf]*3
        for data,n in blocks(src,count):
            for i in range(n):
                values=struct.unpack_from("<9f",data,i*50+12)
                for j,v in enumerate(values):
                    if not math.isfinite(v) or abs(v)>1e30: raise ValueError("invalid coordinate")
                    axis=j%3
                    lo[axis]=min(lo[axis],v);hi[axis]=max(hi[axis],v)
        length=count*36
        doc={"asset":{"version":"2.0"},"scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0,"scale":[0.001,0.001,0.001],"rotation":[-math.sqrt(.5),0,0,math.sqrt(.5)]}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"mode":4}]}],"buffers":[{"byteLength":length}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":length,"target":34962}],"accessors":[{"bufferView":0,"componentType":5126,"count":count*3,"type":"VEC3","min":lo,"max":hi}]}
        encoded=json.dumps(doc,separators=(",",":")).encode()
        encoded+=b" "*((-len(encoded))%4)
        with open(target,"wb") as out:
            out.write(struct.pack("<4sII",b"glTF",2,28+len(encoded)+length))
            out.write(struct.pack("<I4s",len(encoded),b"JSON"));out.write(encoded)
            out.write(struct.pack("<I4s",length,b"BIN\x00"))
            for data,n in blocks(src,count):
                result=bytearray(n*36)
                for i in range(n):result[i*36:(i+1)*36]=data[i*50+12:i*50+48]
                out.write(result)
if __name__=="__main__":
    convert(sys.argv[1],sys.argv[2])
