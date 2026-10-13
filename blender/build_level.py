"""
Mascot Kart - procedural level builder for Blender.

Builds a complete race track scene (road, curbs, walls, terrain, themed props,
start arch) from the same seeded generator the game uses (js/trackgen.js), then
exports it as a .glb the game loads automatically from assets/levels/.

Run it any of these ways:

  1. Blender MCP (ahujasid/blender-mcp): ask Claude to "run blender/build_level.py
     through execute_blender_code with LEVEL = 3", or paste this file's contents
     into the execute_blender_code tool after editing the CONFIG block below.

  2. Blender CLI (headless, builds every level):
       blender -b -P blender/build_level.py -- --all --out assets/levels

  3. Blender GUI: open the Scripting tab, load this file, edit CONFIG, Run Script.

The generator part (everything above `# ---- Blender scene building`) has no bpy
dependency, so tests/parity.test.mjs can check it against the JavaScript version.
"""

import math
import os
import sys

# ---------------------------------------------------------------- CONFIG
# Used when run via Blender MCP / GUI. CLI flags override these.
LEVEL = 1            # 1..6, or 0 for a random-seed level (see SEED)
SEED = 12345         # only used when LEVEL == 0
OUT_DIR = ""         # folder for the .glb; "" = don't export, just build the scene
CLEAR_SCENE = True   # wipe the current scene first
RENDER_PREVIEW = ""  # path to a .png to render a top-down preview, "" to skip

# ---------------------------------------------------------------- levels (mirror js/levels.js)
THEMES = {
    "meadow": dict(sky=0x8fd3ff, ground=0x5fbf4a, groundAlt=0x4aa83a, road=0x4a4a55, curb=(0xffffff, 0xe8413c), wall=0xf2c94c, props="trees"),
    "desert": dict(sky=0xffd59e, ground=0xe8b86b, groundAlt=0xd9a352, road=0x6b5a4a, curb=(0xffffff, 0x2f80ed), wall=0xb5651d, props="cacti"),
    "snow":   dict(sky=0xb8d8f0, ground=0xf4f8fc, groundAlt=0xdde8f2, road=0x5a6578, curb=(0xffffff, 0x2d9cdb), wall=0x9fc6e8, props="pines"),
    "candy":  dict(sky=0xffc6e8, ground=0xff9ecf, groundAlt=0xf78bc2, road=0x7b4fa0, curb=(0xffffff, 0xff5aa5), wall=0x7ee0d6, props="lollipops"),
    "lava":   dict(sky=0x3a1a1a, ground=0x2b2222, groundAlt=0x3a2b26, road=0x2a2a30, curb=(0xffd23f, 0x1a1a1a), wall=0xff6a00, props="rocks"),
    "space":  dict(sky=0x0b0b2b, ground=0x2a2a5a, groundAlt=0x35356e, road=0x1c1c3a, curb=(0x00e5ff, 0xff00d4), wall=0x7b61ff, props="crystals"),
}
THEME_ORDER = ["meadow", "desert", "snow", "candy", "lava", "space"]


def _lvl(id, name, theme, seed, ai, skill, points, radius, rj, aj, wiggle, elev, width):
    return dict(id=id, name=name, theme=theme, seed=seed, laps=3, ai=ai, aiSkill=skill,
                gen=dict(points=points, radius=radius, radiusJitter=rj, angleJitter=aj,
                         wiggle=wiggle, elevation=elev, width=width))


LEVELS = [
    _lvl(1, "Meadow Mile", "meadow", 1101, 5, 0.80, 8, 120, 0.22, 0.35, 0.0, 3, 16),
    _lvl(2, "Dune Dash", "desert", 2202, 5, 0.85, 9, 135, 0.28, 0.45, 0.08, 6, 15),
    _lvl(3, "Frosty Peaks", "snow", 3303, 6, 0.89, 10, 145, 0.30, 0.5, 0.12, 12, 14),
    _lvl(4, "Candy Canyon", "candy", 4404, 6, 0.92, 11, 150, 0.33, 0.55, 0.18, 9, 13.5),
    _lvl(5, "Lava Loop", "lava", 5505, 7, 0.95, 12, 160, 0.35, 0.6, 0.2, 16, 13),
    _lvl(6, "Star Circuit", "space", 6606, 7, 0.99, 14, 175, 0.36, 0.6, 0.22, 20, 12),
]


