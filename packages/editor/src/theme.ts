import { EditorView } from "@codemirror/view";

export const theme = EditorView.theme(
  {
    "&": {
      color: "var(--cm-editor-color-foreground)",
      background: "var(--cm-editor-color-background)",
      fontSize: "var(--cm-editor-font-size)",
      height: "var(--cm-editor-block-size)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      overflow: "auto",
      overscrollBehavior: "contain",
      scrollbarWidth: "thin",
      scrollbarColor: "var(--cm-scrollbar-color) transparent",
      lineHeight: 1.6,
    },
    ".cm-content": {
      fontFamily: "var(--cm-editor-font-family)",
      caretColor: "transparent",
      paddingBlockStart: "var(--cm-editor-padding-block-start)",
      paddingBlockEnd: "var(--cm-editor-padding-block-end)",
    },
    "&.cm-focused .cm-cursor": {
      borderLeft: "var(--cm-cursor-width) solid var(--cm-cursor-color)",
    },
    "&.cm-focused .cm-selectionBackground, &.cm-editor > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection":
      {
        backgroundColor: "var(--cm-selection-color-background)",
      },
    ".cm-gutters": {
      background: "var(--cm-gutter-color-background)",
      color: "var(--cm-gutter-color-foreground)",
      fontFamily: "var(--cm-editor-font-family)",
      fontSize: "var(--cm-gutter-font-size)",
      userSelect: "none",
      boxShadow:
        "calc(-1 * var(--cm-gutter-border-width)) 0px 0px 0px var(--cm-gutter-border-color) inset",
    },
    "& .cm-lineNumbers .cm-gutterElement": {
      paddingInline: "0.75rem 0.625rem",
      minWidth: "calc(1.375rem + 2ch)",
    },
    ".cm-line": {
      backgroundColor: "var(--cm-line-color-background)",
      inlineSize: "var(--cm-line-inline-size)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--cm-active-line-color-background-blurred)",
    },
    "&.cm-focused .cm-activeLine": {
      backgroundColor: "var(--cm-active-line-color-background)",
    },
    ".cm-gutterElement": {
      borderInlineEnd: "1px solid transparent",
      backgroundColor: "transparent",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
    },
    "&.cm-focused .cm-activeLineGutter": {
      borderInlineEnd: "1px solid var(--cm-active-gutter-border-color)",
      backgroundColor: "var(--cm-active-gutter-color-background)",
    },
    "& .cm-matchingBracket": {
      backgroundColor: "var(--cm-matching-bracket-color-background-blurred)",
    },
    "&.cm-focused .cm-matchingBracket": {
      backgroundColor: "var(--cm-matching-bracket-color-background)",
    },
  },
  { dark: true },
);
