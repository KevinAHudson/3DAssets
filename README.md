# Shorts asset library

Objects built for one short, saved so the next short can load them. Each object is a `.glb` file
in `objects/` with a thumbnail beside it and an entry in `manifest.json`.

The shorts harness manages this repository: `python shorts.py assets` lists what is here,
`assets add` files a new object, and `assets push` uploads it.
