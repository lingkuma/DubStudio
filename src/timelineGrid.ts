import { Grid, defaultCellRangeRenderer } from "react-virtualized";

// The app's virtualized grids belong to react-timeline-editor. Its Grid props
// do not expose a cellRangeRenderer, so configure the supported Grid default.
// Scroll-time cell caching freezes old action geometry while zoom changes;
// retain virtualization, but render visible cells from the current props.
Grid.defaultProps.cellRangeRenderer = (params) =>
  defaultCellRangeRenderer({
    ...params,
    isScrolling: false,
    isScrollingOptOut: false,
    cellCache: {},
    styleCache: {},
  });
