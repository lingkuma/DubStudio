# Third party components

DubStudio uses WebAV (@webav/av-cliper 1.2.8, MIT), @xzdarcy/react-timeline-editor (MIT), React (MIT), Vite (MIT), Zustand (MIT), idb-keyval (Apache-2.0), fflate (MIT), and Lucide (ISC).

SoundTouchJS 0.3.0 is distributed separately as an unmodified, replaceable ES module at /vendor/soundtouch/soundtouch.js, under LGPL 2.1 or later. Its license, source map and original source files extracted from the published source map are distributed beside it. Copyright holders include Olli Parviainen, Ryan Berdeen, Jakub Fiala and Steve 'Cutter' Blades. Upstream: https://github.com/cutterbl/SoundTouchJS . Replacing this module does not require rebuilding the editor; no integrity check prevents a modified compatible version.

Other package copyright notices are copied into /licenses during the build. npm package-lock.json records exact package versions. No third-party demo videos or audio tracks are distributed.
