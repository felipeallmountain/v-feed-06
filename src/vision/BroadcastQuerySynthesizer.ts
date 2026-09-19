/**
 * BroadcastQuerySynthesizer.ts
 *
 * Pure function / module converting real-time spectator interaction states
 * (Semantic Poses, Audience Density, Kinetic Dynamics, Clothing Chroma, Proximity)
 * into curated YouTube Shorts queries centered on Vintage TV, Classic Sitcoms,
 * News Broadcasts, and Media Archaeology.
 */

export type SemanticPose =
  | 'POSE_ANTENNA'
  | 'POSE_DIAL_TUNER'
  | 'POSE_SURPRISE'
  | 'POSE_WINGSUIT'
  | 'POSE_LOOP_HALO'
  | 'POSE_SIGNAL_LOCK'
  | 'NONE';
export type AudienceDensity = 'SOLO' | 'DUO' | 'GROUP' | 'EMPTY';
export type KineticState = 'HIGH_MOTION' | 'RHYTHMIC' | 'STILLNESS' | 'STEADY';
export type SpatialProximity = 'CLOSE' | 'MEDIUM' | 'FAR';
export type ClothingChroma = 'WARM_RED' | 'DARK_NEUTRAL' | 'COOL_BLUE' | 'NEUTRAL';

export const SCREEN_POSE_MAP: Record<number, Exclude<SemanticPose, 'NONE'>> = {
  0: 'POSE_ANTENNA',     // CRT [01] Top-Left
  1: 'POSE_DIAL_TUNER',  // CRT [02] Top-Right
  2: 'POSE_SURPRISE',    // CRT [03] Mid-Left
  3: 'POSE_WINGSUIT',    // CRT [04] Mid-Right
  4: 'POSE_LOOP_HALO',   // CRT [05] Bot-Left
  5: 'POSE_SIGNAL_LOCK', // CRT [06] Bot-Right
};

export const POSE_DISPLAY_NAMES: Record<Exclude<SemanticPose, 'NONE'>, { title: string; subtitle: string }> = {
  POSE_ANTENNA: { title: 'RABBIT EARS', subtitle: 'VHF DIPOLE' },
  POSE_DIAL_TUNER: { title: 'DIAL TUNER', subtitle: 'YAGI POINT' },
  POSE_SURPRISE: { title: 'TV SHOCK', subtitle: 'COMMERCIAL GASP' },
  POSE_WINGSUIT: { title: 'WINGSUIT', subtitle: 'HORIZONTAL DIPOLE' },
  POSE_LOOP_HALO: { title: 'UHF LOOP', subtitle: 'CIRCULAR HALO' },
  POSE_SIGNAL_LOCK: { title: 'SIGNAL LOCK', subtitle: 'HUMAN CAPACITOR' },
};

export interface InteractionFeatureState {
  pose: SemanticPose;
  density: AudienceDensity;
  kinetics: KineticState;
  proximity: SpatialProximity;
  chroma: ClothingChroma;
  personCount: number;
  kineticEnergy: number; // 0..1
  distanceMeters: number;
}

export interface SynthesizedQuery {
  rawQuery: string;
  category: string;
  sourceTrigger: string;
  chromaModifier: string | null;
  timestampMs: number;
}

// Curated query templates organized by dominant interaction state
const POSE_QUERIES: Record<Exclude<SemanticPose, 'NONE'>, string[]> = {
  POSE_ANTENNA: [
    '#shorts tuning vintage tv rabbit ears',
    '#shorts static crt television commercial',
    '#shorts retro broadcast test pattern signal',
    '#shorts vintage antenna television reception',
    '#shorts 1980s television sign off static',
  ],
  POSE_DIAL_TUNER: [
    '#shorts vintage tv rotary channel selector knob',
    '#shorts clicking channel selector knob vintage tv',
    '#shorts 1970s television tuner knob click',
    '#shorts manual tuning vintage crt television',
    '#shorts retro television antenna rotor controller',
  ],
  POSE_SURPRISE: [
    '#shorts classic tv news bloopers live',
    '#shorts vintage sitcom behind the scenes gags',
    '#shorts retro tv show blooper reel',
    '#shorts live broadcast television flub retro',
    '#shorts 1970s game show bloopers funny',
  ],
  POSE_WINGSUIT: [
    '#shorts skydiving vintage tv broadcast',
    '#shorts wingsuit flight television archive',
    '#shorts 80s aerial acrobatics television',
    '#shorts vintage aviation airshow retro tv',
    '#shorts 1970s hang gliding television report',
  ],
  POSE_LOOP_HALO: [
    '#shorts vintage uhf television broadcast test pattern',
    '#shorts uhf channel static television reception',
    '#shorts retro tv bow tie loop antenna',
    '#shorts vintage broadcast test card color bars',
    '#shorts 1980s public access television channel',
  ],
  POSE_SIGNAL_LOCK: [
    '#shorts 1970s television sign off national anthem static',
    '#shorts retro television transmission tower crystal clear',
    '#shorts vintage broadcast station identification sign on',
    '#shorts analog television audio tone test pattern',
    '#shorts vintage broadcast test pattern signal lock',
  ],
};