def random_level(seed):
    d = ((seed * 2654435761) & 0xFFFFFFFF) / 4294967296
    theme = THEME_ORDER[seed % len(THEME_ORDER)]
    return dict(id=0, name="Random #%d" % seed, theme=theme, seed=seed, laps=3, ai=6, aiSkill=0.85 + d * 0.12,
                gen=dict(points=8 + int(math.floor(d * 7)), radius=125 + d * 50, radiusJitter=0.22 + d * 0.14,
                         angleJitter=0.35 + d * 0.25, wiggle=d * 0.22, elevation=3 + d * 17, width=16 - d * 4))


# ---------------------------------------------------------------- generator (mirror js/trackgen.js)
M32 = 0xFFFFFFFF
TAU = math.pi * 2


def _imul(a, b):
    return ((a & M32) * (b & M32)) & M32


def mulberry32(seed):
    state = [seed & M32]

    def rng():
        state[0] = (state[0] + 0x6D2B79F5) & M32
        t = state[0]
        t = _imul(t ^ (t >> 15), t | 1)
        t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & M32)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return rng


def _catmull_rom(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t

    def f(a, b, c, d):
        return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)

    return [f(p0[k], p1[k], p2[k], p3[k]) for k in range(3)]


def _control_points(rng, g):
    n = g["points"]
    pts = []
    for i in range(n):
        a = (i / n) * TAU + (rng() - 0.5) * g["angleJitter"] * (TAU / n)
        r = g["radius"] * (1 + (rng() - 0.5) * 2 * g["radiusJitter"])
        y = (rng() - 0.5) * 2 * g["elevation"]
        pts.append([math.cos(a) * r, y, math.sin(a) * r])
    if g["wiggle"] > 0:
        out = []
        for i in range(n):
            p, q = pts[i], pts[(i + 1) % n]
            out.append(p)
            dx, dz = q[0] - p[0], q[2] - p[2]
            ln = math.hypot(dx, dz)
            off = (rng() - 0.5) * 2 * g["wiggle"] * ln
            out.append([(p[0] + q[0]) / 2 + (-dz / ln) * off, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2 + (dx / ln) * off])
        pts = out
    m = len(pts)
    for _ in range(2):
        ys = [p[1] for p in pts]
        for i in range(m):
            pts[i][1] = (ys[(i - 1) % m] + 2 * ys[i] + ys[(i + 1) % m]) / 4
    return pts


def _sample_spline(ctrl, spacing):
    m = len(ctrl)
    dense = []
    sub = 24
    for i in range(m):
        p0, p1, p2, p3 = ctrl[(i - 1) % m], ctrl[i], ctrl[(i + 1) % m], ctrl[(i + 2) % m]
        for s in range(sub):
            dense.append(_catmull_rom(p0, p1, p2, p3, s / sub))
    cum = [0.0]
    nd = len(dense)
    for i in range(1, nd + 1):
        a, b = dense[i - 1], dense[i % nd]
        cum.append(cum[i - 1] + math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2))
    total = cum[nd]
    count = max(64, int(_js_round(total / spacing)))
    out = []
    j = 0
    for k in range(count):
        d = (k / count) * total
        while cum[j + 1] < d:
            j += 1
        a, b = dense[j], dense[(j + 1) % nd]
        t = (d - cum[j]) / (cum[j + 1] - cum[j])
        out.append([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t])
    for _ in range(12):
        ys = [q[1] for q in out]
        for i in range(count):
            out[i][1] = (ys[(i - 1) % count] + 2 * ys[i] + ys[(i + 1) % count]) / 4
    return out, total


