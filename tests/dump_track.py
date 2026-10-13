"""Dump generator output as JSON for tests/parity.test.mjs (no Blender needed)."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "blender"))
import build_level as bl

out = []
levels = list(bl.LEVELS) + [bl.random_level(s) for s in (7, 4242, 999999)]
for lv in levels:
    t = bl.generate_track(lv)
    out.append(dict(level=lv, count=t["count"], length=t["length"], points=t["points"][::7],
                    boosts=t["boosts"], itemRows=t["itemRows"], props=t["props"][::5],
                    terrain=[bl.terrain_height(t, x, z) for x, z in ((0, 0), (50, -80), (-200, 120))]))
print(json.dumps(out))