const DENSITY_QUERIES: Record<Exclude<AudienceDensity, 'EMPTY'>, string[]> = {
  SOLO: [
    '#shorts retro news anchor monologue',
    '#shorts vintage late night intro monologue',
    '#shorts 1970s television sign off monologue',
    '#shorts retro public access tv host vintage',
    '#shorts 1980s broadcast news anchor solo',
  ],
  DUO: [
    '#shorts retro sitcom dynamic duo scene',
    '#shorts 90s sitcom scene dialogue comedy',
    '#shorts vintage tv debate broadcast duo',
    '#shorts classic buddy sitcom scene 1980s',
    '#shorts vintage co anchors broadcast news',
  ],
  GROUP: [
    '#shorts live studio audience laugh track',
    '#shorts retro game show crowd applause',
    '#shorts vintage tv studio audience reactions',
    '#shorts 1970s variety show studio crowd',
    '#shorts classic television game show contestants',
  ],
};

const KINETIC_QUERIES: Record<Exclude<KineticState, 'STEADY'>, string[]> = {
  HIGH_MOTION: [
    '#shorts vintage dance tv show 80s',
    '#shorts retro action television intro',
    '#shorts 1970s martial arts television show',
    '#shorts retro disco television broadcast',
    '#shorts vintage sports broadcast chaos',
  ],
  RHYTHMIC: [
    '#shorts soul train line vintage dance',
    '#shorts 80s aerobics retro tv broadcast',
    '#shorts vintage music television studio dance',
    '#shorts 1970s funk dance television show',
    '#shorts retro workout video television broadcast',
  ],
  STILLNESS: [
    '#shorts vintage television test pattern',
    '#shorts 1960s news sign off static',
    '#shorts national anthem television sign off retro',
    '#shorts vintage emergency broadcast system test',
    '#shorts retro color bars test pattern crt',
  ],
};

// Contextual Chroma Modifiers
const CHROMA_MODIFIERS: Record<Exclude<ClothingChroma, 'NEUTRAL'>, string> = {
  DARK_NEUTRAL: '1950s black and white tv',
  WARM_RED: 'retro breaking news intro',
  COOL_BLUE: '80s weather forecast retro tv',
};

// Proximity context additions
const PROXIMITY_MODIFIERS: Record<SpatialProximity, string | null> = {
  CLOSE: 'close up',
  MEDIUM: null,
  FAR: 'wide shot',
};

// Rotation index tracker to cycle query variations evenly
let queryVariationIndex = 0;

/**
 * Synthesizes a structured, highly contextual YouTube Shorts query from interaction features.
 */
export function synthesizeBroadcastQuery(state: InteractionFeatureState): SynthesizedQuery {
  let baseTemplate = '';
  let category = 'Broadcast Archive';
  let sourceTrigger = 'KINETICS';
  queryVariationIndex++;

  // 1. Top Priority: Semantic Key Poses
  if (state.pose !== 'NONE' && POSE_QUERIES[state.pose]) {
    const list = POSE_QUERIES[state.pose];
    baseTemplate = list[queryVariationIndex % list.length];
    category = `Pose: ${state.pose.replace('POSE_', '')}`;
    sourceTrigger = state.pose;
  }
  // 2. Second Priority: Audience Density Shift
  else if (state.density !== 'EMPTY' && DENSITY_QUERIES[state.density]) {
    const list = DENSITY_QUERIES[state.density];
    baseTemplate = list[queryVariationIndex % list.length];
    category = `Density: ${state.density}`;
    sourceTrigger = `DENSITY_${state.density}`;
  }
  // 3. Third Priority: Kinetic Dynamics
  else if (state.kinetics !== 'STEADY' && KINETIC_QUERIES[state.kinetics]) {
    const list = KINETIC_QUERIES[state.kinetics];
    baseTemplate = list[queryVariationIndex % list.length];
    category = `Kinetics: ${state.kinetics}`;
    sourceTrigger = `KINETIC_${state.kinetics}`;
  }
  // Default Fallback: General vintage broadcast query
  else {
    const fallbackList = [
      '#shorts vintage television broadcast archive',
      '#shorts retro crt tv commercial compilation',
      '#shorts classic 1970s television channel bumper',
      '#shorts 1980s television sign on broadcast',
    ];
    baseTemplate = fallbackList[queryVariationIndex % fallbackList.length];
    category = 'General Vintage Broadcast';
    sourceTrigger = 'DEFAULT_BROADCAST';
  }

  // 4. Chroma & Proximity Modifiers
  let chromaModifierText: string | null = null;
  if (state.chroma !== 'NEUTRAL' && CHROMA_MODIFIERS[state.chroma]) {
    chromaModifierText = CHROMA_MODIFIERS[state.chroma];
  }

  const proxMod = PROXIMITY_MODIFIERS[state.proximity];

  // Assemble full query string
  const queryParts: string[] = [baseTemplate];
  if (chromaModifierText && !baseTemplate.toLowerCase().includes(chromaModifierText.toLowerCase())) {
    queryParts.push(chromaModifierText);
  }
  if (proxMod && !baseTemplate.toLowerCase().includes(proxMod)) {
    queryParts.push(proxMod);
  }

  const fullQuery = queryParts.join(' ').trim();

  return {
    rawQuery: fullQuery,
    category,
    sourceTrigger,
    chromaModifier: chromaModifierText,
    timestampMs: Date.now(),
  };
}
