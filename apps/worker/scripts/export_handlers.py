"""Modular single-file exporters for existing formats using Blender 4.5.
No per-pair converter implementations. All geometry-only routes are explicitly lossy.
"""
import bpy
import math
import zipfile

def checked(operator, **kwargs):
    # Never silently omit options needed for a valid single-file output.
    result = operator(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError("Export failed")

def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.data.polygons]

def need_mesh():
    if not mesh_objects():
        raise RuntimeError("No exportable mesh faces")

def compress_scene(level):
    # Static mesh outputs only. Do not decimate animated/skinned/morph scenes.
    if any(o.type == "ARMATURE" or o.animation_data or
           (o.type == "MESH" and (o.data.shape_keys or o.data.animation_data))
           for o in bpy.context.scene.objects):
        return False
    ratio = {"Low": 0.85, "Medium": 0.60, "High": 0.30}[level]
    need_mesh()
    for obj in mesh_objects():
        if len(obj.data.polygons) < 20:
            continue
        mod = obj.modifiers.new("Formshift compression", "DECIMATE")
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
    return True

def export_3mf(path, level):
    # Core 3MF static geometry package, streamed XML; world coordinates in mm.
    need_mesh()
    scene = bpy.context.scene
    meters = scene.unit_settings.scale_length or 1.0
    scale = meters * 1000.0
    compression = {"None": 0, "Low": 1, "Medium": 6, "High": 9}[level]
    method = zipfile.ZIP_STORED if compression == 0 else zipfile.ZIP_DEFLATED
    content_types = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'
    rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
    deps = bpy.context.evaluated_depsgraph_get()
    ids = []
    triangles = 0
    vertices = 0
    with zipfile.ZipFile(path, "w", compression=method, compresslevel=compression, allowZip64=False) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        with z.open("3D/3dmodel.model", "w") as out:
            def write(text):
                out.write(text.encode("utf-8"))
            write('<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>')
            for instance in deps.object_instances:
                obj = instance.object
                if obj.type != "MESH":
                    continue
                matrix = instance.matrix_world.copy()
                mesh = obj.to_mesh()
                if mesh is None:
                    continue
                try:
                    mesh.calc_loop_triangles()
                    if not mesh.loop_triangles:
                        continue
                    triangles += len(mesh.loop_triangles)
                    vertices += len(mesh.vertices)
                    if triangles > 4000000 or vertices > 4000000 or len(ids) >= 10000:
                        raise RuntimeError("3MF geometry limit")
                    oid = len(ids) + 1
                    ids.append(oid)
                    write(f'<object id="{oid}" type="model"><mesh><vertices>')
                    for v in mesh.vertices:
                        x, y, zz = (matrix @ v.co) * scale
                        if not all(math.isfinite(n) for n in (x, y, zz)):
                            raise RuntimeError("Invalid coordinates")
                        write(f'<vertex x="{x:.9g}" y="{y:.9g}" z="{zz:.9g}"/>')
                    write('</vertices><triangles>')
                    flip = matrix.to_3x3().determinant() < 0
                    for t in mesh.loop_triangles:
                        a, b, c = t.vertices
                        if flip:
                            b, c = c, b
                        write(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>')
                    write('</triangles></mesh></object>')
                finally:
                    obj.to_mesh_clear()
            if not ids:
                raise RuntimeError("No triangles")
            write('</resources><build>')
            for oid in ids:
                write(f'<item objectid="{oid}"/>')
            write('</build></model>')

def export_scene(target, path, level, package_output=False):
    if target == "STL":
        need_mesh()
        checked(bpy.ops.wm.stl_export, filepath=path, ascii_format=False, export_selected_objects=False, apply_modifiers=True)
    elif target == "OBJ":
        need_mesh()
        checked(bpy.ops.wm.obj_export, filepath=path, export_materials=package_output, path_mode='COPY' if package_output else 'AUTO', export_pbr_extensions=package_output, export_uv=True, export_normals=True, apply_modifiers=True, export_colors=True)
    elif target == "PLY":
        need_mesh()
        checked(bpy.ops.wm.ply_export, filepath=path, ascii_format=False, export_selected_objects=False, apply_modifiers=True)
    elif target == "FBX":
        checked(bpy.ops.export_scene.fbx, filepath=path, path_mode="COPY", embed_textures=True, bake_anim=True)
    elif target in ("USD", "USDA", "USDC", "USDZ"):
        # Single file: omit material graphs that would refer to external textures.
        checked(bpy.ops.wm.usd_export, filepath=path, export_animation=True, export_materials=package_output or target=='USDZ', export_textures=package_output or target=='USDZ', export_textures_mode='NEW', relative_paths=True, export_custom_properties=False)
    elif target == "ABC":
        start, end = bpy.context.scene.frame_start, bpy.context.scene.frame_end
        if end - start > 1000:
            raise RuntimeError("Animation frame limit")
        checked(bpy.ops.wm.alembic_export, filepath=path, start=start, end=end, as_background_job=False)
    elif target == "BVH":
        arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
        if len(arms) != 1:
            raise RuntimeError("BVH needs exactly one armature")
        bpy.ops.object.select_all(action="DESELECT")
        arms[0].select_set(True)
        bpy.context.view_layer.objects.active = arms[0]
        start, end = bpy.context.scene.frame_start, bpy.context.scene.frame_end
        if arms[0].animation_data and arms[0].animation_data.action:
            start, end = map(int, arms[0].animation_data.action.frame_range)
        if end < start or end - start > 1000:
            raise RuntimeError("Animation frame limit")
        checked(bpy.ops.export_anim.bvh, filepath=path, frame_start=start, frame_end=end)
    elif target == "3MF":
        export_3mf(path, level)
    else:
        raise RuntimeError("Unsupported export")
