type SampleBank = Record<string, string[]>;
type BankedSampleBank = { bank: string; samples: SampleBank; baseUrl?: string };
type SpriteRegion = [number, number];
type SpriteLeaf = SpriteRegion[];
type Banked<T> = T & { bank: string };
type SpriteBank<S> = { src: string; samples: S; baseUrl?: string };
type SpriteSampleBank = SpriteBank<Record<string, SpriteLeaf>>;
type PitchedSpriteSampleBank = SpriteBank<
  Record<string, Record<string, SpriteLeaf>>
>;
type MultiSampleValue = string[] | Record<string, string[]>;
type MultiSampleBank = {
  samples: Record<string, MultiSampleValue>;
  baseUrl?: string;
};
type LoadSamplesInput =
  | SampleBank
  | BankedSampleBank
  | SpriteSampleBank
  | Banked<SpriteSampleBank>
  | PitchedSpriteSampleBank
  | Banked<PitchedSpriteSampleBank>
  | MultiSampleBank
  | Banked<MultiSampleBank>;

export type {
  SampleBank,
  BankedSampleBank,
  SpriteRegion,
  SpriteLeaf,
  Banked,
  SpriteBank,
  SpriteSampleBank,
  PitchedSpriteSampleBank,
  MultiSampleBank,
  LoadSamplesInput,
};