def _js_round(x):
    return math.floor(x + 0.5)


def _noise_factory(rng):
    waves = []
    for i in range(4):
        ang = rng() * TAU
        freq = 0.006 * (2.1 ** i)
        waves.append((math.cos(ang) * freq, math.sin(ang) * freq, rng() * TAU, 1 / (1.9 ** i)))

    def noise(x, z):
        return sum(math.sin(x * w[0] + z * w[1] + w[2]) * w[3] for w in waves)

    return noise


def _self_overlaps(points, wall_offset):
    n = len(points)
    for i in range(n):
        a, b = points[i], points[(i + 1) % n]
        if abs(b[1] - a[1]) > 0.3 * math.hypot(b[0] - a[0], b[2] - a[2]):
            return True
    min_gap2 = (wall_offset * 2 + 5) ** 2
    skip = int(math.ceil(wall_offset * 2.5))
    for i in range(0, n, 2):
        ax, az = points[i][0], points[i][2]
        for j in range(i + skip, n, 2):
            if n - (j - i) < skip:
                break
            dx, dz = points[j][0] - ax, points[j][2] - az
            if dx * dx + dz * dz < min_gap2:
                return True
    return False


def nearest_sample(points, x, z, stride=1):
    best, bi = float("inf"), 0
    for i in range(0, len(points), stride):
        dx, dz = points[i][0] - x, points[i][2] - z
        d = dx * dx + dz * dz
        if d < best:
            best, bi = d, i
    return bi, math.sqrt(best)


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def generate_track(level):
    g = level["gen"]
    rng = mulberry32(level["seed"])
    wall_offset = g["width"] / 2 + 4
    for attempt in range(8):
        calm = 0.8 ** attempt
        ga = dict(g, radiusJitter=g["radiusJitter"] * calm, angleJitter=g["angleJitter"] * calm, wiggle=g["wiggle"] * calm)
        ctrl = _control_points(rng, ga)
        points, length = _sample_spline(ctrl, 2.0)
        if not _self_overlaps(points, wall_offset):
            break
    n = len(points)
    tangents, rights = [], []
    for i in range(n):
        a, b = points[(i - 1) % n], points[(i + 1) % n]
        tx, ty, tz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        tl = math.sqrt(tx * tx + ty * ty + tz * tz)
        tx, ty, tz = tx / tl, ty / tl, tz / tl
        tangents.append([tx, ty, tz])
        rl = math.hypot(tx, tz)
        rights.append([-tz / rl, 0.0, tx / rl])

    half = g["width"] / 2
    shoulder = 4

    rng_items = mulberry32(level["seed"] + 7)
    boosts = []
    n_boost = 3 + int(math.floor(rng_items() * 3))
    for i in range(n_boost):
        idx = int(math.floor(((i + 0.3 + rng_items() * 0.4) / n_boost) * n)) % n
        lat = (rng_items() - 0.5) * (g["width"] - 5)
        boosts.append(dict(index=idx, lateral=lat))
    item_rows = []
    for i in range(3):
        idx = int(math.floor(((i + 0.5 + (rng_items() - 0.5) * 0.3) / 3) * n)) % n
        item_rows.append(dict(index=idx))

    rng_props = mulberry32(level["seed"] + 13)
    xs = [p[0] for p in points]
    zs = [p[2] for p in points]
    margin = 70
    bounds = dict(minX=min(xs) - margin, maxX=max(xs) + margin, minZ=min(zs) - margin, maxZ=max(zs) + margin)
    props = []
    clearance = half + shoulder + 6
    tries = 0
    while tries < 900 and len(props) < 260:
        tries += 1
        x = bounds["minX"] + rng_props() * (bounds["maxX"] - bounds["minX"])
        z = bounds["minZ"] + rng_props() * (bounds["maxZ"] - bounds["minZ"])
        rot = rng_props() * TAU
        scale = 0.7 + rng_props() * 0.8
        variant = int(math.floor(rng_props() * 3))
        if nearest_sample(points, x, z, 3)[1] < clearance:
            continue
        props.append(dict(x=x, z=z, rot=rot, scale=scale, variant=variant))

    noise = _noise_factory(mulberry32(level["seed"] + 29))
    return dict(level=level, points=points, tangents=tangents, rights=rights, length=length, count=n,
                halfWidth=half, shoulder=shoulder, wallOffset=half + shoulder,
                boosts=boosts, itemRows=item_rows, props=props, bounds=bounds, noise=noise, ctrl=ctrl)


