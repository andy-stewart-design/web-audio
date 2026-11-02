import type Filter from "./filter";
import type GainEffect from "./gain";
import type Saturator from "./saturator";
import type Compressor from "./compressor";

export type Effect = Filter | GainEffect | Saturator;
export type BusEffect = Effect | Compressor;
