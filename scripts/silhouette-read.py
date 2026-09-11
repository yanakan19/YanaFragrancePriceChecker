#!/usr/bin/env python3
"""
Reads the silhouette bounding box of already-downloaded, already-classified
image files — called once, as a batch, by scripts/silhouette-backfill.ts.

WHY A BATCH AND NOT ONE CALL PER FILE. Mirrors scripts/image-size-read.py's
own reasoning exactly: with 15,707 files in .image-box-cache, spawning a
Python interpreter per file spends several minutes in process startup alone
(measured: ~190ms/file of the ~256ms a fresh `python3 image-box-classify.py
<path>` call costs is interpreter/import startup, not the pixel walk). This
reads one path per line on stdin and writes one result per line to stdout, so
the interpreter starts once per worker instead of once per file.

WHY THIS IMPORTS image-box-classify.py RATHER THAN RE-IMPLEMENTING THE WALK.
The box has to be produced by the exact same thresholding code a live sweep
already runs, or a backfilled box and a swept box could silently mean
different things. `classify()` there already returns the four fractions
(sxf/syf/swf/shf) as of docs/IMAGE-SCALE-PLAN.md — this module just calls it
and forwards them, the same relationship scripts/image-size-read.py has to
Pillow's own `im.size`.

Loaded via importlib rather than a normal `import`: the source file's name
(`image-box-classify.py`) has a hyphen, which is not a legal Python module
name to `import` directly.

Output, tab-separated, one line per input line, in the same order:
    <path>\t<sxf>\t<syf>\t<swf>\t<shf>   a photo with a computable silhouette
    <path>\tERR\t<reason>                anything else — no box, no guess

A file whose silhouette cannot be bounded is reported, never guessed at —
the caller's whole contract, like scripts/image-size-backfill.ts's, is that
it only ever ADDS a box it actually measured.
"""
import importlib.util
import sys
from pathlib import Path

_here = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('image_box_classify', _here / 'image-box-classify.py')
assert _spec is not None and _spec.loader is not None
_classify_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_classify_module)


def main() -> None:
    out = sys.stdout
    for line in sys.stdin:
        path = line.rstrip('\n')
        if not path:
            continue
        try:
            result = _classify_module.classify(path)
        except Exception as exc:  # noqa: BLE001 - reported to the caller, not raised
            out.write(f'{path}\tERR\t{type(exc).__name__}: {exc}\n')
            continue
        if not all(k in result for k in ('sxf', 'syf', 'swf', 'shf')):
            # No foreground at all was found to bound — see classify()'s own
            # "no-foreground"/"no-occupied-columns" branches. Rare, and not a
            # failure to open the file, so the reason is carried through
            # rather than a generic message.
            out.write(f'{path}\tERR\t{result.get("reason", "no-box")}\n')
            continue
        out.write(f'{path}\t{result["sxf"]}\t{result["syf"]}\t{result["swf"]}\t{result["shf"]}\n')
    out.flush()


if __name__ == '__main__':
    main()