def terrain_height(track, x, z):
    index, dist = nearest_sample(track["points"], x, z, 2)
    track_y = track["points"][index][1] - 1.2
    hills = track["noise"](x, z) * (4 + track["level"]["gen"]["elevation"] * 0.6) + track_y * 0.3
    t = smoothstep(track["wallOffset"] + 2, track["wallOffset"] + 40, dist)
    return track_y + (hills - track_y) * t


# ---------------------------------------------------------------- Blender scene building
# Game coordinates are Y-up (x, y, z). Blender is Z-up; the glTF exporter maps
# Blender (X, Y, Z) -> glTF (X, Z, -Y), so we store game (x, y, z) as Blender (x, -z, y).

def g2b(p):
    return (p[0], -p[2], p[1])


def _hex_rgba(h, a=1.0):
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255), a)


def build_scene(level, out_dir="", clear=True, render_preview=""):
    import bpy
    import bmesh

    theme = THEMES[level["theme"]]
    track = generate_track(level)
    pts, rights, n = track["points"], track["rights"], track["count"]
    half, wall_off = track["halfWidth"], track["wallOffset"]

    if clear:
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete()
        for block in (bpy.data.meshes, bpy.data.materials):
            for item in list(block):
                if item.users == 0:
                    block.remove(item)

    root = bpy.data.collections.new("Level_%d_%s" % (level["id"], level["name"].replace(" ", "_")))
    bpy.context.scene.collection.children.link(root)

    mats = {}

    def mat(name, color, emission=0.0, rough=0.8):
        key = (name, color)
        if key in mats:
            return mats[key]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = _hex_rgba(color)
        bsdf.inputs["Roughness"].default_value = rough
        if emission > 0:
            em = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
            em.default_value = _hex_rgba(color)
            bsdf.inputs["Emission Strength"].default_value = emission
        mats[key] = m
        return m

    def mesh_object(name, verts, faces, material, mat_index=None, extra_mats=()):
        me = bpy.data.meshes.new(name)
        me.from_pydata([g2b(v) for v in verts], [], faces)
        me.update()
        for poly in me.polygons:
            poly.use_smooth = False
        ob = bpy.data.objects.new(name, me)
        ob.data.materials.append(material)
        for m in extra_mats:
            ob.data.materials.append(m)
        if mat_index is not None:
            for poly, mi in zip(me.polygons, mat_index):
                poly.material_index = mi
        root.objects.link(ob)
        return ob

    def ribbon(inner, outer, y_off=0.0):
        verts, faces = [], []
        for i in range(n):
            p, r = pts[i], rights[i]
            verts.append([p[0] + r[0] * inner, p[1] + y_off, p[2] + r[2] * inner])
            verts.append([p[0] + r[0] * outer, p[1] + y_off, p[2] + r[2] * outer])
        for i in range(n):
            a, b = 2 * i, 2 * ((i + 1) % n)
            faces.append((a, a + 1, b + 1, b))
        return verts, faces

    # Road
    v, f = ribbon(-half, half, 0.0)
    mesh_object("Road", v, f, mat("Road", theme["road"], rough=0.95))

    # Start/finish checker strip
    v, f, mi = [], [], []
    cols = 8
    for row in range(2):
        for c in range(cols):
            base = len(v)
            l0 = -half + (c / cols) * 2 * half
            l1 = -half + ((c + 1) / cols) * 2 * half
            i0, i1 = row, row + 1
            for (ii, ll) in ((i0, l0), (i0, l1), (i1, l1), (i1, l0)):
                p, r = pts[ii % n], rights[ii % n]
                v.append([p[0] + r[0] * ll, p[1] + 0.03, p[2] + r[2] * ll])
            f.append((base, base + 1, base + 2, base + 3))
            mi.append((c + row) % 2)
    mesh_object("StartLine", v, f, mat("White", 0xffffff), mi, [mat("Black", 0x111111)])

    # Curbs (alternating colours every 3 samples)
    for side in (-1, 1):
        v, f, mi = [], [], []
        inner, outer = (half, half + 1.2) if side > 0 else (-half - 1.2, -half)
        rv, rf = ribbon(inner, outer, 0.05)
        mesh_object("Curb_%s" % ("R" if side > 0 else "L"), rv, rf,
                    mat("Curb0", theme["curb"][0]),
                    [(i // 3) % 2 for i in range(n)], [mat("Curb1", theme["curb"][1])])

    # Grass shoulders
    for side in (-1, 1):
        inner, outer = (half + 1.2, wall_off) if side > 0 else (-wall_off, -half - 1.2)
        rv, rf = ribbon(inner, outer, -0.02)
        mesh_object("Shoulder_%s" % ("R" if side > 0 else "L"), rv, rf, mat("Ground", theme["ground"]))

    # Walls: thin boxes along both edges
    for side in (-1, 1):
        verts, faces = [], []
        for i in range(n):
            p, r = pts[i], rights[i]
            o = side * wall_off
            for (ll, hh) in ((o - 0.4, -1.5), (o + 0.4, -1.5), (o + 0.4, 1.4), (o - 0.4, 1.4)):
                verts.append([p[0] + r[0] * ll, p[1] + hh - 0.3, p[2] + r[2] * ll])
        for i in range(n):
            a, b = 4 * i, 4 * ((i + 1) % n)
            for k in range(4):
                k2 = (k + 1) % 4
                faces.append((a + k, a + k2, b + k2, b + k))
        mesh_object("Wall_%s" % ("R" if side > 0 else "L"), verts, faces, mat("Wall", theme["wall"],
                    emission=1.5 if level["theme"] in ("lava", "space") else 0.0))

    # Terrain grid
    b = track["bounds"]
    res = 120
    verts, faces = [], []
    for zi in range(res + 1):
        for xi in range(res + 1):
            x = b["minX"] + (b["maxX"] - b["minX"]) * xi / res
            z = b["minZ"] + (b["maxZ"] - b["minZ"]) * zi / res
            verts.append([x, terrain_height(track, x, z), z])
    for zi in range(res):
        for xi in range(res):
            a = zi * (res + 1) + xi
            faces.append((a, a + res + 1, a + res + 2, a + 1))
    mesh_object("Terrain", verts, faces, mat("Ground", theme["ground"]))

    # Props
    prop_parts = _prop_parts(theme["props"])
    pm = {k: mat("Prop_%s" % k, c, emission=e) for k, (c, e) in _prop_colors(theme["props"]).items()}
    per_mat = {}
    for pr in track["props"]:
        y = terrain_height(track, pr["x"], pr["z"])
        for part in prop_parts[pr["variant"] % len(prop_parts)]:
            per_mat.setdefault(part["mat"], []).append((pr, y, part))
    for key, items in per_mat.items():
        bm = bmesh.new()
        for pr, y, part in items:
            _add_part(bm, part, pr, y)
        me = bpy.data.meshes.new("Props_%s" % key)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new("Props_%s" % key, me)
        ob.data.materials.append(pm[key])
        root.objects.link(ob)

    # Start arch
    p, r = pts[0], rights[0]
    for side in (-1, 1):
        c = [p[0] + r[0] * side * (wall_off - 0.5), p[1] + 3, p[2] + r[2] * side * (wall_off - 0.5)]
        bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=6, location=g2b(c))
        ob = bpy.context.active_object
        ob.name = "ArchPost"
        ob.data.materials.append(mat("Wall", theme["wall"]))
        _move_to(ob, root)
    bpy.ops.mesh.primitive_cube_add(size=1, location=g2b([p[0], p[1] + 6.2, p[2]]))
    ob = bpy.context.active_object
    ob.name = "ArchBanner"
    ob.scale = (wall_off * 2 + 1, 0.4, 1.6)
    ob.rotation_euler = (0, 0, math.atan2(-r[2], r[0]))  # local X along the track's right vector
    ob.data.materials.append(mat("Banner", theme["curb"][1], emission=0.5))
    _move_to(ob, root)

    # World colour
    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = _hex_rgba(theme["sky"])

    # Sun
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 3
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = (0.7, 0.2, 0.8)
    root.objects.link(sun)

    if render_preview:
        _render_top_down(track, render_preview)

    path = ""
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, "level_%s.glb" % (level["id"] if level["id"] else "seed_%d" % level["seed"]))
        bpy.ops.object.select_all(action="DESELECT")
        for ob in root.objects:
            if ob.type == "MESH":
                ob.select_set(True)
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True,
                                  export_yup=True, export_apply=True)
        print("Exported", path)
    return path


