import type { BankDefinition } from "@web-audio/schema";

export default {
  basePath:
    "https://raw.githubusercontent.com/andy-stewart-design/samples-loops/main/",
  samples: {
    breaks: [
      "breaks/10_break.wav",
      "breaks/11_break.wav",
      "breaks/12_break.wav",
      "breaks/13_break.wav",
      "breaks/14_break.wav",
    ],
    rhodes: ["rhodes/rhodes-01.mp3"],
  },
} satisfies BankDefinition;
