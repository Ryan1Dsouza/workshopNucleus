# Mario Kart runtime pack

The default game builds the course and all eight drivers in Three.js.
`?sourceCourse=1` opts into the model manifest, stadium and player GLB.
The game reads the separate audio manifest after the first interaction.

- Characters, Standard Kart, Standard Tires, and Mario Kart Stadium: Nintendo
  Mario Kart 8 artwork obtained through The Models Resource. The adjacent
  `*-source.provenance.json` files retain source pages, contributor credits, and
  conversion records. [Conversion details](../../games/mario-kart/pipeline/SOURCE-ASSETS.md).
- Prepared music, sound effects, and voices: Nintendo game recordings obtained
  through The Sounds Resource and KHInsider. The audio manifest records source
  filenames, source hashes, and playback settings. [Source collection details](../../games/mario-kart/SOUND-DESIGN.md).
- UI lettering and portraits: derived from an extracted game UI sheet; see
  `ui/provenance.json`. Stadium TV artwork has its own provenance record.

These Nintendo assets are not original OpenWii artwork and are not covered by
OpenWii's MIT software license. Attribution does not grant redistribution rights
or imply endorsement by Nintendo or the community uploaders.

Only the selected runtime files and provenance records are included. Original
archives, extracted source collections, alternate packs, and development evidence
remain local. The procedural game remains available as a fallback.