def _move_to(ob, coll):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)


def _prop_colors(kind):
    return {
        "trees": {"trunk": (0x8b5a2b, 0), "leaf": (0x2e9e4f, 0), "leaf2": (0x6cc24a, 0)},
        "cacti": {"trunk": (0x3f8f4a, 0), "leaf": (0x2f7a3a, 0), "leaf2": (0xc98a4b, 0)},
        "pines": {"trunk": (0x6b4a2b, 0), "leaf": (0x2f6b55, 0), "leaf2": (0xffffff, 0)},
        "lollipops": {"trunk": (0xffffff, 0), "leaf": (0xff4fa3, 0), "leaf2": (0x8fe3ff, 0)},
        "rocks": {"trunk": (0x3b3333, 0), "leaf": (0xff5a00, 4), "leaf2": (0x4a3f3f, 0)},
        "crystals": {"trunk": (0x3a3a7a, 0), "leaf": (0x00e5ff, 3), "leaf2": (0xff00d4, 3)},
    }[kind]


def _prop_parts(kind):
    """Three variants per theme; each part is a primitive in prop-local, Y-up space."""
    cyl = lambda r, h, y, m, seg=8, r2=None: dict(shape="cyl", r=r, r2=r if r2 is None else r2, h=h, y=y, mat=m, seg=seg)
    ball = lambda r, y, m, x=0.0: dict(shape="ball", r=r, y=y, x=x, mat=m)
    if kind == "trees":
        return [[cyl(0.4, 3, 1.5, "trunk"), ball(2.4, 4.2, "leaf")],
                [cyl(0.35, 2.5, 1.25, "trunk"), ball(1.8, 3.4, "leaf2"), ball(1.3, 4.8, "leaf2")],
                [cyl(0.5, 4, 2, "trunk"), cyl(2.6, 4, 5.5, "leaf", 8, 0.0)]]
    if kind == "cacti":
        return [[cyl(0.7, 6, 3, "trunk"), cyl(0.45, 2.4, 3.6, "leaf"), ball(0.7, 6, "trunk")],
                [ball(1.6, 0.6, "leaf2"), ball(1.0, 1.2, "leaf2", 1.2)],
                [cyl(0.6, 4, 2, "trunk"), ball(0.6, 4, "trunk")]]
    if kind == "pines":
        return [[cyl(0.4, 2, 1, "trunk"), cyl(2.6, 3.5, 3.5, "leaf", 8, 0.0), cyl(1.9, 3, 5.5, "leaf", 8, 0.0)],
                [cyl(0.4, 2, 1, "trunk"), cyl(2.4, 5, 4, "leaf", 8, 0.0), cyl(0.9, 1.4, 6.2, "leaf2", 8, 0.0)],
                [ball(1.4, 0.7, "leaf2"), ball(1.0, 2.2, "leaf2"), ball(0.7, 3.3, "leaf2")]]
    if kind == "lollipops":
        return [[cyl(0.2, 5, 2.5, "trunk"), ball(1.6, 5.6, "leaf")],
                [cyl(0.2, 4, 2, "trunk"), ball(1.3, 4.6, "leaf2")],
                [ball(1.4, 1.2, "leaf"), ball(1.0, 2.6, "leaf2")]]
    if kind == "rocks":
        return [[ball(2.2, 0.8, "trunk"), ball(1.2, 2.2, "leaf2", 1.0)],
                [cyl(1.8, 3, 1.5, "trunk", 6, 0.6), ball(0.8, 3.2, "leaf")],
                [ball(1.6, 0.5, "leaf2"), cyl(0.4, 0.3, 1.9, "leaf", 6)]]
    return [[cyl(1.0, 6, 3, "leaf", 6, 0.0), cyl(0.6, 3, 1.5, "leaf2", 6, 0.0)],
            [cyl(0.8, 4, 2, "leaf2", 5, 0.0), ball(1.2, 0.4, "trunk")],
            [ball(1.6, 0.6, "trunk"), cyl(0.5, 4, 3, "leaf", 6, 0.0)]]


