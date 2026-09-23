"""Production output adapter: same build_geometry as interactive preview."""
import bpy, math, sys, time, json, random, hashlib
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from braid_geometry import build_geometry
args=sys.argv[sys.argv.index('--')+1:]
request_path=Path(args[0]); OUT=Path(args[1]); OUT.mkdir(parents=True,exist_ok=True)
request=json.loads(request_path.read_text()); recipe=request['recipe']; opt=request['material']['render']
t0=time.time(); g=build_geometry(recipe); scene_scale=16/recipe['diameterMm']
CORE=Path(__file__).with_name('braid_geometry.py')
radius=math.sqrt((recipe['denier']*recipe['denierScale']/opt['assumedFilamentsPerEnd']/9000/1000)/1380/math.pi)*1000*scene_scale
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
s=bpy.context.scene; s.render.engine='CYCLES'; s.cycles.samples=opt['samples']
s.cycles.use_denoising=True; s.cycles.denoiser='OPENIMAGEDENOISE'; s.cycles.seed=23; s.cycles.max_bounces=5
s.render.threads_mode='FIXED'; s.render.threads=12
s.world.use_nodes=True; s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=opt['worldStrength']
s.view_settings.view_transform='AgX'; s.view_settings.exposure=opt['exposure']
s.render.image_settings.file_format='PNG'
def mat(name,c,rough,spec=.5):
    m=bpy.data.materials.new(name); m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF')
    n.inputs['Base Color'].default_value=(*c,1)
    n.inputs['Roughness'].default_value=rough
    n.inputs['IOR'].default_value=opt['ior']
    n.inputs['Specular IOR Level'].default_value=spec
    return m
def linear(c):
    return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
palette=list(dict.fromkeys(y['color'].lower() for y in g['yarns']))
colors=[opt['referenceColors'].get(c,tuple(linear(int(c[i:i+2],16)/255)*.82 for i in (1,3,5))) for c in palette]
mats=[mat('Filament '+c, color, opt['roughness'], opt['specular']) for c,color in zip(palette,colors)]
cores=[mat('Interior '+c,color,opt['coreRoughness'],0) for c,color in zip(palette,colors)]
def aim(ob,pt): ob.rotation_euler=(Vector(pt)-ob.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,size,size_y):
    d=bpy.data.lights.new(name,'AREA'); d.energy=power*3; d.shape='RECTANGLE'; d.size=size; d.size_y=size_y
    ob=bpy.data.objects.new(name,d); bpy.context.collection.objects.link(ob); ob.location=loc; aim(ob,(0,0,7))
    # Same angular source size and central irradiance; cover the longer sample.
    ob.location=Vector((0,0,7))+(Vector(loc)-Vector((0,0,7)))*opt['lightScale']
    d.size*=opt['lightScale']; d.size_y*=opt['lightScale']; d.energy*=opt['lightScale']**2
area('Strip softbox',(-6,9,20),850,5,17)
area('Soft fill',(10,-10,17),160,12,12)
area('Edge',(0,12,9),160,12,3)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-8.2))
bpy.context.object.data.materials.append(mat('Neutral background',(.3,.32,.33),.85,0))
camd=bpy.data.cameras.new('Camera'); cam=bpy.data.objects.new('Camera',camd)
bpy.context.collection.objects.link(cam); s.camera=cam
cam.location=(0,-2,30); aim(cam,(0,0,7.6)); camd.type='ORTHO'; camd.ortho_scale=9
camd.clip_end=300

def sink(v,amount):
    n=Vector((0,v.y,v.z)).normalized()
    return v-n*amount
def groove(u):
    # Small constituent-end valleys; never expand the production envelope.
    return opt['grooveDepthMm']*(.5+.5*math.cos(2*math.pi*u*recipe['filamentCount']))**3
objects=[]
stats=[]
def build():
    global objects
    for ob in objects: bpy.data.objects.remove(ob,do_unlink=True)
    objects=[]
    for yi,yarn in enumerate(g['yarns']):
        raw=yarn['mesh']; vv=raw['vertices']; ii=raw['indices']
        verts=[Vector(vv[j:j+3])*scene_scale for j in range(0,len(vv),3)]
        rings=yarn['pathPointCount']; seg=len(verts)//rings
        def sample(r,u):
            st=math.acos(2*u-1)/math.pi*(seg-1)
            j=min(seg-2,int(st)); return verts[r*seg+j].lerp(verts[r*seg+j+1],st-j)
        # Tessellate constituent ends in the existing surface coordinates.
        ncol=241
        meshverts=[]
        for r in range(rings):
            for j in range(ncol):
                u=j/(ncol-1)
                depth=(groove(u)+opt['coreInsetMm'])*scene_scale
                meshverts.append(tuple(sink(sample(r,u),depth)))
        faces=[]
        for r in range(rings-1):
            for j in range(ncol-1):
                a=r*ncol+j; faces.append((a,a+1,a+ncol+1,a+ncol))
        me=bpy.data.meshes.new('Carrier envelope'); me.from_pydata(meshverts,[],faces); me.update()
        ob=bpy.data.objects.new('Carrier '+str(yarn['carrierNo']),me); bpy.context.collection.objects.link(ob); objects.append(ob)
        mi=palette.index(yarn['color'].lower())
        me.materials.append(cores[mi])
        for p in me.polygons: p.use_smooth=True
        cu=bpy.data.curves.new('Bound surface filaments','CURVE'); cu.dimensions='3D'; cu.bevel_depth=radius; cu.bevel_resolution=2
        cu.materials.append(mats[mi])
        rng=random.Random(31+yi)
        for f in range(opt['surfaceCurvesPerCarrier']):
            u=(f+.5)/opt['surfaceCurvesPerCarrier']; phase=rng.uniform(0,math.tau)
            sp=cu.splines.new('POLY'); sp.points.add(rings-1)
            rr=rng.uniform(.9,1)
            for r,p in enumerate(sp.points):
                # Less than one filament diameter of smooth bounded waviness.
                du=.00065*math.sin(r/(rings-1)*math.pi*3+phase)
                uu=max(.001,min(.999,u+du))
                depth=radius+(groove(uu)+.003*(1+math.sin(phase+r*.02)))*scene_scale
                v=sink(sample(r,uu),depth)
                p.co=(*v,1); p.radius=rr
        ob=bpy.data.objects.new('Surface fibers '+str(yarn['carrierNo']),cu); bpy.context.collection.objects.link(ob); objects.append(ob)
build()
stats=[]
length=g['length']*scene_scale
for name,width,target,res in [('rope.png',min(length*.88,90),(0,0,0),(1400,650)),('close.png',24,(-min(19,length*.22),0,7.6),(1100,850))]:
    cam.location=Vector(target)+Vector((0,-2,35)); aim(cam,target); camd.ortho_scale=width
    s.render.resolution_x=res[0]; s.render.resolution_y=res[1]; s.render.resolution_percentage=100
    s.render.filepath=str(OUT/name); started=time.time(); bpy.ops.render.render(write_still=True)
    stats.append(dict(file=name,seconds=time.time()-started))
(OUT/'report.json').write_text(json.dumps(dict(recipe=recipe,profileVersion=opt['version'],geometrySha256=hashlib.sha256(CORE.read_bytes()).hexdigest(),carrierCount=g['carrierCount'],directions=g['directionCounts'],denoising=True,blender=bpy.app.version_string,assumedFilamentsPerEnd=opt['assumedFilamentsPerEnd'],renders=stats,seconds=time.time()-t0),indent=2))
