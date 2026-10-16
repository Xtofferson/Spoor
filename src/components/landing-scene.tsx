import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const WIDTH = 360;
const HEIGHT = 180;

/**
 * The 4x4, seen from behind as it drives away, is drawn in its own 900 × 510 units (the size
 * of its design) and placed with this scale, so its rear wheels stand on the sand at
 * VEHICLE_X. It's a little bigger than the trailer, being nearer.
 */
const VEHICLE_SCALE = 0.3;
const VEHICLE_X = 270;
const VEHICLE_GROUND = 140;
/** The point in the 4x4's own units that stands on the sand: the middle, under the wheels. */
const VEHICLE_ANCHOR = [720, 347];

type Point = [number, number];
type Dash = { x: number; y: number; angle: number; length: number; width: number };

/** A point along a cubic Bézier curve, t from 0 to 1. */
function cubic([p0, p1, p2, p3]: Point[], t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/**
 * Tread marks along a track that comes towards the viewer: small near the 4x4 and bigger
 * (closer) as they run off the bottom-left of the drawing.
 */
function trackDashes(curve: Point[]): Dash[] {
  const points = Array.from({ length: 121 }, (_, i) => cubic(curve, i / 120));
  const along = [0];
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const total = along[along.length - 1];
  const at = (distance: number) => {
    const i = Math.max(1, along.findIndex((d) => d >= distance));
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const k = (distance - along[i - 1]) / (along[i] - along[i - 1] || 1);
    return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
  };
  const dashes: Dash[] = [];
  for (let distance = 0; distance < total; ) {
    const share = distance / total;
    const length = 2 + 7 * share;
    dashes.push({ ...at(Math.min(distance + length / 2, total)), length, width: 1.6 + 3.4 * share });
    distance += length * 1.55;
  }
  return dashes;
}

/** The two tracks, from the 4x4's rear wheels down and off the bottom-left edge. */
const TRACKS = [
  trackDashes([
    [250, 143],
    [243, 158],
    [170, 156],
    [-12, 166],
  ]),
  trackDashes([
    [290, 143],
    [282, 172],
    [170, 176],
    [-12, 192],
  ]),
];

/** Leaf clumps at the tips of the baobab's stubby branches. */
const BAOBAB_LEAVES = [
  [40, 61],
  [46, 53],
  [55, 47],
  [65, 45],
  [73, 43],
  [83, 44],
  [97, 53],
  [105, 61],
];

/** The sand's surface, a gentle dune line across the drawing. */
const SURFACE = 'M0 144 C 60 137, 120 147, 190 141 S 300 134, 360 139';

/**
 * A greyed-out 4x4 driving away through the sand, its two tracks running back towards the
 * viewer, with a camp in the distance: a baobab, a braai fire under it and an off-road camping
 * trailer. For the empty space on the landing page; it's decoration only, so screen readers
 * skip it.
 */
export function LandingScene({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const color = theme.illustration;
  const hole = theme.background;

  return (
    <View
      style={[styles.frame, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMax meet">
        {/* Sand */}
        <Path d={`${SURFACE} L360 ${HEIGHT} L0 ${HEIGHT} Z`} fill={color} fillOpacity={0.14} />
        <Path d={SURFACE} stroke={color} strokeOpacity={0.35} strokeWidth={2} fill="none" />

        {/* In the distance: a baobab, a braai fire under it, and an off-road camping trailer */}
        <G opacity={0.42}>
          <Path d="M50 142 C 47 120, 53 96, 60 80 L 80 80 C 87 96, 93 120, 90 142 Z" fill={color} />
          <G stroke={color} strokeLinecap="round" fill="none">
            <Path d="M62 82 L 50 66 L 40 64" strokeWidth={5} />
            <Path d="M50 66 L 46 56" strokeWidth={3} />
            <Path d="M66 80 L 60 58" strokeWidth={5} />
            <Path d="M60 58 L 54 50 M60 58 L 64 48" strokeWidth={3} />
            <Path d="M73 80 L 76 54" strokeWidth={5} />
            <Path d="M76 54 L 72 46 M76 54 L 82 47" strokeWidth={3} />
            <Path d="M78 82 L 92 66 L 104 64" strokeWidth={5} />
            <Path d="M92 66 L 96 56" strokeWidth={3} />
          </G>
          <G fill={color} fillOpacity={0.7}>
            {BAOBAB_LEAVES.map(([cx, cy], i) => (
              <Ellipse key={i} cx={cx} cy={cy} rx={7} ry={4} />
            ))}
          </G>
        </G>
        <G opacity={0.55}>
          <G stroke={color} strokeLinecap="round" fill="none">
            <Path d="M93 131 L 115 131" strokeWidth={2} />
            <Path d="M95 131 L 94 142 M113 131 L 114 142" strokeWidth={1.5} />
            <Path d="M97 141 L 111 137 M97 137 L 111 141" strokeWidth={2.5} />
          </G>
          <Path
            d="M104 138 C 98 135, 99 128, 102 123 C 104 128, 107 128, 106 121 C 111 126, 111 135, 104 138 Z"
            fill={color}
          />
          <Path
            d="M104 121 C 100 114, 108 110, 104 102 C 101 96, 107 92, 105 86"
            stroke={color}
            strokeOpacity={0.45}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        </G>
        <G opacity={0.5} transform="translate(6 0)">
          <Rect x={120} y={111} width={48} height={21} rx={3} fill={color} />
          <Rect x={118} y={99} width={52} height={11} rx={2} fill={color} />
          <Path d="M118 99 L 128 90 L 166 90 L 170 99 Z" fill={color} fillOpacity={0.75} />
          <Rect x={126} y={116} width={14} height={8} rx={1.5} fill={hole} fillOpacity={0.6} />
          <Rect x={150} y={115} width={10} height={13} rx={1.5} fill={hole} fillOpacity={0.35} />
          <G stroke={color} strokeWidth={1.5} fill="none">
            <Path d="M116 110 L 112 142 M121 110 L 117 142" />
            <Path d="M115 118 L 120 118 M114 126 L 119 126 M113 134 L 118 134" />
          </G>
          <Path d="M168 128 L 180 132" stroke={color} strokeWidth={3} strokeLinecap="round" />
          <Path d="M179 132 L 179 140" stroke={color} strokeWidth={2} />
          <Circle cx={179} cy={141} r={2} fill={color} />
          <Circle cx={146} cy={134} r={8} fill={color} />
          <Circle cx={146} cy={134} r={3.5} fill={hole} fillOpacity={0.6} />
        </G>

        {/* The 4x4's tracks */}
        <G fill={color} fillOpacity={0.45}>
          {TRACKS.flatMap((dashes, track) =>
            dashes.map((dash, i) => (
              <Rect
                key={`${track}-${i}`}
                x={-dash.length / 2}
                y={-dash.width / 2}
                width={dash.length}
                height={dash.width}
                rx={0.6}
                transform={`translate(${dash.x} ${dash.y}) rotate(${dash.angle})`}
              />
            ))
          )}
        </G>

        {/* The 4x4 from behind: roof rack, cabin, snorkel, spare wheel, bumper and wheels */}
        <G
          transform={`translate(${VEHICLE_X - VEHICLE_ANCHOR[0] * VEHICLE_SCALE} ${
            VEHICLE_GROUND - VEHICLE_ANCHOR[1] * VEHICLE_SCALE
          }) scale(${VEHICLE_SCALE})`}>
          <G fill={color}>
            <Circle cx={582} cy={324} r={10} fillOpacity={0.15} />
            <Circle cx={606} cy={338} r={16} fillOpacity={0.18} />
            <Circle cx={834} cy={338} r={15} fillOpacity={0.18} />
            <Circle cx={858} cy={327} r={9} fillOpacity={0.15} />

            <Rect x={653} y={129} width={47} height={24} rx={3} fillOpacity={0.7} />
            <Rect x={708} y={136} width={30} height={17} rx={2} fillOpacity={0.6} />
            <Rect x={747} y={131} width={16} height={22} rx={2} fillOpacity={0.7} />
            <Rect x={769} y={131} width={16} height={22} rx={2} fillOpacity={0.7} />
            <Rect x={641} y={152} width={158} height={7} rx={3} fillOpacity={0.8} />

            <Path d="M657 165 L 785 165 L 797 218 L 645 218 Z" fillOpacity={0.6} />
            <Rect x={624} y={214} width={192} height={80} rx={8} fillOpacity={0.6} />
            <Rect x={630} y={228} width={12} height={30} rx={4} fillOpacity={0.8} />
            <Rect x={797} y={228} width={12} height={30} rx={4} fillOpacity={0.8} />
            <Circle cx={720} cy={251} r={32} fillOpacity={0.8} />

            <Rect x={633} y={300} width={38} height={47} rx={7} fillOpacity={0.85} />
            <Rect x={768} y={300} width={38} height={47} rx={7} fillOpacity={0.85} />
            <Rect x={617} y={290} width={206} height={17} rx={5} fillOpacity={0.8} />
            <Rect x={713} y={306} width={14} height={11} rx={2} fillOpacity={0.8} />
          </G>
          <Path
            d="M797 163 L 810 176 L 803 216"
            stroke={color}
            strokeOpacity={0.8}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <G fill={hole}>
            <Path d="M667 174 L 775 174 L 783 210 L 659 210 Z" fillOpacity={0.55} />
            <Circle cx={720} cy={251} r={15} fillOpacity={0.6} />
            <Rect x={700} y={293} width={40} height={10} rx={2} fillOpacity={0.6} />
          </G>
          <Circle cx={720} cy={251} r={5} fill={color} fillOpacity={0.8} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // As wide as it's allowed; give it a height (or flex), and the drawing scales to fit at the bottom.
  frame: {
    width: '100%',
  },
});