def _add_part(bm, part, pr, ground_y):
    import bmesh
    from mathutils import Matrix
    s = pr["scale"]
    lx = part.get("x", 0.0)
    # local offset rotated by yaw (around game Y)
    c, sn = math.cos(pr["rot"]), math.sin(pr["rot"])
    gx = pr["x"] + (lx * c) * s
    gz = pr["z"] + (-lx * sn) * s
    gy = ground_y + part["y"] * s
    loc = g2b([gx, gy, gz])
    mtx = Matrix.Translation(loc) @ Matrix.Rotation(-pr["rot"], 4, "Z") @ Matrix.Scale(s, 4)
    if part["shape"] == "ball":
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=part["r"], matrix=mtx)
    else:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=part["seg"], radius1=part["r"],
                              radius2=part["r2"], depth=part["h"], matrix=mtx)


def _render_top_down(track, path):
    import bpy
    b = track["bounds"]
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(b["maxX"] - b["minX"], b["maxZ"] - b["minZ"])
    cam_data.clip_end = 2000
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    cx, cz = (b["minX"] + b["maxX"]) / 2, (b["minZ"] + b["maxZ"]) / 2
    cam.location = g2b([cx, 300, cz])
    bpy.context.scene.collection.objects.link(cam)
    scene = bpy.context.scene
    scene.camera = cam
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.render.engine = "CYCLES"  # works headless, no GPU needed
    scene.cycles.samples = 16
    scene.cycles.device = "CPU"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------- entry point
def _parse_cli():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    opts = dict(level=LEVEL, seed=SEED, out=OUT_DIR, all=False, preview=RENDER_PREVIEW)
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--all":
            opts["all"] = True
        elif a in ("--level", "--seed", "--out", "--preview"):
            opts[a[2:]] = argv[i + 1]
            i += 1
        i += 1
    opts["level"], opts["seed"] = int(opts["level"]), int(opts["seed"])
    return opts


def _level_for(num, seed):
    return random_level(seed) if num == 0 else LEVELS[num - 1]


def main():
    opts = _parse_cli()
    if opts["all"]:
        for lv in LEVELS:
            build_scene(lv, opts["out"], True, "")
    else:
        build_scene(_level_for(opts["level"], opts["seed"]), opts["out"], CLEAR_SCENE, opts["preview"])


try:
    import bpy  # noqa: F401
    _IN_BLENDER = True
except ImportError:
    _IN_BLENDER = False

if _IN_BLENDER and __name__ in ("__main__", "builtins"):
    main()
