#!/usr/bin/env python3
from pathlib import Path

path = Path("client/cl_view.c")
text = path.read_text()
replacements = {
    "top_lane.height": "top_lane.h",
    "bottom_lane.height": "bottom_lane.h",
    "marker.width": "marker.w",
    "marker.height": "marker.h",
}
for old, new in replacements.items():
    count = text.count(old)
    if count < 1:
        raise SystemExit(f"client/cl_view.c: expected {old!r}")
    text = text.replace(old, new)
path.write_text(text)
print("Hero Line Wars RECT ABI repair applied")
