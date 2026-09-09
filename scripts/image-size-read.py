#!/usr/bin/env python3
"""
Reads the pixel size of already-downloaded image files — called once, as a
batch, by scripts/image-size-backfill.ts.

WHY A BATCH AND NOT ONE CALL PER FILE. There are 15,707 files in
.image-box-cache. Spawning a Python interpreter for each would spend several
minutes in process startup alone. This reads one path per line on stdin and
writes one result per line to stdout, so the interpreter starts once.

WHY PILLOW RATHER THAN A HAND-ROLLED HEADER PARSER. The numbers this writes
have to be interchangeable with the ones scripts/image-box-classify.py
records during a live sweep, and that script reports `im.size` from Pillow
after normalising the mode (see its `w0, h0`). Reading the same field with the
same library is the only way to be sure a backfilled size and a swept size
mean the same thing. Pillow's `Image.open` is lazy — it parses the header and
does not decode the pixels — so this is fast despite decoding nothing being
the point.

Output, tab-separated, one line per input line, in the same order:
    <path>\t<width>\t<height>      a readable image
    <path>\tERR\t<reason>          anything else; the caller leaves that
                                   entry exactly as it found it

A file that cannot be opened is reported, never guessed at. The caller's whole
contract is that it only ever ADDS a size it actually measured.
"""
import sys

from PIL import Image


def main() -> None:
    out = sys.stdout
    for line in sys.stdin:
        path = line.rstrip("\n")
        if not path:
            continue
        try:
            with Image.open(path) as im:
                w, h = im.size
            out.write(f"{path}\t{w}\t{h}\n")
        except Exception as exc:  # noqa: BLE001 - reported to the caller, not raised
            out.write(f"{path}\tERR\t{type(exc).__name__}: {exc}\n")
    out.flush()


if __name__ == "__main__":
    main()
