---
name: DubStudio
description: White sentence-focused video editing workspace
colors:
  primary: "#3067d9"
  primary-hover: "#2457c2"
  selected-bg: "#edf3ff"
  surface: "#ffffff"
  preview-stage: "#f8f9fc"
  text: "#252b36"
  secondary-text: "#647188"
  divider: "#e7eaf0"
  video-track: "#dfeafa"
  dub-track: "#dff1e9"
  subtitle-track: "#eee8f7"
  music-track: "#f7eddc"
typography:
  body:
    fontFamily: "'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
  editor-text:
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.75
  title:
    fontSize: "18px"
    fontWeight: 600
rounded:
  field: "6px"
  control: "7px"
  segment: "9px"
  modal: "13px"
spacing:
  compact: "7px"
  panel: "18px"
  dialog: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
---

# Design System: DubStudio

## Overview
The editing desk is an Operate surface. White panels recede around real media; selection and generation state guide attention. The user delegated design decisions and explicitly requested a modern white interface. This record was reconciled with the finished code and desktop/mobile captures.

## Colors
Blue identifies primary actions and active tools. Pale blue, green, purple and amber distinguish video, dubbing, subtitle and music tracks. Neutral white surfaces and thin gray rules divide working regions. Secondary text uses a cooler gray; errors and stale audio also carry text labels so color is not the only signal.

## Typography
Use the system sans stack with locally available Chinese fonts; there is no required remote font download. Narration text is 12px, rising to 13px on large desktops. Utility labels are deliberately compact. Timing values use tabular numerals. Titles use weight and size, without decorative display lettering.

## Layout
The desktop header is 62px. Above 1600px, the transcript and inspector are 365px and 355px wide; the player takes the remaining space. The default grid uses 335px / flexible / 320px columns. The bottom timeline is 300px tall and vertically resizable. Below 900px, inspector tools move into a 310px drawer. Below 650px, the preview stacks above transcript editing and the timeline remains horizontally navigable. Avoid document-level horizontal overflow.

## Elevation & Depth
Working panels are flat and separated by thin rules. Floating notifications, modal dialogs and the small-screen drawer use soft offset shadows. Do not add card shadows to the editor columns.

## Shapes
Fields use 6px corners, controls 7px, transcript rows 9px and dialogs 13px. The small circular play control is a playback affordance. Rounded boxes represent actual controls or editable rows.

## Components
Buttons share hover, disabled and focus vocabulary. Use Lucide icons with visible labels or titles. Inputs use a 2px blue focus outline. A selected transcript row has a pale blue surface; source text remains distinct from editable narration. Stale or failed audio shows an explicit status and recovery action. The AI panel displays changes as source/replacement pairs before application; pending proposals persist in the project. Preview and export use the same subtitle renderer. The timeline uses a native scroll surface and a canvas ruler; clips, cursor and ruler share one time-to-pixel mapping. Ctrl-wheel input is accumulated linearly and painted once per frame with a short 80ms linear transition for discrete wheel notches. Motion is limited to brief control transitions and a task spinner, with reduced-motion support.

## Do's and Don'ts
- Do preserve linked selection across transcript, preview and timeline.
- Do keep narration and subtitle text independently editable.
- Do expose task errors and stale audio in the relevant sentence.
- Do keep the central video free from decorative overlays.
- Don't introduce marketing claims, fake sample projects or decorative card grids.
- Don't use color alone to distinguish queued, ready, failed or stale media.
