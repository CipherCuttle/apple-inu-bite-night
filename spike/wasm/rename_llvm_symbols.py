#!/usr/bin/env python3
"""Rename exact LLVM IR global symbols using a two-column mapping file.

This is used only by the browser spike to preserve OpenRealm's native
libgame/libmenu symbol namespaces after both modules are compiled into one Wasm
program. It rewrites @symbol references in LLVM IR; C identifiers only are
accepted so the transformation is deliberately narrow and auditable.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: rename_llvm_symbols.py <input.ll> <mapping.txt> <output.ll>", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1])
    mapping_path = Path(sys.argv[2])
    output_path = Path(sys.argv[3])

    text = input_path.read_text()
    pairs: list[tuple[str, str]] = []
    seen_old: set[str] = set()
    seen_new: set[str] = set()

    for lineno, raw in enumerate(mapping_path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 2:
            raise SystemExit(f"{mapping_path}:{lineno}: expected '<old> <new>'")
        old, new = parts
        if not IDENT.fullmatch(old) or not IDENT.fullmatch(new):
            raise SystemExit(f"{mapping_path}:{lineno}: non-C identifier in mapping")
        if old in seen_old or new in seen_new:
            raise SystemExit(f"{mapping_path}:{lineno}: duplicate mapping endpoint")
        seen_old.add(old)
        seen_new.add(new)
        pairs.append((old, new))

    if not pairs:
        raise SystemExit("refusing empty symbol mapping")

    counts: dict[str, int] = {}
    # LLVM IR global/function references use @name. Sorting longest-first avoids
    # any accidental prefix interaction even though the regex boundary already
    # protects C identifiers.
    for old, new in sorted(pairs, key=lambda item: len(item[0]), reverse=True):
        pattern = re.compile(r"@" + re.escape(old) + r"(?![A-Za-z0-9_])")
        text, count = pattern.subn("@" + new, text)
        if count == 0:
            raise SystemExit(f"mapping had no LLVM IR references: {old}")
        counts[old] = count

    # Fail closed if any old endpoint remains as an LLVM global reference.
    for old, _ in pairs:
        if re.search(r"@" + re.escape(old) + r"(?![A-Za-z0-9_])", text):
            raise SystemExit(f"old LLVM symbol still referenced after rewrite: {old}")

    output_path.write_text(text)
    print(f"LLVM_SYMBOL_NAMESPACE_REWRITES={len(pairs)}")
    print(f"LLVM_SYMBOL_NAMESPACE_REFERENCES={sum(counts.values())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
