import json,pathlib,subprocess,sys,tempfile,unittest,zipfile
SCRIPT=pathlib.Path(__file__).with_name("extract-bundle.py")
class BundleTests(unittest.TestCase):
    def test_bundles(self):
        cases=[
            ("obj","models/a.obj",{"models/a.obj":"mtllib a.mtl\nv 0 0 0\n","models/a.mtl":"map_Kd ../textures/a.png\n","textures/a.png":b"png"},True),
            ("gltf","a.gltf",{"a.gltf":json.dumps({"asset":{"version":"2.0"},"buffers":[{"uri":"data/model.bin"}]}),"data/model.bin":b"123"},True),
            ("traversal","a.obj",{"a.obj":"v 0 0 0","../bad.png":b"x"},False),
            ("remote URI","a.gltf",{"a.gltf":'{"buffers":[{"uri":"https://example.com/a.bin"}]}'},False),
            ("missing MTL","a.obj",{"a.obj":"mtllib a.mtl"},False),
            ("external texture","a.obj",{"a.obj":"mtllib a.mtl","a.mtl":"map_Kd ../../secret.png"},False),
            ("other model","a.obj",{"a.obj":"v 0 0 0","b.obj":"v 0 0 0"},False),
            ("duplicate","a.obj",{"a.obj":"v 0 0 0","a.png":"x","A.png":"y"},False),
            ("MTL options","a.obj",{"a.obj":"mtllib a.mtl","a.mtl":"map_Kd -s 1 1 1 -bm 0.5 texture with spaces.png","texture with spaces.png":"png"},True),
            ("USD root","root.usda",{"root.usda":"#usda 1.0\n( subLayers = [@layers/part.usda@] )","layers/part.usda":"#usda 1.0\nasset image = @../texture.png@","texture.png":"png"},True),
            ("USD missing","root.usda",{"root.usda":"#usda 1.0\n( subLayers = [@missing.usda@] )"},False),
            ("ratio","a.obj",{"a.obj":"v 0 0 0","x.bin":b"0"*(9*1024*1024)},False),
        ]
        for label,entry,files,ok in cases:
            with self.subTest(label=label),tempfile.TemporaryDirectory() as folder:
                root=pathlib.Path(folder);archive=root/"input.zip"
                with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED) as z:
                    for name,data in files.items():z.writestr(name,data)
                result=subprocess.run([sys.executable,"-I",str(SCRIPT),str(archive),str(root/"out"),entry],capture_output=True,timeout=30)
                self.assertEqual(result.returncode==0,ok,result.stderr)
    def test_package_output(self):
        pack=SCRIPT.with_name("package-output.py")
        with tempfile.TemporaryDirectory() as folder:
            root=pathlib.Path(folder);model=root/"export";model.mkdir()
            (model/"model.obj").write_text("mtllib a.mtl\n"+"v 0 0 0\n"*10000)
            (model/"a.mtl").write_text("map_Kd texture.png")
            (model/"texture.png").write_bytes(b"texture")
            archive=root/"export.zip";compressed=root/"compressed.zip"
            def run(*args):
                return subprocess.run([sys.executable,"-I",str(pack),*map(str,args)],capture_output=True,timeout=30)
            self.assertEqual(run("pack",model,archive,"model.obj",1024**2).returncode,0)
            self.assertEqual(run("repack",archive,compressed,"model.obj",9).returncode,0)
            self.assertLess(compressed.stat().st_size,archive.stat().st_size)
            with zipfile.ZipFile(archive) as a,zipfile.ZipFile(compressed) as b:
                self.assertEqual(a.namelist(),b.namelist())
                for name in a.namelist():self.assertEqual(a.read(name),b.read(name))
            self.assertEqual(subprocess.run([sys.executable,"-I",str(SCRIPT),str(compressed),str(root/"reopened"),"model.obj"],capture_output=True,timeout=30).returncode,0)
            (model/"texture.png").unlink()
            self.assertNotEqual(run("pack",model,root/"bad.zip","model.obj",1024**2).returncode,0)
if __name__=="__main__":unittest.main()
