# Current Materials page -> V2 traceability mapping

The supplied current page already has useful logic that this package deliberately preserves conceptually:

- bundle checks and member checks;
- member-to-bundle resolution with duplicate bundle-reference protection;
- member search by mark, bundle, drawing and segment;
- bolts/packers by segment and drawing;
- missing issue close-out via linked receipt events;
- tower-to-tower transfers;
- controlled material amendments with base-material links;
- CSV/XLSX-oriented import parsing and source aliasing.

V2 moves those concepts into canonical project-wide tables so the same issue can be used by Materials, Daily Dockets, Commercial and the Client Portal.
