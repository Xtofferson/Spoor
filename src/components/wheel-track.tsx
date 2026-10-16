import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

const WIDTH = 360;
const HEIGHT = 180;

/** The wheel's centre and the tyre's radius, in the drawing's 360 × 180 units. */
const CX = 258;
const CY = 92;
const TYRE = 46;
/** Notches in the tyre's edge, so it reads as a chunky all-terrain tread. */
const TREAD_NOTCHES = 28;
const RIM_HOLES = 6;
/** Tread marks left in the sand behind the wheel, fading away from it. */
const MARKS = 15;

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
 * A greyed-out 4x4 wheel rolling through sand and leaving its tread track behind, with a
 * camp in the distance: a baobab, a braai fire under it and an off-road camping trailer. For
 * the empty space on the landing page; it's decoration only, so screen readers skip it.
 */
export function WheelTrack({ style }: { style?: StyleProp<ViewStyle> }) {
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
        <Defs>
          <LinearGradient id="track" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={0.3} />
          </LinearGradient>
        </Defs>

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

        {/* The track pressed into the sand, and its tread marks */}
        <Rect x={0} y={144} width={CX - 36} height={16} rx={3} fill="url(#track)" />
        {Array.from({ length: MARKS }, (_, i) => {
          const x = CX - 48 - i * 14;
          const opacity = 0.55 * (1 - i / MARKS);
          return (
            <G key={i} fill={color} fillOpacity={opacity}>
              <Path d={`M${x} 146 l8 0 l-3 5 l-8 0 Z`} />
              <Path d={`M${x + 7} 153 l8 0 l-3 5 l-8 0 Z`} />
            </G>
          );
        })}

        {/* Sand kicked up behind the wheel */}
        <Circle cx={CX - 56} cy={130} r={6} fill={color} fillOpacity={0.16} />
        <Circle cx={CX - 70} cy={123} r={4} fill={color} fillOpacity={0.12} />
        <Circle cx={CX - 82} cy={132} r={3} fill={color} fillOpacity={0.08} />

        {/* Tyre, with notches in its tread */}
        <G transform={`translate(${CX} ${CY})`}>
          <Circle r={TYRE} fill={color} fillOpacity={0.75} />
          {Array.from({ length: TREAD_NOTCHES }, (_, i) => (
            <Rect
              key={i}
              x={-3}
              y={-(TYRE + 1)}
              width={6}
              height={7}
              fill={hole}
              fillOpacity={0.55}
              transform={`rotate(${(i * 360) / TREAD_NOTCHES + 6.4})`}
            />
          ))}
          <Circle r={TYRE - 10} fill="none" stroke={hole} strokeOpacity={0.3} strokeWidth={1.5} />

          {/* Steel rim with six holes, and the hub */}
          <Circle r={25} fill={hole} />
          <Circle r={25} fill={color} fillOpacity={0.25} stroke={color} strokeOpacity={0.7} strokeWidth={3} />
          {Array.from({ length: RIM_HOLES }, (_, i) => {
            const angle = (i * 2 * Math.PI) / RIM_HOLES;
            return (
              <Circle
                key={i}
                cx={15 * Math.cos(angle)}
                cy={15 * Math.sin(angle)}
                r={4}
                fill={hole}
                stroke={color}
                strokeOpacity={0.5}
              />
            );
          })}
          <Circle r={7.5} fill={color} fillOpacity={0.6} />
          <Circle r={2.5} fill={hole} />
        </G>

        {/* Sand heaped against the front of the tyre, so it sits in the sand */}
        <Path d={`M${CX - 34} 140 Q ${CX + 8} 128, ${CX + 56} 140 Z`} fill={color} fillOpacity={0.25} />
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
