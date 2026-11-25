"""Bounded, geometry-only static preview, independent of the actual export.
Use evaluated triangles in world coordinates, deterministic uniform sampling,
and write a small glTF 2.0 container without textures or external references.
"""
import bpy
import math
import struct
import json
from array import array

MAX_TRIANGLES=100000
MAX_INSTANCES=512
MAX_SOURCE_TRIANGLES=8000000

def write_preview(path):
    deps=bpy.context.evaluated_depsgraph_get()
    instances=[]
    total=0
    for instance in deps.object_instances:
        obj=instance.object
        if obj.type!="MESH":
            continue
        if len(instances)>=MAX_INSTANCES:
            raise RuntimeError("Preview instance limit")
        mesh=obj.to_mesh()
        if mesh is None:
            continue
        try:
            mesh.calc_loop_triangles()
            count=len(mesh.loop_triangles)
        finally:
            obj.to_mesh_clear()
        if count:
            # Depsgraph object instance handles are ephemeral; retain object and matrix only.
            instances.append((obj,instance.matrix_world.copy(),count))
            total+=count
            if total>MAX_SOURCE_TRIANGLES:
                raise RuntimeError("Preview source triangle limit")
    if not total:
        raise RuntimeError("No preview triangles")
    stride=max(1,math.ceil(total/MAX_TRIANGLES))
    positions=array("f")
    lo=[math.inf]*3
    hi=[-math.inf]*3
    cursor=0
    for obj,matrix,count in instances:
        mesh=obj.to_mesh()
        if mesh is None:
            raise RuntimeError("Preview geometry changed")
        try:
            mesh.calc_loop_triangles()
            if len(mesh.loop_triangles)!=count:
                raise RuntimeError("Preview geometry changed")
            flip=matrix.to_3x3().determinant()<0
            for index in range((-cursor)%stride,count,stride):
                tri=mesh.loop_triangles[index]
                a,b,c=tri.vertices
                for v in (a,c,b) if flip else (a,b,c):
                    x,y,z=matrix @ mesh.vertices[v].co
                    coords=(x,z,-y)
                    if not all(math.isfinite(n) and abs(n)<=1e12 for n in coords):
                        raise RuntimeError("Preview coordinate limit")
                    positions.extend(coords)
                    for j,n in enumerate(coords):
                        lo[j]=min(lo[j],n);hi[j]=max(hi[j],n)
            cursor+=count
        finally:
            obj.to_mesh_clear()
    if not positions or len(positions)//9>MAX_TRIANGLES:
        raise RuntimeError("Preview triangle limit")
    if __import__("sys").byteorder!="little":
        positions.byteswap()
    binary=positions.tobytes()
    doc={"asset":{"version":"2.0"},"scene":0,"scenes":[{"nodes":[0]}],"nodes":[{"mesh":0}],"meshes":[{"primitives":[{"attributes":{"POSITION":0},"mode":4}]}],"buffers":[{"byteLength":len(binary)}],"bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":len(binary),"target":34962}],"accessors":[{"bufferView":0,"componentType":5126,"count":len(positions)//3,"type":"VEC3","min":lo,"max":hi}]}
    encoded=json.dumps(doc,separators=(",",":")).encode()
    encoded+=b" "*((-len(encoded))%4)
    with open(path,"wb") as f:
        f.write(struct.pack("<4sII",b"glTF",2,28+len(encoded)+len(binary)))
        f.write(struct.pack("<I4s",len(encoded),b"JSON"))
        f.write(encoded)
        f.write(struct.pack("<I4s",len(binary),b"BIN\x00"))
        f.write(binary)
